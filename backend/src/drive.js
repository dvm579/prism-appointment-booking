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
    }

    /** @returns {{id: string, url: string, name: string}} */
    async upload(name, mimeType, buffer, folderId = UPLOAD_FOLDER_ID) {
        const { data } = await this.api.files.create({
            requestBody: { name, parents: [folderId] },
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
    }
    async upload(name, mimeType, buffer) {
        const id = `fake${this.files.length + 1}`;
        this.files.push({ id, name, mimeType, bytes: buffer.length });
        return { id, url: driveUrl(id), name };
    }
}

/** The bytes of a `data:image/png;base64,...` URL, or null for none. */
export function dataUrlBytes(dataUrl) {
    const raw = String(dataUrl ?? '');
    const comma = raw.indexOf(',');
    return comma === -1 ? null : Buffer.from(raw.slice(comma + 1), 'base64');
}
