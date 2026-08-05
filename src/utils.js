import { dom } from './dom.js';

// --- Loading overlay ---------------------------------------------------------

export function showLoading(message = 'Please wait…') {
    dom.loadingMessage.textContent = message;
    dom.loadingOverlay.classList.remove('d-none');
}

export function updateLoadingMessage(message) {
    dom.loadingMessage.textContent = message;
}

export function hideLoading() {
    dom.loadingOverlay.classList.add('d-none');
}

// --- User-facing messaging --------------------------------------------------

/**
 * Shows a dismissible banner at the top of the page.
 *
 * Preferred over `alert()`: alerts are suppressed in some embedded/in-app
 * browsers, which previously meant a failed submission could look like nothing
 * had happened at all.
 */
export function showAlert(message, variant = 'danger') {
    dom.appAlertMessage.textContent = message;
    dom.appAlert.className = `alert alert-${variant} alert-dismissible fade show`;
    dom.appAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function clearAlert() {
    dom.appAlert.classList.add('d-none');
}

/** Logs the underlying error for diagnosis and shows the user a plain message. */
export function handleError(userMessage, error) {
    if (error) console.error(userMessage, error);
    hideLoading();
    showAlert(userMessage);
}

// --- Spreadsheet value parsing ----------------------------------------------

/**
 * Parses a date coming out of a published Google Sheet into a local-midnight
 * Date.
 *
 * `new Date('2026-08-05')` is interpreted as UTC midnight, which renders as the
 * previous day everywhere west of Greenwich — so ISO and US-style dates are
 * split apart by hand rather than handed to the Date constructor.
 *
 * @param {string|Date} value
 * @returns {Date|null} null when the value is blank or unparseable.
 */
export function parseSheetDate(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

    const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (us) return new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parses a time-of-day cell, accepting both 24-hour ("9:00", "09:00") and
 * 12-hour ("9:00 AM") sheet formats.
 *
 * @param {string} value
 * @returns {{hours: number, minutes: number}|null}
 */
export function parseTimeOfDay(value) {
    const match = String(value ?? '')
        .trim()
        .match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([AaPp])\.?[Mm]?\.?)?$/);
    if (!match) return null;

    const meridiem = match[3] ? match[3].toLowerCase() : null;
    let hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (meridiem === 'p' && hours < 12) hours += 12;
    if (meridiem === 'a' && hours === 12) hours = 0;
    if (!Number.isInteger(hours) || hours > 23 || minutes > 59) return null;

    return { hours, minutes };
}

/**
 * Canonical "HH:mm" form of a slot start time.
 *
 * The backend matches slots on this exact string, so every comparison and every
 * value sent over the wire goes through here. Sheets that display "9:00" rather
 * than "09:00" used to fail to book for this reason.
 *
 * @param {string} value
 * @returns {string|null}
 */
export function toSlotKey(value) {
    const time = parseTimeOfDay(value);
    if (!time) return null;
    return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
}

/** Combines an event date and a slot start time into a single Date. */
export function slotDateTime(eventDate, startTime) {
    const time = parseTimeOfDay(startTime);
    if (!eventDate || !time) return null;
    return new Date(
        eventDate.getFullYear(),
        eventDate.getMonth(),
        eventDate.getDate(),
        time.hours,
        time.minutes
    );
}

// --- Misc -------------------------------------------------------------------

/** Escapes a spreadsheet-authored value for safe interpolation into markup. */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** True when a spreadsheet "TRUE"/"true"/"yes" style flag is set. */
export function isTruthyFlag(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** RFC 4122-ish v4 identifier, used for submission idempotency keys. */
export function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
        const random = (window.crypto?.getRandomValues(new Uint8Array(1))[0] ?? 0) % 16;
        const value = char === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}
