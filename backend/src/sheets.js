// The four calls the service makes against Google Sheets.
//
// Everything above this file speaks in whole sheets, rows and 1-based cells, so a
// test can swap in `FakeSheets` and drive the real logic without the network.

import { google } from 'googleapis';
import { TIME_ZONE } from './config.js';
import { sheetTimestamp } from './time.js';

/** `'Appointment Slots'!E5` style references. */
function a1(sheet, row, col, rows = 1, cols = 1) {
    const letter = n => {
        let s = '';
        for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
        return s;
    };
    const start = `${letter(col)}${row}`;
    const end = `${letter(col + cols - 1)}${row + rows - 1}`;
    return `'${sheet.replace(/'/g, "''")}'!${start}:${end}`;
}

export class GoogleSheets {
    constructor(auth) {
        this.api = google.sheets({ version: 'v4', auth });
        this.titles = new Map();
        this.zones = new Map();
    }

    /**
     * The spreadsheet's own time zone, read once.
     *
     * A typed timestamp is stored as wall-clock time in that zone, so writing it
     * in any other zone shifts it - which is what Main DB, an hour behind
     * Chicago, showed when this service first wrote Chicago time into it.
     */
    async timeZone(spreadsheetId) {
        // Re-read every ten minutes, so a workbook whose zone is changed in its
        // settings is followed without restarting the service.
        const cached = this.zones.get(spreadsheetId);
        if (!cached || Date.now() - cached.at > 10 * 60 * 1000) {
            const zone = this.api.spreadsheets
                .get({ spreadsheetId, fields: 'properties.timeZone' })
                .then(({ data }) => data.properties.timeZone || TIME_ZONE)
                .catch(error => {
                    if (cached) return cached.zone;   // keep the last good answer
                    this.zones.delete(spreadsheetId);
                    throw error;
                });
            this.zones.set(spreadsheetId, { zone, at: Date.now() });
        }
        return this.zones.get(spreadsheetId).zone;
    }

    /** `date` as a timestamp cell of this spreadsheet. */
    async stamp(spreadsheetId, date) {
        return sheetTimestamp(date, await this.timeZone(spreadsheetId));
    }

    /**
     * Every row of a sheet as the sheet displays it.
     *
     * Display values on purpose: a range-shaped or time-shaped cell can hold a
     * date behind its format, and what it shows is what the page sent us.
     */
    async read(spreadsheetId, sheet) {
        const { data } = await this.api.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheet.replace(/'/g, "''")}'`,
            valueRenderOption: 'FORMATTED_VALUE'
        });
        return data.values || [];
    }

    /** Appends rows after the last one, parsing values as if typed. */
    async append(spreadsheetId, sheet, rows) {
        if (!rows.length) return;
        await this.api.spreadsheets.values.append({
            spreadsheetId,
            range: `'${sheet.replace(/'/g, "''")}'!A1`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: rows }
        });
    }

    /** Overwrites a block of cells starting at a 1-based row and column. */
    async update(spreadsheetId, sheet, row, col, values) {
        await this.api.spreadsheets.values.update({
            spreadsheetId,
            range: a1(sheet, row, col, values.length, values[0].length),
            valueInputOption: 'USER_ENTERED',
            requestBody: { values }
        });
    }

    /** Creates a sheet with a header row if it does not exist yet. */
    async ensureSheet(spreadsheetId, sheet, header) {
        if (!this.titles.has(spreadsheetId)) {
            const { data } = await this.api.spreadsheets.get({
                spreadsheetId,
                fields: 'sheets.properties.title'
            });
            this.titles.set(spreadsheetId, new Set(data.sheets.map(s => s.properties.title)));
        }
        const titles = this.titles.get(spreadsheetId);
        if (titles.has(sheet)) return;

        await this.api.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: sheet } } }] }
        });
        titles.add(sheet);
        await this.append(spreadsheetId, sheet, [header]);
    }
}

/** In-memory stand-in: `{spreadsheetId: {sheetName: rows}}`, values kept as text. */
export class FakeSheets {
    constructor(books = {}, zones = {}) {
        this.books = books;
        this.zones = zones;
        this.calls = [];
    }

    async timeZone(spreadsheetId) {
        return this.zones[spreadsheetId] || TIME_ZONE;
    }

    async stamp(spreadsheetId, date) {
        return sheetTimestamp(date, await this.timeZone(spreadsheetId));
    }

    sheet(spreadsheetId, sheet) {
        const book = this.books[spreadsheetId];
        if (!book || !book[sheet]) throw new Error(`Unable to parse range: '${sheet}'`);
        return book[sheet];
    }

    async read(spreadsheetId, sheet) {
        this.calls.push(['read', sheet]);
        return this.sheet(spreadsheetId, sheet).map(row => row.map(v => (v === true ? 'TRUE' : v === false ? 'FALSE' : String(v ?? ''))));
    }

    async append(spreadsheetId, sheet, rows) {
        this.calls.push(['append', sheet, rows.length]);
        this.sheet(spreadsheetId, sheet).push(...rows.map(r => r.slice()));
    }

    async update(spreadsheetId, sheet, row, col, values) {
        this.calls.push(['update', sheet, row]);
        const data = this.sheet(spreadsheetId, sheet);
        values.forEach((vals, i) => {
            const target = data[row - 1 + i] || (data[row - 1 + i] = []);
            vals.forEach((v, j) => { target[col - 1 + j] = v; });
        });
    }

    async ensureSheet(spreadsheetId, sheet, header) {
        const book = this.books[spreadsheetId] || (this.books[spreadsheetId] = {});
        if (!book[sheet]) book[sheet] = [header.slice()];
    }
}
