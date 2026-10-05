// Fills a form by drawing onto its original artwork.
//
// None of the forms has fillable fields, so every value goes at a measured
// position: a check mark centred in a printed box, text sitting on a printed
// line, wrapped text inside a write-in area, a signature image in its box.
// Positions use the convention of apps-script/tools/makeWowSlidesTemplates.gs:
// points from the top-left of the page. pdf-lib measures from the bottom-left,
// so `y` flips here and nowhere else.

import fs from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const INK = rgb(0.05, 0.1, 0.45);
const MIN_SIZE = 6;
const sources = new Map();

/** The artwork, read once per process. */
export function artwork(path) {
    if (!sources.has(path)) sources.set(path, fs.readFileSync(path));
    return sources.get(path);
}

/**
 * The text with anything the standard font cannot encode replaced.
 *
 * Helvetica covers Latin-1, so accented names survive; a script it has no
 * glyphs for becomes '?' rather than failing the whole document.
 */
function encodable(font, text) {
    let out = '';
    for (const ch of String(text).replace(/\s+/g, ' ')) {
        try {
            font.encodeText(ch);
            out += ch;
        } catch {
            out += '?';
        }
    }
    return out;
}

/** Shrinks to fit the width, down to a floor; past the floor, truncates. */
function fitLine(font, text, size, width) {
    let s = size;
    while (s > MIN_SIZE && font.widthOfTextAtSize(text, s) > width) s -= 0.5;
    let t = text;
    while (t.length > 1 && font.widthOfTextAtSize(t, s) > width) t = t.slice(0, -1);
    return { text: t, size: s };
}

/** Greedy word wrap into as many lines as the area holds, shrinking if needed. */
function wrap(font, text, size, width, height) {
    for (let s = size; s >= MIN_SIZE; s -= 0.5) {
        const lines = [];
        let line = '';
        for (const word of text.split(' ')) {
            const next = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(next, s) <= width || !line) line = next;
            else { lines.push(line); line = word; }
        }
        if (line) lines.push(line);
        if (lines.length * s * 1.15 <= height || s === MIN_SIZE) {
            return { lines: lines.slice(0, Math.max(1, Math.floor(height / (s * 1.15)))), size: s };
        }
    }
    return { lines: [text], size: MIN_SIZE };
}

/**
 * @param {Buffer} source the blank form
 * @param {Array<{page, kind, left, top, width, height, size, key}>} fields
 *   kind: 'c' check, 't' line of text, 'a' write-in area, 'i' image
 * @param {(field) => string|boolean|Buffer|null} valueOf
 *   a check is drawn when truthy; text and areas take a string; an image takes PNG bytes
 * @returns {Promise<Uint8Array>}
 */
export async function fillPdf(source, fields, valueOf) {
    const doc = await PDFDocument.load(source);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();

    for (const field of fields) {
        const page = pages[field.page - 1];
        const value = valueOf(field);
        if (!page || value === null || value === undefined || value === '' || value === false) continue;
        const H = page.getHeight();

        if (field.kind === 'c') {
            const size = Math.min(field.height, field.width) * 1.05;
            const w = font.widthOfTextAtSize('X', size);
            page.drawText('X', {
                x: field.left + (field.width - w) / 2,
                y: H - field.top - field.height / 2 - size * 0.35,
                size, font, color: INK
            });
        } else if (field.kind === 'i') {
            const image = await doc.embedPng(value);
            const scale = Math.min(field.width / image.width, field.height / image.height);
            const w = image.width * scale;
            const h = image.height * scale;
            page.drawImage(image, { x: field.left, y: H - field.top - field.height + (field.height - h) / 2, width: w, height: h });
        } else if (field.kind === 'a') {
            const { lines, size } = wrap(font, encodable(font, value), field.size || 9, field.width, field.height);
            lines.forEach((line, i) => page.drawText(line, {
                x: field.left, y: H - field.top - size * (1 + i * 1.15), size, font, color: INK
            }));
        } else {
            const { text, size } = fitLine(font, encodable(font, value), field.size || 9, field.width);
            // On the printed rule: the baseline sits a little above the box's bottom.
            page.drawText(text, {
                x: field.left, y: H - field.top - field.height + Math.max(1.5, (field.height - size) / 2),
                size, font, color: INK
            });
        }
    }
    return doc.save();
}
