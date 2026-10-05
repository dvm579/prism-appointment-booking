// Chicago wall-clock time, in the shapes the sheets hold.
//
// Apps Script wrote JavaScript Dates and Sheets stored them in the
// spreadsheet's time zone. The Sheets API takes strings instead, so a timestamp
// is written as the text a person in Chicago would type, and USER_ENTERED turns
// it back into a date-time cell exactly like the old rows.

import { TIME_ZONE } from './config.js';

function parts(date, zone = TIME_ZONE) {
    const fields = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const out = {};
    for (const { type, value } of fields) if (type !== 'literal') out[type] = Number(value);
    return out;
}

/** `10/5/2026 9:14:01` — a timestamp cell, as the sheet displays one. */
export function sheetTimestamp(date) {
    const p = parts(date);
    return `${p.month}/${p.day}/${p.year} ${p.hour}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')}`;
}

/** `10-03-2026` — the date-of-service shape every generator and row expects. */
export function serviceDate(value) {
    const d = parseSheetDate(value);
    if (!d) return '';
    return `${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}-${d.year}`;
}

/**
 * Reads a date cell's display text: `10/3/2026`, `2026-10-03`, optionally with a
 * time. Returns calendar parts, not a Date, because the cell has no time zone.
 */
export function parseSheetDate(value) {
    const raw = String(value ?? '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(raw);
    if (m) return { year: +m[1], month: +m[2], day: +m[3], hour: +(m[4] || 0), minute: +(m[5] || 0), second: +(m[6] || 0) };
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/.exec(raw);
    if (!m) return null;
    let hour = +(m[4] || 0);
    if (m[7]) {
        const pm = /p/i.test(m[7]);
        if (pm && hour < 12) hour += 12;
        if (!pm && hour === 12) hour = 0;
    }
    return { year: +m[3], month: +m[1], day: +m[2], hour, minute: +(m[5] || 0), second: +(m[6] || 0) };
}

/** The instant a Chicago wall-clock reading refers to. */
export function wallClockToEpoch({ year, month, day, hour = 0, minute = 0, second = 0 }, zone = TIME_ZONE) {
    const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    // The zone's offset at that moment, found by asking how it would display it.
    const shown = parts(new Date(asUtc), zone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    const offset = shownAsUtc - asUtc;
    // A second pass settles readings that sit next to a daylight-saving change.
    const first = asUtc - offset;
    const again = parts(new Date(first), zone);
    const againAsUtc = Date.UTC(again.year, again.month - 1, again.day, again.hour, again.minute, again.second);
    return first - (againAsUtc - asUtc);
}

/**
 * Canonical `HH:mm` of a slot start time.
 *
 * The sheet may display `9:00`, `09:00`, `9:00 AM` or `11:00:00`, and the page
 * sends the sheet's own text back. Every comparison goes through here, exactly
 * as `normalizeTime_` did in endpoints.gs.
 */
export function normalizeTime(value) {
    const match = String(value ?? '')
        .trim()
        .match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([AaPp])\.?[Mm]?\.?)?$/);
    if (!match) return '';

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const meridiem = match[3] ? match[3].toLowerCase() : null;
    if (meridiem === 'p' && hours < 12) hours += 12;
    if (meridiem === 'a' && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return '';
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
