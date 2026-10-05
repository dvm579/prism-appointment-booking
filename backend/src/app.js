// HTTP surface. The registration page posts `{action, payload}` exactly as it
// did to the Apps Script web app, so switching backends is a URL change.
//
// Bodies arrive as text/plain on purpose: it keeps the browser's request
// "simple" under CORS (no preflight), and navigator.sendBeacon can only send it.
// Every answer is JSON with HTTP 200, structured errors included, matching the
// contract src/api.js was written against.

import express from 'express';
import { ALLOWED_ORIGINS } from './config.js';

export function createApp({ slots, submitForm, verifySweep }) {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.text({ type: () => true, limit: '25mb' }));

    app.use((req, res, next) => {
        const origin = req.get('origin');
        if (origin && ALLOWED_ORIGINS.includes(origin)) {
            res.set('Access-Control-Allow-Origin', origin);
            res.set('Vary', 'Origin');
            res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Content-Type');
        }
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });

    const actions = {
        bookSlot: payload => slots.bookSlot(payload),
        releaseSlot: payload => slots.releaseSlot(payload),
        submitForm: payload => submitForm(payload)
    };

    app.post('/', async (req, res) => {
        let request;
        try {
            request = JSON.parse(req.body || '');
        } catch {
            return res.json({ status: 'error', code: 'EMPTY_REQUEST', message: 'No request body was received.' });
        }

        const action = actions[request?.action];
        if (!action) {
            return res.json({ status: 'error', code: 'UNKNOWN_ACTION', message: 'Invalid action specified.' });
        }

        try {
            res.json(await action(request.payload || {}));
        } catch (error) {
            // Never the payload: it is a patient's registration.
            console.error(`${request.action} failed: ${error.code || 'UNHANDLED'} ${error.message}`);
            res.json({ status: 'error', code: error.code || 'UNHANDLED', message: error.code ? error.message
                : 'Something went wrong on our side. Please try again.' });
        }
    });

    /** Cloud Scheduler, every five minutes. Authenticated, never public. */
    app.post('/jobs/sweep', async (req, res) => {
        if (!(await verifySweep(req.get('authorization')))) return res.sendStatus(403);
        try {
            res.json(await slots.sweep());
        } catch (error) {
            console.error('sweep failed:', error.message);
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    app.get('/healthz', (req, res) => res.send('ok'));
    return app;
}
