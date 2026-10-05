// The School Health forms, from an answer to every live question.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { chose, shcFillers } from '../src/docs/shc/index.js';
import fields from '../src/docs/shc/fields.json' with { type: 'json' };
import { answersFor, questionsFor } from '../fixtures/answers.js';

const FORMS = ['shccore', 'shc0003', 'shc0411', 'shc1217', 'shcadult', 'shcvax26'];
let responses = null, questions = null;
try {
    [responses, questions] = await Promise.all([answersFor(FORMS), questionsFor(FORMS)]);
} catch {
    // offline
}

test('a check is drawn for the chosen option and only that one', () => {
    assert.equal(chose('Yes', 'Yes'), true);
    assert.equal(chose('Yes', 'No'), false);
    assert.equal(chose('Check-up, Sick or a problem', 'Sick or a problem'), true);
    assert.equal(chose('Check-up, Sick or a problem', 'Sick'), false);
    assert.equal(chose('', 'Yes'), false);
});

test('every check carries an option its question actually offers', { skip: !questions && 'offline' }, () => {
    const options = Object.fromEntries(questions.map(q => [q.QuestionID, q.Options.split('|').map(s => s.trim())]));
    for (const [formId, form] of Object.entries(fields)) {
        for (const f of form.fields.filter(x => x.kind === 'check')) {
            assert.ok(options[f.q]?.includes(f.option), `${formId} ${f.q} "${f.option}"`);
        }
    }
});

test('every page carries the patient header', () => {
    for (const [formId, form] of Object.entries(fields)) {
        for (let page = 1; page <= form.pages; page++) {
            const keys = form.fields.filter(f => f.page === page && f.q.startsWith('@')).map(f => f.q).sort();
            assert.deepEqual(keys, ['@dob', '@name', '@visit'], `${formId} page ${page}`);
        }
    }
});

test('each form fills into a valid PDF of its original length', { skip: !responses && 'offline' }, async () => {
    const job = {
        data: { demographics: { firstName: 'Ana', lastName: 'Test', dob: '2018-04-02' }, formResponses: responses },
        patientID: 'p', appointmentID: 'a',
        event: { facilityID: 'f', facilityName: 'Facility', dateOfService: '10-03-2026' }
    };
    for (const [formId, fill] of Object.entries(shcFillers)) {
        const [pdf] = await fill(job);
        assert.equal((await PDFDocument.load(pdf.bytes)).getPageCount(), fields[formId].pages, formId);
        assert.equal(pdf.folderPath, 'Completed Forms/School Health/');
    }
});
