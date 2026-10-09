// Confirmation emails, sent through the Gmail API as one Workspace mailbox.
//
// A service account cannot send mail as a person by itself. A Workspace admin
// grants it the gmail.send scope with domain-wide delegation; the service then
// signs a token for `EMAIL_SENDER` through the IAM Credentials API, so no key
// file exists anywhere. Until EMAIL_SENDER is set, sending is skipped and logged.

import { readFileSync } from 'node:fs';
import { google } from 'googleapis';
import { EMAIL_SENDER } from './config.js';
import { normalizeTime } from './time.js';

const SURVEY_FORM =
    'https://docs.google.com/forms/d/e/1FAIpQLSfKpeUm69ZnMKa3Jw7j8HTS2rNevcw3VJPBzJukr90QnkNHdw/viewform' +
    '?usp=pp_url&entry.1124294420=';

const escape = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The Apps Script templates, copied from apps-script/ because a Cloud Run
 * deploy sees only backend/. A test fails when a copy drifts from its original.
 */
const TEMPLATES = {
    confirmation: readFileSync(new URL('../assets/email/ConfirmationEmail.html', import.meta.url), 'utf8'),
    registration: readFileSync(new URL('../assets/email/RegistrationEmail.html', import.meta.url), 'utf8')
};

/**
 * Evaluates the subset of HtmlService scriptlets the templates use: `<?= name ?>`
 * escaped, `<?!= name ?>` as is, and `<? if (name) { ?>...<? } ?>` unnested.
 * A name the values do not supply throws, rather than mailing a blank.
 */
export function render(template, values) {
    const value = name => {
        if (!(name in values)) throw new Error(`Email template needs a value for ${name}.`);
        return values[name];
    };
    return template
        .replace(/<\? if \((\w+)\) \{ \?>([\s\S]*?)<\? \} \?>/g, (_, name, body) => (value(name) ? body : ''))
        .replace(/<\?(!?)=\s*(\w+)\s*\?>/g, (_, raw, name) => (raw ? String(value(name) ?? '') : escape(value(name))));
}

/** 'Wednesday, October 14, 2026' from a '10-14-2026' date of service; anything else as given. */
export function longDate(serviceDate) {
    const match = String(serviceDate ?? '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) return serviceDate;
    return new Date(Date.UTC(match[3], match[1] - 1, match[2])).toLocaleDateString('en-US', {
        timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
}

/** '1:30 PM' from any start time the slot sheet holds, as the page shows it. */
export function clockTime(slotTime) {
    const time = normalizeTime(slotTime);
    if (!time) return slotTime;
    const hours = Number(time.slice(0, 2));
    return `${hours % 12 || 12}:${time.slice(3)} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** The message for a booking, or for a general registration (no appointment). */
export function confirmationMessage({ data, patientID, appointmentID, qrBase64, eventName, eventDate }) {
    const patientName = `${data.demographics?.firstName ?? ''} ${data.demographics?.lastName ?? ''}`.trim();
    const formUrl = SURVEY_FORM + encodeURIComponent(patientID);

    if (!appointmentID) {
        return {
            subject: 'Your registration with Prism Health',
            html: render(TEMPLATES.registration, { patientName, formUrl }),
            inline: null
        };
    }
    return {
        subject: `Your Appointment for ${eventName} on ${eventDate}`,
        html: render(TEMPLATES.confirmation, {
            eventName,
            eventDate: longDate(eventDate),
            apptTime: clockTime(data.slotTime),
            patientName,
            apptID: appointmentID,
            hasQr: Boolean(qrBase64),
            formUrl
        }),
        inline: qrBase64 ? { cid: 'qrImage', base64: qrBase64, filename: 'appt-confirmation.png' } : null
    };
}

/** RFC 2822 with an optional inline PNG, base64url-encoded for the Gmail API. */
export function mime({ from, to, subject, html, inline }) {
    const boundary = `prism-${Math.random().toString(36).slice(2)}`;
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const head = [`From: ${from}`, `To: ${to}`, `Subject: ${encodedSubject}`, 'MIME-Version: 1.0'];
    let body;
    if (!inline) {
        body = [...head, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
            Buffer.from(html).toString('base64')].join('\r\n');
    } else {
        body = [...head, `Content-Type: multipart/related; boundary="${boundary}"`, '',
            `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
            Buffer.from(html).toString('base64'),
            `--${boundary}`, `Content-Type: image/png; name="${inline.filename}"`, 'Content-Transfer-Encoding: base64',
            `Content-ID: <${inline.cid}>`, `Content-Disposition: inline; filename="${inline.filename}"`, '',
            inline.base64,
            `--${boundary}--`, ''].join('\r\n');
    }
    return Buffer.from(body).toString('base64url');
}

export class GmailSender {
    /** @param {import('google-auth-library').GoogleAuth} auth the service's own credentials */
    constructor(auth) {
        this.auth = auth;
        this.token = null;
    }

    /** An access token for EMAIL_SENDER, minted by signing a JWT as the service account. */
    async accessToken() {
        if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
        const client = await this.auth.getClient();
        const email = (await this.auth.getCredentials()).client_email;
        const iam = google.iamcredentials({ version: 'v1', auth: client });
        const now = Math.floor(Date.now() / 1000);
        const { data } = await iam.projects.serviceAccounts.signJwt({
            name: `projects/-/serviceAccounts/${email}`,
            requestBody: {
                payload: JSON.stringify({
                    iss: email, sub: EMAIL_SENDER, scope: 'https://www.googleapis.com/auth/gmail.send',
                    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
                })
            }
        });
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: data.signedJwt })
        });
        const body = await response.json();
        if (!response.ok) throw new Error(`token exchange failed: ${body.error_description || body.error}`);
        this.token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
        return this.token.value;
    }

    async send(to, message) {
        if (!EMAIL_SENDER) {
            console.warn('EMAIL_SENDER is not set; confirmation email skipped.');
            return false;
        }
        const raw = mime({ from: EMAIL_SENDER, to, ...message });
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw })
        });
        if (!response.ok) throw new Error(`Gmail send failed: ${response.status} ${await response.text()}`);
        return true;
    }
}

export class FakeMailer {
    constructor() {
        this.sent = [];
    }
    async send(to, message) {
        this.sent.push({ to, subject: message.subject });
        return true;
    }
}
