// The registration flow against in-memory sheets: what endpoints.gs did, row for
// row, plus the races and retries that only matter once two people click at once.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    BOOKING_SPREADSHEET_ID as BOOK, MAIN_SPREADSHEET_ID as MAIN, RESPONSES_SPREADSHEET_ID as RESP
} from '../src/config.js';
import { documentGenerator } from '../src/documents.js';
import { FakeDrive } from '../src/drive.js';
import { FakeMailer } from '../src/email.js';
import { FakeSheets } from '../src/sheets.js';
import { slotActions } from '../src/slots.js';
import { MemoryStore } from '../src/store.js';
import { submitAction } from '../src/submit.js';
import { sheetTimestamp } from '../src/time.js';

const NOW = new Date('2026-10-05T15:00:00Z'); // 10:00 in Chicago

function world({ fillers = {} } = {}) {
    const sheets = new FakeSheets({
        [BOOK]: {
            Events: [
                ['CampaignID', 'EventID', 'FacilityID', 'Facility Name', 'Event Name', 'Date'],
                ['c1', 'ev1', 'f1', 'Peoria - Manpower', 'test', '10/3/2026']
            ],
            'Appointment Slots': [
                ['EventID', 'Date', 'Start Time', 'End Time', 'Status', 'Status Timestamp', 'Booked AppointmentID'],
                ['ev1', '2026-10-03 0:00:00', '10:00', '10:05', 'Open', '', ''],
                ['ev1', '2026-10-03 0:00:00', '10:05', '10:10', 'Open', '', ''],
                ['ev1', '2026-10-03 0:00:00', '11:35', '11:40', 'Pending', '10/5/2026 9:20:00', ''],
                ['ev1', '2026-10-03 0:00:00', '11:40', '11:45', 'Pending', '10/5/2026 9:50:00', ''],
                ['ev2', '2026-10-03 0:00:00', '10:00', '10:05', 'Open', '', '']
            ],
            'Appointment Waitlist': [['EventID', 'PatientID']]
        },
        [MAIN]: { Patients: [['h']], Appointments: [['h']], 'Services Rendered': [['h']], Attachments: [['h']] },
        [RESP]: { 'Question Responses': [['PatientID', 'ServiceID', 'QuestionID', 'Answer']] }
    });
    const store = new MemoryStore();
    const slots = slotActions({ sheets, store, now: () => NOW });
    const drive = new FakeDrive();
    const mailer = new FakeMailer();
    const documents = documentGenerator({ drive, sheets, fillers });
    const submitForm = submitAction({ sheets, store, slots, drive, mailer, documents, now: () => NOW });
    return { sheets, store, slots, drive, mailer, submitForm, rows: (id, s) => sheets.books[id][s] };
}

const slotRow = (w, time, event = 'ev1') =>
    w.rows(BOOK, 'Appointment Slots').find(r => r[0] === event && r[2] === time);

function payload(extra = {}) {
    return {
        submissionId: 'sub-1', eventId: 'ev1', slotTime: '10:00', isWaitlist: false,
        selectedServices: [
            { id: 'SHCV0411', serviceTypeId: 'SHCV0411', name: 'School Health Visit (ages 4-11)', formIds: ['shccore', 'shc0411'] },
            { id: 'SHCVAXIM', serviceTypeId: 'SHCVAXIM', name: 'Immunizations', formIds: ['shcvax26'] }
        ],
        formResponses: [
            { questionId: 'shccore-19', answer: 'Pat Test', formId: 'shccore' },
            { questionId: 'shc0411-1', answer: 'Yes', formId: 'shc0411' },
            { questionId: 'shcvax26-1', answer: 'No', formId: 'shcvax26' }
        ],
        signature: 'data:image/png;base64,' + Buffer.from('png').toString('base64'),
        additionalSignatures: [],
        consentDeclines: [{ consentId: 'cfs20267', itemId: 'othertest', label: 'Another test', note: 'Strep' }],
        demographics: { firstName: 'Test', lastName: 'Declines', dob: '2018-04-02', email: 'x@example.com', zip: '60601' },
        insurance: {},
        consentCalls: true, consentTexts: true, consentEmails: true, electronicConsent: true, vaxConsent: true,
        ...extra
    };
}

test('booking takes an open slot and stamps it in Chicago time', async () => {
    const w = world();
    const result = await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00', holdToken: 'tok' });
    assert.equal(result.message, 'Slot reserved.');
    assert.deepEqual(slotRow(w, '10:00').slice(4, 6), ['Pending', '10/5/2026 10:00:00']);
});

test('the sheet\'s own time text matches whatever the page sends', async () => {
    const w = world();
    await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:05 AM' });
    assert.equal(slotRow(w, '10:05')[4], 'Pending');
});

test('a taken slot is refused, but the holder\'s own retry succeeds', async () => {
    const w = world();
    await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00', holdToken: 'mine' });
    await assert.rejects(w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00', holdToken: 'theirs' }),
        { code: 'SLOT_UNAVAILABLE' });
    const retry = await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00', holdToken: 'mine' });
    assert.equal(retry.replayed, true);
});

test('five people clicking one slot at once: exactly one gets it', async () => {
    const w = world();
    const outcomes = await Promise.allSettled(
        [1, 2, 3, 4, 5].map(n => w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00', holdToken: `t${n}` }))
    );
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
    assert.ok(outcomes.filter(o => o.status === 'rejected').every(o => o.reason.code === 'SLOT_UNAVAILABLE'));
});

test('releasing reopens a pending slot and is safe to repeat', async () => {
    const w = world();
    await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00', holdToken: 't' });
    assert.equal((await w.slots.releaseSlot({ eventId: 'ev1', startTime: '10:00' })).message, 'Slot released.');
    assert.equal(slotRow(w, '10:00')[4], 'Open');
    assert.equal((await w.slots.releaseSlot({ eventId: 'ev1', startTime: '10:00' })).message, 'Slot was not in a pending state.');
});

test('the sweep reopens holds past 25 minutes and leaves fresh ones', async () => {
    const w = world();
    const result = await w.slots.sweep();
    assert.equal(result.reopened, 1);
    assert.equal(slotRow(w, '11:35')[4], 'Open');    // held since 9:20, 40 minutes ago
    assert.equal(slotRow(w, '11:40')[4], 'Pending'); // held since 9:50, 10 minutes ago
});

test('a registration writes every record endpoints.gs wrote, in its column order', async () => {
    const w = world();
    await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00', holdToken: 't' });
    const result = await w.submitForm(payload());

    assert.equal(result.status, 'success');
    assert.ok(result.appointmentID && result.qrBase64.length > 100);
    assert.deepEqual(slotRow(w, '10:00').slice(4), ['Booked', sheetTimestamp(NOW), result.appointmentID]);

    const [patient] = w.rows(MAIN, 'Patients').slice(1);
    assert.equal(patient.length, 44);
    assert.equal(patient[1].length, 36);                     // PatientID
    assert.deepEqual(patient.slice(2, 5), ['f1', 'Peoria - Manpower', 'Test']);
    assert.equal(patient[35], 'https://drive.google.com/file/d/fake1/view?usp=drivesdk');
    assert.deepEqual(patient.slice(37, 42), [true, true, true, true, true]);

    const [appt] = w.rows(MAIN, 'Appointments').slice(1);
    assert.deepEqual([appt[0], appt[9], appt[11], appt[12]], [result.appointmentID, '10-03-2026', 'ev1', '10:00']);

    const services = w.rows(MAIN, 'Services Rendered').slice(1);
    assert.deepEqual(services.map(s => s[9]), ['SHCV0411', 'SHCVAXIM']);

    const responses = w.rows(RESP, 'Question Responses').slice(1);
    const serviceOf = id => services.find(s => s[9] === id)[0];
    assert.deepEqual(responses.map(r => [r[2], r[1]]), [
        ['shccore-19', serviceOf('SHCV0411')],
        ['shc0411-1', serviceOf('SHCV0411')],
        ['shcvax26-1', serviceOf('SHCVAXIM')]
    ]);

    const declines = w.rows(RESP, 'Consent Declines');
    assert.deepEqual(declines[0], ['Timestamp', 'PatientID', 'AppointmentID', 'ConsentID', 'ItemID', 'Item Label', 'Note']);
    assert.deepEqual(declines[1].slice(2), [result.appointmentID, 'cfs20267', 'othertest', 'Another test', 'Strep']);

    assert.deepEqual(w.mailer.sent, [{ to: 'x@example.com', subject: 'Your Appointment for test on 10-03-2026' }]);
});

test('each sheet gets one write, however many rows', async () => {
    const w = world();
    await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00' });
    w.sheets.calls.length = 0;
    await w.submitForm(payload());
    const appends = w.sheets.calls.filter(c => c[0] === 'append').map(c => c[1]);
    assert.deepEqual(appends.sort(),
        ['Appointments', 'Consent Declines', 'Patients', 'Question Responses', 'Services Rendered'].sort());
});

test('a repeated submission replays its result and writes nothing', async () => {
    const w = world();
    await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00' });
    const first = await w.submitForm(payload());
    const before = JSON.stringify(w.sheets.books);
    const again = await w.submitForm(payload());
    assert.deepEqual(again, first);
    assert.equal(JSON.stringify(w.sheets.books), before);
});

test('an expired hold refuses the registration before anything is written', async () => {
    const w = world();
    await assert.rejects(w.submitForm(payload()), { code: 'SLOT_EXPIRED' });
    assert.equal(w.rows(MAIN, 'Patients').length, 1);
    assert.equal(w.drive.files.length, 0);
});

test('an unknown event is refused by name', async () => {
    const w = world();
    await assert.rejects(w.submitForm(payload({ eventId: 'nope' })), { code: 'UNKNOWN_EVENT' });
});

test('a waitlist entry records the patient and the event, no slot', async () => {
    const w = world();
    const result = await w.submitForm(payload({ isWaitlist: true, slotTime: '' }));
    assert.equal(result.isWaitlist, true);
    assert.equal(w.rows(BOOK, 'Appointment Waitlist')[1][1], result.patientID);
    assert.equal(w.rows(MAIN, 'Appointments').length, 1);
});

test('a filled document is uploaded and logged once per service that used it', async () => {
    const fillers = {
        shccore: async () => [{
            name: 'DeclinesTest_Core_10032026.pdf', bytes: Buffer.from('%PDF'),
            folderId: 'folder', folderPath: 'Completed Forms/School Health/', description: 'School Health core'
        }]
    };
    const w = world({ fillers });
    await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00' });
    const result = await w.submitForm(payload());
    const attachments = w.rows(MAIN, 'Attachments').slice(1);
    assert.equal(attachments.length, 1); // only SHCV0411 lists shccore
    const row = attachments[0];
    assert.equal(row.length, 18);
    assert.deepEqual([row[1], row[9], row[10], row[11], row[17]],
        [result.appointmentID, '10-03-2026', 'School Health core', 'File', 'Completed Forms/School Health/DeclinesTest_Core_10032026.pdf']);
});

test('the signature link in Patients is the file that was uploaded', async () => {
    const w = world();
    await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00' });
    await w.submitForm(payload());
    const [patient] = w.rows(MAIN, 'Patients').slice(1);
    const sig = w.drive.files.find(f => f.mimeType === 'image/png');
    assert.equal(patient[35], `https://drive.google.com/file/d/${sig.id}/view?usp=drivesdk`);
});

test('a registration whose records fail logs no documents and sends no email', async () => {
    const fillers = { shccore: async () => [{ name: 'x.pdf', bytes: Buffer.from('%PDF'), folderId: 'f', folderPath: 'p/', description: 'd' }] };
    const w = world({ fillers });
    await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00' });
    const append = w.sheets.append.bind(w.sheets);
    w.sheets.append = async (id, sheet, rows) => {
        if (sheet === 'Appointments') throw new Error('quota');
        return append(id, sheet, rows);
    };
    await assert.rejects(w.submitForm(payload()), /quota/);
    await new Promise(r => setTimeout(r, 20));
    assert.equal(w.rows(MAIN, 'Attachments').length, 1);
    assert.deepEqual(w.mailer.sent, []);
});

test('a failing filler costs the document, never the registration', async () => {
    const w = world({ fillers: { shccore: async () => { throw new Error('boom'); } } });
    await w.slots.bookSlot({ eventId: 'ev1', startTime: '10:00' });
    assert.equal((await w.submitForm(payload())).status, 'success');
});
