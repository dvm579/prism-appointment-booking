// The confirmation emails: the same templates Apps Script sends, filled the same way.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clockTime, confirmationMessage, longDate, render } from '../src/email.js';

const booking = (extra = {}) => confirmationMessage({
    data: { demographics: { firstName: 'Ana', lastName: 'López <Jr>' }, slotTime: '13:05:00' },
    patientID: 'p-1', appointmentID: 'a-1', qrBase64: 'cXI=', eventName: 'Back to School', eventDate: '10-14-2026',
    ...extra
});

for (const name of ['ConfirmationEmail.html', 'RegistrationEmail.html']) {
    test(`${name} is the Apps Script template, unchanged`, () => {
        const copy = readFileSync(new URL(`../assets/email/${name}`, import.meta.url), 'utf8');
        const original = readFileSync(new URL(`../../apps-script/${name}`, import.meta.url), 'utf8');
        assert.equal(copy, original);
    });
}

test('a booking fills every value, escaped, and attaches the QR code', () => {
    const message = booking();
    assert.equal(message.subject, 'Your Appointment for Back to School on 10-14-2026');
    assert.doesNotMatch(message.html, /<\?/);
    assert.match(message.html, /Wednesday, October 14, 2026/);
    assert.match(message.html, /1:05 PM/);
    assert.match(message.html, /Ana López &lt;Jr&gt;/);
    assert.match(message.html, /href="https:\/\/docs\.google\.com\/forms\/[^"]*entry\.1124294420=p-1"/);
    assert.match(message.html, /src="cid:qrImage"/);
    assert.equal(message.inline.cid, 'qrImage');
});

test('a booking without a QR code shows no broken image', () => {
    const message = booking({ qrBase64: '' });
    assert.doesNotMatch(message.html, /cid:qrImage/);
    assert.equal(message.inline, null);
});

test('a general registration has its own message', () => {
    const message = booking({ appointmentID: '' });
    assert.equal(message.subject, 'Your registration with Prism Health');
    assert.doesNotMatch(message.html, /<\?/);
    assert.match(message.html, /registration for <strong>Ana López &lt;Jr&gt;<\/strong>/);
});

test('a template value nobody supplied throws instead of mailing a blank', () => {
    assert.throws(() => render('<p><?= missing ?></p>', {}), /missing/);
});

test('dates and times read as the page shows them', () => {
    assert.equal(longDate('01-02-2027'), 'Saturday, January 2, 2027');
    assert.equal(longDate(''), '');
    assert.equal(clockTime('9:00 AM'), '9:00 AM');
    assert.equal(clockTime('00:30'), '12:30 AM');
    assert.equal(clockTime('12:00'), '12:00 PM');
    assert.equal(clockTime('soon'), 'soon');
});
