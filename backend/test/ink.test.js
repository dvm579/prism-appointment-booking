import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { inkOnly } from '../src/docs/ink.js';

/** A white 600x200 pad with a dark stroke across x 100..300 at y 90..110. */
function pad({ stroke = true } = {}) {
    const png = new PNG({ width: 600, height: 200 });
    for (let i = 0; i < png.data.length; i += 4) png.data.set([255, 255, 255, 255], i);
    if (stroke) {
        for (let y = 90; y <= 110; y++) for (let x = 100; x <= 300; x++) png.data.set([20, 20, 60, 255], (y * 600 + x) * 4);
    }
    return PNG.sync.write(png);
}

test('a signature is cropped to its ink, with a transparent background', () => {
    const out = PNG.sync.read(inkOnly(pad()));
    assert.equal(out.width, 201 + 8);
    assert.equal(out.height, 21 + 8);
    assert.equal(out.data[3], 0);                                  // corner: transparent
    const mid = ((out.height >> 1) * out.width + (out.width >> 1)) * 4;
    assert.ok(out.data[mid + 3] > 200 && out.data[mid] < 100);     // stroke: kept
});

test('an untouched pad yields nothing to draw', () => {
    assert.equal(inkOnly(pad({ stroke: false })), null);
});
