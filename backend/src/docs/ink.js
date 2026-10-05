// Signature images, reduced to their ink.
//
// A pad sends its whole canvas: a wide white rectangle with a signature
// somewhere in it. Fitted whole into a 14 pt signature box, the strokes shrink
// to a fraction of a point and the white covers the printed line - the first
// filed WOW consent showed an empty white box. Cropping to the ink and making
// the background transparent keeps the strokes legible at that size.

import { PNG } from 'pngjs';

/** Below this, a pixel counts as ink: dark enough and not transparent. */
const INK_LIGHTNESS = 200;
const INK_ALPHA = 32;
const MARGIN = 4;

/**
 * @param {Buffer} bytes a PNG
 * @returns {Buffer|null} the cropped PNG with a transparent background, or null
 *   when the image holds no ink at all (an untouched pad).
 */
export function inkOnly(bytes) {
    let png;
    try {
        png = PNG.sync.read(bytes);
    } catch {
        return bytes; // not something we can read; let the caller embed it as is
    }
    const { width, height, data } = png;
    let left = width, top = height, right = -1, bottom = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const ink = data[i + 3] > INK_ALPHA &&
                (data[i] + data[i + 1] + data[i + 2]) / 3 < INK_LIGHTNESS;
            if (ink) {
                if (x < left) left = x;
                if (x > right) right = x;
                if (y < top) top = y;
                if (y > bottom) bottom = y;
            } else {
                data[i + 3] = 0; // background becomes transparent
            }
        }
    }
    if (right < 0) return null;

    left = Math.max(0, left - MARGIN);
    top = Math.max(0, top - MARGIN);
    right = Math.min(width - 1, right + MARGIN);
    bottom = Math.min(height - 1, bottom + MARGIN);

    const out = new PNG({ width: right - left + 1, height: bottom - top + 1 });
    PNG.bitblt(png, out, left, top, out.width, out.height, 0, 0);
    return PNG.sync.write(out);
}
