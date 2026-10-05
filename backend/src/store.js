// Short-lived state that Apps Script kept in CacheService.
//
// Two kinds, both keyed so a retry finds what the first attempt left:
//   holds        eventId|HH:mm -> the client token that took a 'Pending' slot
//   submissions  submissionId  -> the result of a completed registration
// Firestore's TTL policy on `expireAt` deletes them; nothing here sweeps.

import { PENDING_GRACE_MS, SUBMISSION_TTL_MS } from './config.js';

export class FirestoreStore {
    constructor(db) {
        this.db = db;
    }

    async getHold(key) {
        const snap = await this.db.collection('holds').doc(docId(key)).get();
        if (!snap.exists) return null;
        const { token, expireAt } = snap.data();
        return expireAt.toMillis() > Date.now() ? token : null;
    }

    async putHold(key, token) {
        await this.db.collection('holds').doc(docId(key)).set({
            token,
            expireAt: new Date(Date.now() + PENDING_GRACE_MS)
        });
    }

    async deleteHold(key) {
        await this.db.collection('holds').doc(docId(key)).delete();
    }

    async getSubmission(id) {
        const snap = await this.db.collection('submissions').doc(docId(id)).get();
        if (!snap.exists) return null;
        const { result, expireAt } = snap.data();
        return expireAt.toMillis() > Date.now() ? JSON.parse(result) : null;
    }

    async putSubmission(id, result) {
        await this.db.collection('submissions').doc(docId(id)).set({
            // A string, not a map: the result carries a base64 QR code, and a map
            // would index every field of it for no reason.
            result: JSON.stringify(result),
            expireAt: new Date(Date.now() + SUBMISSION_TTL_MS)
        });
    }
}

/** Document ids may not contain '/'. */
function docId(key) {
    return encodeURIComponent(String(key));
}

export class MemoryStore {
    constructor() {
        this.holds = new Map();
        this.submissions = new Map();
    }
    async getHold(key) { return this.holds.get(key) ?? null; }
    async putHold(key, token) { this.holds.set(key, token); }
    async deleteHold(key) { this.holds.delete(key); }
    async getSubmission(id) { return this.submissions.get(id) ?? null; }
    async putSubmission(id, result) { this.submissions.set(id, JSON.parse(JSON.stringify(result))); }
}
