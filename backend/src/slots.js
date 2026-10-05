// Slot reservation: Open -> Pending -> Booked, and the sweep that reopens
// abandoned holds. A port of the slot half of apps-script/endpoints.gs.
//
// Every read-modify-write of Appointment Slots runs inside `exclusive`. Sheets
// has no transactions, so two bookings racing for one slot are only safe if
// nothing else touches the sheet between the read and the write. The service is
// deployed with max-instances=1 for exactly this reason: one process, one lock.

import { BOOKING_SPREADSHEET_ID, PENDING_GRACE_MS } from './config.js';
import { coded } from './errors.js';
import { normalizeTime, parseSheetDate, sheetTimestamp, wallClockToEpoch } from './time.js';

const SLOTS = 'Appointment Slots';

/** Columns of Appointment Slots (1-based), as in endpoints.gs. */
const COL = { eventId: 1, startTime: 3, status: 5, updatedAt: 6, appointmentId: 7 };

let queue = Promise.resolve();

/** Runs `work` once every earlier caller's work has finished. */
export function exclusive(work) {
    const run = queue.then(work, work);
    queue = run.catch(() => {});
    return run;
}

/** 1-based row of the slot with this event, start time and status, or 0. */
function findSlotRow(rows, eventId, startTime, status) {
    const wanted = normalizeTime(startTime);
    if (!wanted) return 0;
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (
            String(row[COL.eventId - 1] ?? '') === String(eventId) &&
            normalizeTime(row[COL.startTime - 1]) === wanted &&
            row[COL.status - 1] === status
        ) {
            return i + 1;
        }
    }
    return 0;
}

function holdKey(eventId, startTime) {
    return `hold:${eventId}|${normalizeTime(startTime)}`;
}

export function slotActions({ sheets, store, now = () => new Date() }) {
    async function setStatus(row, values) {
        await sheets.update(BOOKING_SPREADSHEET_ID, SLOTS, row, COL.status, [values]);
    }

    async function rememberHold(payload) {
        if (!payload.holdToken) return;
        try {
            await store.putHold(holdKey(payload.eventId, payload.startTime), payload.holdToken);
        } catch (error) {
            console.warn('Could not record the slot hold:', error.message);
        }
    }

    async function forgetHold(payload) {
        try {
            await store.deleteHold(holdKey(payload.eventId, payload.startTime));
        } catch (error) {
            console.warn('Could not clear the slot hold:', error.message);
        }
    }

    /**
     * Open -> Pending. Idempotent per `holdToken`: a retry from the client that
     * already took the hold is the success it is, not "someone else got it".
     */
    async function bookSlot(payload) {
        if (!payload.eventId || !payload.startTime) {
            throw coded('BAD_REQUEST', 'An event and a start time are required to reserve a slot.');
        }
        return exclusive(async () => {
            const rows = await sheets.read(BOOKING_SPREADSHEET_ID, SLOTS);
            const open = findSlotRow(rows, payload.eventId, payload.startTime, 'Open');

            if (!open) {
                const pending = findSlotRow(rows, payload.eventId, payload.startTime, 'Pending');
                if (pending && payload.holdToken) {
                    const holder = await store.getHold(holdKey(payload.eventId, payload.startTime)).catch(() => null);
                    if (holder === payload.holdToken) {
                        return { status: 'success', message: 'Slot already reserved.', replayed: true };
                    }
                }
                throw coded('SLOT_UNAVAILABLE', 'That slot is no longer available. Please choose another.');
            }

            await Promise.all([setStatus(open, ['Pending', sheetTimestamp(now())]), rememberHold(payload)]);
            return { status: 'success', message: 'Slot reserved.' };
        });
    }

    /** Pending -> Open. Safe to call more than once. */
    async function releaseSlot(payload) {
        if (!payload.eventId || !payload.startTime) {
            return { status: 'success', message: 'No slot to release.' };
        }
        return exclusive(async () => {
            const rows = await sheets.read(BOOKING_SPREADSHEET_ID, SLOTS);
            const row = findSlotRow(rows, payload.eventId, payload.startTime, 'Pending');
            if (!row) {
                await forgetHold(payload);
                return { status: 'success', message: 'Slot was not in a pending state.' };
            }
            await setStatus(row, ['Open', sheetTimestamp(now())]);
            await forgetHold(payload);
            return { status: 'success', message: 'Slot released.' };
        });
    }

    /** Pending -> Booked, claiming the slot before anything else is written. */
    async function confirmSlot(eventId, slotTime, appointmentId, at) {
        return exclusive(async () => {
            const rows = await sheets.read(BOOKING_SPREADSHEET_ID, SLOTS);
            const row = findSlotRow(rows, eventId, slotTime, 'Pending');
            if (!row) {
                throw coded(
                    'SLOT_EXPIRED',
                    'We could not confirm your slot — the reservation may have expired. Please choose a slot again.'
                );
            }
            await setStatus(row, ['Booked', sheetTimestamp(at), appointmentId]);
        });
    }

    /**
     * Reopens slots left 'Pending' past the grace period. Cloud Scheduler calls
     * it every five minutes, as the Apps Script time trigger did.
     *
     * Each stale row is written on its own. There are rarely more than one or
     * two, and rewriting the whole Status column in one go would race a booking
     * that lands between the read and the write.
     */
    async function sweep() {
        return exclusive(async () => {
            const rows = await sheets.read(BOOKING_SPREADSHEET_ID, SLOTS);
            const cutoff = now().getTime() - PENDING_GRACE_MS;
            let reopened = 0;
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][COL.status - 1] !== 'Pending') continue;
                const stamp = parseSheetDate(rows[i][COL.updatedAt - 1]);
                if (!stamp || wallClockToEpoch(stamp) > cutoff) continue;
                await setStatus(i + 1, ['Open', sheetTimestamp(now())]);
                reopened++;
            }
            return { status: 'success', reopened };
        });
    }

    return { bookSlot, releaseSlot, confirmSlot, sweep };
}
