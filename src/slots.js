import { CSV_URLS, SLOT_HOLD_MS } from './config.js';
import { callAPI, fetchCSVFresh } from './api.js';
import { dom } from './dom.js';
import { state, currentEvent } from './state.js';
import { displayEventDetails } from './events.js';
import { renderDynamicForms } from './questions.js';
import { initSignaturePad, resetAdditionalSignatures } from './signature.js';
import {
    escapeHtml,
    handleError,
    hideLoading,
    parseSheetDate,
    showAlert,
    showLoading,
    slotDateTime,
    toSlotKey,
    updateLoadingMessage,
    uuid
} from './utils.js';

/** Guards against a second booking request while the first is still in flight. */
let bookingInFlight = false;

/**
 * Identifies this client's claim on the slot it is holding.
 *
 * Sent with every bookSlot/releaseSlot call so the backend can tell a retry of our
 * own request apart from someone else taking the slot. Apps Script sometimes
 * answers with an HTML error page even though the script ran, and without this the
 * retry reported the slot as "just taken" by the patient who had in fact got it.
 */
let holdToken = null;

/** The token for the hold currently in place, for the unload beacon. */
export function currentHoldToken() {
    return holdToken;
}

// --- Slot grid --------------------------------------------------------------

/**
 * Decorates the event's slots for display and booking.
 *
 * `wire` is the sheet's own start-time string, sent to the backend untouched so
 * that whatever format the column uses ("11:00:00", "09:00", "9:00 AM") still
 * matches the sheet on the other side. `key` is the tidied "HH:mm" form, used
 * only for sorting and for what the patient sees.
 *
 * @returns {Array<{wire: string, key: string|null, label: string, startsAt: Date|null, bookable: boolean}>}
 */
function describeSlots() {
    const event = currentEvent();
    const eventDate = parseSheetDate(event?.Date);
    const now = new Date();

    return state.slots
        .filter(slot => String(slot.EventID) === String(state.eventId))
        .map(slot => {
            const key = toSlotKey(slot['Start Time']);
            const endKey = toSlotKey(slot['End Time']);
            // The slot sheet carries its own Date; prefer it so an event spanning
            // more than one day still hides only the slots that have passed.
            const startsAt = slotDateTime(parseSheetDate(slot.Date) ?? eventDate, slot['Start Time']);
            return {
                wire: slot['Start Time'],
                key,
                label: `${key ?? slot['Start Time']} – ${endKey ?? slot['End Time']}`,
                startsAt,
                // An unparseable start time is treated as unbookable rather than
                // silently offered: we could not tell whether it is in the past.
                bookable: key !== null && slot.Status === 'Open' && !(startsAt && startsAt < now)
            };
        })
        .sort((a, b) => (a.key ?? '').localeCompare(b.key ?? ''));
}

/** Renders the slot picker, falling back to the waitlist when nothing is open. */
export function renderSlots() {
    const event = currentEvent();
    if (!event) {
        handleError('Event details could not be found to render slots.');
        return;
    }

    const slots = describeSlots();
    dom.slotsGrid.innerHTML = '';

    if (!slots.some(slot => slot.bookable)) {
        dom.slotsGrid.classList.add('d-none');
        dom.waitlistSection.classList.remove('d-none');
        return;
    }

    dom.slotsGrid.classList.remove('d-none');
    dom.waitlistSection.classList.add('d-none');

    slots.forEach(slot => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `slot-item ${slot.bookable ? 'slot-open' : 'slot-taken'}`;
        pill.textContent = slot.label;

        if (slot.bookable) {
            pill.addEventListener('click', () => selectSlot(slot, pill));
        } else {
            pill.disabled = true;
            pill.setAttribute('aria-label', `${slot.label} — unavailable`);
        }

        dom.slotsGrid.appendChild(pill);
    });
}

// --- Holding a slot ---------------------------------------------------------

/**
 * Reserves a slot on the backend and reveals the registration form.
 *
 * @param {{wire: string, key: string|null}} slot Descriptor from `describeSlots`.
 * @param {HTMLElement} [pill] The clicked pill, highlighted while booking.
 */
async function selectSlot(slot, pill) {
    // Both guards matter: `heldSlotTime` blocks a second slot after one is held,
    // and `bookingInFlight` blocks two clicks racing before the first responds.
    if (state.heldSlotTime || bookingInFlight) return;

    bookingInFlight = true;
    pill?.classList.add('slot-selecting');
    showLoading('Checking availability…');

    try {
        holdToken = uuid();
        await callAPI('bookSlot', {
            eventId: state.eventId,
            startTime: slot.wire,
            holdToken
        });
        state.heldSlotTime = slot.wire;
        updateLoadingMessage('Slot reserved.');
        openRegistrationForm(`<br>Selected Time Slot: ${escapeHtml(slot.key ?? slot.wire)}`);
    } catch (error) {
        handleError('That slot was just taken. Please choose another.', error);
        try {
            state.slots = await fetchCSVFresh(CSV_URLS.slots);
        } catch (refreshError) {
            console.error('Could not refresh slot availability.', refreshError);
        }
        renderSlots();
    } finally {
        pill?.classList.remove('slot-selecting');
        bookingInFlight = false;
        hideLoading();
    }
}

/** Switches from the slot picker to the registration form. */
function openRegistrationForm(detailsSuffixHtml) {
    dom.slotSection.classList.add('d-none');
    dom.formSection.classList.remove('d-none');

    displayEventDetails(currentEvent(), detailsSuffixHtml);
    resetAdditionalSignatures();
    initSignaturePad();
    // Rendered last: it decides which forms, consent and signatures apply.
    renderDynamicForms(currentEvent());

    if (state.heldSlotTime) startSlotTimer();
}

// --- Hold countdown ---------------------------------------------------------

export function startSlotTimer() {
    stopSlotTimer();

    const expiresAt = Date.now() + SLOT_HOLD_MS;
    dom.timer.classList.remove('d-none');

    const tick = () => {
        const remaining = expiresAt - Date.now();

        if (remaining <= 0) {
            stopSlotTimer();
            returnToSlotPicker().then(() =>
                showAlert('Your reservation expired and the slot has been released. Please choose a slot again.', 'warning')
            );
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        dom.timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        dom.timer.classList.toggle('timer-warning', remaining <= 120000);
    };

    tick();
    state.timerInterval = setInterval(tick, 1000);
}

export function stopSlotTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = null;
}

export function hideSlotTimer() {
    stopSlotTimer();
    dom.timer.classList.add('d-none');
    dom.timer.textContent = '';
}

// --- Leaving the form -------------------------------------------------------

/** Releases any held slot and returns the user to the slot picker. */
export async function returnToSlotPicker() {
    hideSlotTimer();
    const held = state.heldSlotTime;

    if (held) showLoading('Releasing your time slot…');

    try {
        if (held) {
            await callAPI('releaseSlot', {
                eventId: state.eventId,
                startTime: held,
                holdToken
            });
        }
    } catch (error) {
        // The backend sweeps stale pending slots on a timer, so a failed release
        // is not worth blocking the user over.
        console.error('Failed to release the slot; continuing with UI reset.', error);
    } finally {
        state.heldSlotTime = null;
        holdToken = null;
        state.isWaitlist = false;
        dom.formSection.classList.add('d-none');
        dom.slotSection.classList.remove('d-none');
        displayEventDetails(currentEvent());
        renderSlots();
        hideLoading();
    }
}

/** Switches to the form in waitlist mode, without reserving a slot. */
export function joinWaitlist() {
    state.isWaitlist = true;
    state.heldSlotTime = null;
    hideSlotTimer();
    openRegistrationForm('<br><b>Joining the Waitlist</b>');
}
