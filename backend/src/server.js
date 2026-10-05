// Production wiring: real Google clients behind the interfaces the logic uses.

import { Firestore } from '@google-cloud/firestore';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { createApp } from './app.js';
import { PORT, SWEEP_CALLER } from './config.js';
import { documentGenerator } from './documents.js';
import { GoogleDrive } from './drive.js';
import { GmailSender } from './email.js';
import { fillers, clinicalRows } from './docs/index.js';
import { GoogleSheets } from './sheets.js';
import { slotActions } from './slots.js';
import { FirestoreStore } from './store.js';
import { submitAction } from './submit.js';

const auth = new GoogleAuth({
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/cloud-platform'
    ]
});

const sheets = new GoogleSheets(auth);
const drive = new GoogleDrive(auth);
// Reserve Drive ids before the first registration needs one.
drive.refill().catch(error => console.warn('Could not reserve Drive ids:', error.message));
const store = new FirestoreStore(new Firestore());
const slots = slotActions({ sheets, store });
const documents = documentGenerator({ drive, sheets, fillers, rows: job => clinicalRows(job, sheets) });
const submitForm = submitAction({ sheets, store, slots, drive, mailer: new GmailSender(auth), documents });

/** Only Cloud Scheduler's service account, with a token minted for this service. */
const verifier = new OAuth2Client();
async function verifySweep(header) {
    const token = /^Bearer (.+)$/.exec(header || '')?.[1];
    if (!token || !SWEEP_CALLER) return false;
    try {
        const ticket = await verifier.verifyIdToken({ idToken: token, audience: process.env.SWEEP_AUDIENCE });
        const claims = ticket.getPayload();
        return claims.email === SWEEP_CALLER && claims.email_verified === true;
    } catch {
        return false;
    }
}

createApp({ slots, submitForm, verifySweep }).listen(PORT, () => {
    console.info(`registration backend listening on ${PORT}`);
});
