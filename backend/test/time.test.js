import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTime, parseSheetDate, serviceDate, sheetTimestamp, wallClockToEpoch } from '../src/time.js';

test('slot times compare however the sheet formats them', () => {
    for (const [input, want] of [['9:00', '09:00'], ['09:00', '09:00'], ['11:00:00', '11:00'],
        ['9:00 AM', '09:00'], ['12:30 pm', '12:30'], ['12:05 AM', '00:05'], ['2:40 p.m.', '14:40'],
        ['', ''], ['noon', ''], ['25:00', '']]) {
        assert.equal(normalizeTime(input), want, input);
    }
});

test('timestamps are Chicago wall-clock, across the daylight-saving change', () => {
    assert.equal(sheetTimestamp(new Date('2026-10-05T14:14:01Z')), '10/5/2026 9:14:01');   // CDT
    assert.equal(sheetTimestamp(new Date('2026-12-05T14:14:01Z')), '12/5/2026 8:14:01');   // CST
    assert.equal(wallClockToEpoch(parseSheetDate('10/5/2026 9:14:01')), Date.parse('2026-10-05T14:14:01Z'));
    assert.equal(wallClockToEpoch(parseSheetDate('12/5/2026 8:14:01')), Date.parse('2026-12-05T14:14:01Z'));
    assert.equal(wallClockToEpoch(parseSheetDate('11/1/2026 3:00:00')), Date.parse('2026-11-01T09:00:00Z'));
});

test('dates of service come out MM-dd-yyyy from any display form', () => {
    assert.equal(serviceDate('10/3/2026'), '10-03-2026');
    assert.equal(serviceDate('2026-10-03 0:00:00'), '10-03-2026');
    assert.equal(serviceDate('10/3/2026 1:05:00 PM'), '10-03-2026');
    assert.equal(serviceDate(''), '');
});
