// The four WOW forms filled from an answer to every live question. Reads the
// published Form Questions CSV, so it needs the network; it skips without it.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { MAPS } from '../src/docs/wow/maps.js';
import { wowFillers } from '../src/docs/wow/index.js';
import fields from '../src/docs/wow/fields.json' with { type: 'json' };
import { answersFor } from '../fixtures/answers.js';

const forms = Object.keys(wowFillers);
let responses = null;
try {
    responses = await answersFor(forms);
} catch {
    // offline
}

const job = extra => ({
    data: { demographics: { firstName: 'Ana', lastName: 'Test', dob: '1984-07-19' }, formResponses: responses || [], ...extra },
    patientID: 'p', appointmentID: 'a',
    event: { facilityID: 'f', facilityName: 'Facility', dateOfService: '10-03-2026' }
});

test('every placed field has a value in its form\'s map', () => {
    for (const formId of forms) {
        const map = MAPS[formId]({}, {});
        const missing = fields[formId].fields.filter(f => f.kind !== 'i' && !(f.token in map));
        assert.deepEqual(missing.map(f => f.token), [], formId);
    }
});

test('each form fills into a valid PDF of its original length, fast', { skip: !responses && 'offline' }, async () => {
    const started = Date.now();
    for (const formId of forms) {
        const [pdf] = await wowFillers[formId](job());
        const doc = await PDFDocument.load(pdf.bytes);
        assert.equal(doc.getPageCount(), fields[formId].pages, formId);
        assert.match(pdf.name, /^TestAna_.+_10032026\.pdf$/);
        assert.equal(pdf.folderPath, 'Completed Forms/Wellness on Wheels/');
    }
    assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
});

test('a registration with no signature at all still produces every form', { skip: !responses && 'offline' }, async () => {
    for (const formId of forms) {
        const [pdf] = await wowFillers[formId](job({ signature: '', additionalSignatures: [] }));
        assert.ok(pdf.bytes.length > 1000, formId);
    }
});
