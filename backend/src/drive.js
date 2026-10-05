// Files in the EMR attachments folder: signature PNGs and generated PDFs.

import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { UPLOAD_FOLDER_ID } from './config.js';

/** The link shape Apps Script's File.getUrl() produced, which existing rows hold. */
export function driveUrl(id) {
    return `https://drive.google.com/file/d/${id}/view?usp=drivesdk`;
}

export class GoogleDrive {
    constructor(auth) {
        this.api = google.drive({ version: 'v3', auth });
        this.ids = [];
        this.refilling = null;
    }

    /**
     * A Drive file id, before the file exists.
     *
     * Drive hands out ids in advance, so a row can carry a file's link while the
     * upload is still running beside it rather than ahead of it. Ids come from a
     * pool topped up in the background; an empty pool waits for one refill.
     */
    async reserveId() {
        if (this.ids.length < 20) this.refill();
        if (!this.ids.length) await this.refilling;
        return this.ids.pop();
    }

    refill() {
        this.refilling ||= this.api.files
            .generateIds({ count: 100, space: 'drive', type: 'files' })
            .then(({ data }) => { this.ids.push(...data.ids); })
            .finally(() => { this.refilling = null; });
        return this.refilling;
    }

    /** @returns {{id: string, url: string, name: string}} */
    async upload(name, mimeType, buffer, folderId = UPLOAD_FOLDER_ID, id = undefined) {
        const { data } = await this.api.files.create({
            requestBody: { name, parents: [folderId], ...(id && { id }) },
            media: { mimeType, body: Readable.from(buffer) },
            fields: 'id',
            supportsAllDrives: true
        });
        return { id: data.id, url: driveUrl(data.id), name };
    }
}

export class FakeDrive {
    constructor() {
        this.files = [];
        this.next = 0;
    }
    async reserveId() {
        return `fake${++this.next}`;
    }
    async upload(name, mimeType, buffer, folderId, id) {
        id ||= `fake${++this.next}`;
        this.files.push({ id, name, mimeType, bytes: buffer.length, folderId });
        return { id, url: driveUrl(id), name };
    }
}

/** The bytes of a `data:image/png;base64,...` URL, or null for none. */
export function dataUrlBytes(dataUrl) {
    const raw = String(dataUrl ?? '');
    const comma = raw.indexOf(',');
    return comma === -1 ? null : Buffer.from(raw.slice(comma + 1), 'base64');
}
