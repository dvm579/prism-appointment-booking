import { GAS_API_URL, RETRY } from './config.js';
import { delay } from './utils.js';

/** Error carrying enough context to decide whether a retry is worthwhile. */
export class ApiError extends Error {
    constructor(message, { transient = false, cause = null, body = null } = {}) {
        super(message);
        this.name = 'ApiError';
        this.transient = transient;
        this.cause = cause;
        this.body = body;
    }
}

/**
 * Fetches and parses a published-to-web CSV feed.
 *
 * @param {string} url
 * @returns {Promise<Array<Object>>}
 */
export function fetchCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            // Sheet headers routinely pick up stray whitespace, which silently
            // breaks every `row.ColumnName` lookup downstream. Normalise once,
            // here, rather than defensively at each use site.
            transformHeader: header => String(header ?? '').trim(),
            transform: value => (typeof value === 'string' ? value.trim() : value),
            complete: results => resolve(results.data),
            error: error => reject(new ApiError(`Could not load data from ${url}`, { cause: error }))
        });
    });
}

/**
 * Published CSV feeds are cached by Google for several minutes, so slot statuses
 * can be stale. A changing query parameter at least avoids the browser's own
 * cache when we deliberately re-read after a booking conflict.
 */
export function fetchCSVFresh(url) {
    const separator = url.includes('?') ? '&' : '?';
    return fetchCSV(`${url}${separator}cacheBust=${Date.now()}`);
}

/**
 * Performs one round trip to the Apps Script web app.
 *
 * `text/plain` is deliberate: it keeps the request "simple" under CORS, so the
 * browser never sends a preflight OPTIONS request that Apps Script cannot answer.
 */
async function postOnce(action, payload) {
    let response;
    try {
        response = await fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, payload })
        });
    } catch (error) {
        // Network-level failure: DNS, offline, connection reset, CORS rejection.
        throw new ApiError('Could not reach the registration server.', {
            transient: true,
            cause: error
        });
    }

    const text = await response.text();

    let result;
    try {
        result = JSON.parse(text);
    } catch {
        // Apps Script serves an HTML error page when the script itself fails
        // before it can return a ContentService response — most often a lock
        // timeout or an unhandled exception. Those are worth retrying.
        throw new ApiError('The server sent an unexpected response.', {
            transient: true,
            body: text.slice(0, 2000)
        });
    }

    if (!response.ok) {
        throw new ApiError(result.message || `Server error (${response.status}).`, {
            transient: response.status >= 500,
            body: text.slice(0, 2000)
        });
    }

    if (result.status === 'error') {
        // A structured error means the script ran and rejected the request on
        // purpose, so retrying would produce the same answer.
        throw new ApiError(result.message || 'The server rejected the request.', {
            transient: false,
            body: result
        });
    }

    return result;
}

/**
 * Calls the Apps Script backend, retrying transient failures with backoff.
 *
 * @param {'bookSlot'|'releaseSlot'|'submitForm'} action
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function callAPI(action, payload) {
    const canRetry = action !== 'submitForm' || RETRY.retrySubmissions;
    const attempts = canRetry ? RETRY.attempts : 1;
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await postOnce(action, payload);
        } catch (error) {
            lastError = error;
            const retryable = error instanceof ApiError && error.transient;
            if (!retryable || attempt === attempts) break;
            if (error.body) console.warn(`Retrying '${action}' after:`, error.body);
            await delay(RETRY.baseDelayMs * 2 ** (attempt - 1));
        }
    }

    throw lastError;
}

/**
 * Best-effort slot release during page unload.
 *
 * `sendBeacon` survives navigation where `fetch` would be cancelled. It cannot
 * report success, so the backend's pending-slot sweep remains the real safety net.
 */
export function releaseSlotOnUnload(eventId, startTime) {
    if (!eventId || !startTime || !navigator.sendBeacon) return;
    const body = JSON.stringify({ action: 'releaseSlot', payload: { eventId, startTime } });
    navigator.sendBeacon(GAS_API_URL, new Blob([body], { type: 'text/plain;charset=utf-8' }));
}
