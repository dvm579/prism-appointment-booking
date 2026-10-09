// Keeps what the patient has typed through a reload or a trip back to the
// slot picker.
//
// Going back to the picker re-renders the service picker, every questionnaire
// and the insurance block, and a reload clears the whole form. Either can
// happen to someone who did nothing wrong: their hold lapsed, staff moved the
// event's times, or the network dropped. So every edit is saved, and saved
// answers are put back whenever the form is drawn again.
//
// These are health answers, so nothing is stored in the clear:
//
// - The working copy is held in memory, which is all a trip back to the picker
//   needs.
// - The copy that survives a reload is encrypted with AES-256-GCM before it
//   reaches sessionStorage. The key is generated in the browser as
//   non-extractable, so no script, this page's included, can read its bytes,
//   and is kept in IndexedDB, the only storage that can hold a CryptoKey.
//   Without Web Crypto or IndexedDB nothing is stored at all; there is no
//   plaintext fallback.
// - sessionStorage rather than localStorage, because registrations happen on
//   shared clinic and school devices: a draft dies with its tab, and is dropped
//   after DRAFT_IDLE_MS without an edit.
// - The SSN, signatures and uploads are never saved; they are asked for again.
//
// The draft never leaves the browser, so it adds nothing in transit.

import { dom } from './dom.js';
import { state } from './state.js';

const DRAFT_IDLE_MS = 30 * 60 * 1000;
const KEY_PREFIX = 'prism.draft.v2:';
const KEY_DB = 'prism-draft';
const KEY_STORE = 'keys';
const KEY_ID = 'draft-aes-gcm';

/** Controls whose value is never saved, even encrypted. */
const NEVER_SAVED = new Set(['ssn', 'typedName']);

/** { savedAt, values } for this event, or null. */
let memory = null;
let restoring = false;
let saveTimer = null;
let listening = false;
let keyPromise = null;

function storageKey(eventId = state.eventId) {
    return KEY_PREFIX + (eventId ?? '');
}

// --- Encryption -------------------------------------------------------------

function canEncrypt() {
    return Boolean(globalThis.crypto?.subtle && globalThis.indexedDB);
}

function request(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function openKeyDb() {
    const open = indexedDB.open(KEY_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(KEY_STORE);
    return request(open);
}

/** This browser's draft key, created on first use. */
function draftKey() {
    if (keyPromise) return keyPromise;
    keyPromise = (async () => {
        const db = await openKeyDb();
        try {
            const store = () => db.transaction(KEY_STORE, 'readwrite').objectStore(KEY_STORE);
            const existing = await request(store().get(KEY_ID));
            if (existing) return existing;

            const key = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            try {
                await request(store().add(key, KEY_ID));
                return key;
            } catch {
                // Another tab created one first: use theirs, so both tabs can
                // read what the other wrote.
                return await request(store().get(KEY_ID));
            }
        } finally {
            db.close();
        }
    })();
    keyPromise.catch(() => { keyPromise = null; });
    return keyPromise;
}

function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function fromBase64(text) {
    return Uint8Array.from(atob(text), char => char.charCodeAt(0));
}

/**
 * The event id and save time are bound in as additional data. A draft copied
 * under another event's key fails to decrypt instead of filling that event's
 * form, and so does one whose savedAt was edited to outlive DRAFT_IDLE_MS.
 */
function boundTo(eventId, savedAt) {
    return new TextEncoder().encode(`${storageKey(eventId)}|${savedAt}`);
}

async function encrypt(values, eventId, savedAt) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: boundTo(eventId, savedAt) },
        await draftKey(),
        new TextEncoder().encode(JSON.stringify(values))
    );
    return { iv: toBase64(iv), data: toBase64(new Uint8Array(sealed)) };
}

async function decrypt(sealed, eventId) {
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(sealed.iv), additionalData: boundTo(eventId, sealed.savedAt) },
        await draftKey(),
        fromBase64(sealed.data)
    );
    return JSON.parse(new TextDecoder().decode(plain));
}

// --- Reading and writing the form -------------------------------------------

/** The key a control is saved under, or null if it is not saved. */
function keyFor(control) {
    if (!control.name && !control.id) return null;
    if (NEVER_SAVED.has(control.name) || NEVER_SAVED.has(control.id)) return null;
    if (control.type === 'file' || control.type === 'password') return null;
    if (control.disabled || control.closest('.additional-signature, #consentSignatureBlock')) return null;
    if (control.type === 'radio') return control.name ? `radio:${control.name}` : null;
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName)) return null;
    if (['button', 'submit', 'reset'].includes(control.type)) return null;
    return control.id || control.name;
}

function readForm() {
    const values = {};
    dom.regForm.querySelectorAll('input, select, textarea').forEach(control => {
        const key = keyFor(control);
        if (!key) return;
        if (control.type === 'radio') {
            if (control.checked) values[key] = control.value;
        } else if (control.type === 'checkbox') {
            values[key] = control.checked;
        } else {
            values[key] = control.value;
        }
    });
    return values;
}

/** Sets one saved value, returning the control if it changed. */
function apply(key, value) {
    if (key.startsWith('radio:')) {
        const name = key.slice('radio:'.length);
        const choice = Array.from(dom.regForm.querySelectorAll('input[type="radio"]'))
            .find(input => input.name === name && input.value === value);
        if (!choice || choice.checked) return null;
        choice.checked = true;
        return choice;
    }

    const control = document.getElementById(key) ?? dom.regForm.elements.namedItem(key);
    if (!control || !dom.regForm.contains(control) || keyFor(control) !== key) return null;

    if (control.type === 'checkbox') {
        if (control.checked === value) return null;
        control.checked = value;
    } else {
        if (control.value === value) return null;
        control.value = value;
    }
    return control;
}

function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (restoring) return;

    memory = { savedAt: Date.now(), values: readForm() };
    if (!canEncrypt()) return;

    const { savedAt, values } = memory;
    const eventId = state.eventId;
    encrypt(values, eventId, savedAt)
        .then(sealed => {
            // Cleared while encrypting: the registration went through.
            if (memory?.savedAt !== savedAt) return;
            sessionStorage.setItem(storageKey(eventId), JSON.stringify({ savedAt, ...sealed }));
        })
        .catch(error => {
            // Storage can be full, blocked or absent (private windows, some
            // in-app browsers). The in-memory copy still covers going back to
            // the slot picker.
            console.warn('Could not save the form draft.', error);
        });
}

function expired(savedAt) {
    return !savedAt || Date.now() - savedAt > DRAFT_IDLE_MS;
}

// --- Public -----------------------------------------------------------------

/**
 * Decrypts a draft left by an earlier load of this tab, ready for restoreDraft.
 * Call once at start-up, before the form can be drawn.
 */
export async function loadDraft(eventId) {
    try {
        const raw = sessionStorage.getItem(storageKey(eventId));
        if (!raw) return;
        const sealed = JSON.parse(raw);
        if (expired(sealed.savedAt) || !canEncrypt()) {
            sessionStorage.removeItem(storageKey(eventId));
            return;
        }
        memory = { savedAt: sealed.savedAt, values: await decrypt(sealed, eventId) };
    } catch (error) {
        // A missing or replaced key, or a tampered draft, will not decrypt.
        // Start clean rather than guess.
        console.warn('Could not read the form draft.', error);
        try {
            sessionStorage.removeItem(storageKey(eventId));
        } catch {
            // Storage blocked: nothing was saved to remove.
        }
    }
}

/**
 * Puts saved answers back into a freshly drawn form.
 *
 * Several passes, each firing the change events the page itself listens to: a
 * ticked service draws its questionnaire and insurance block, an answer reveals
 * the questions it triggers, and a changed date of birth re-gates services, so
 * a value can only land once whatever it depends on has been put back.
 *
 * @returns {boolean} true if anything was restored
 */
export function restoreDraft() {
    if (!memory) return false;
    if (expired(memory.savedAt)) {
        clearDraft();
        return false;
    }

    const { values } = memory;
    restoring = true;
    let restored = false;
    try {
        for (let pass = 0; pass < 4; pass++) {
            let changed = false;
            Object.entries(values).forEach(([key, value]) => {
                const control = apply(key, value);
                if (!control) return;
                changed = restored = true;
                control.dispatchEvent(new Event('input', { bubbles: true }));
                control.dispatchEvent(new Event('change', { bubbles: true }));
            });
            if (!changed) break;
        }
    } finally {
        restoring = false;
    }
    return restored;
}

/** Forgets the draft: the registration went through. */
export function clearDraft() {
    clearTimeout(saveTimer);
    saveTimer = null;
    memory = null;
    try {
        sessionStorage.removeItem(storageKey());
    } catch (error) {
        console.warn('Could not clear the form draft.', error);
    }
}

/** Saves after every edit, and once more if the page is going away. */
export function attachDraftListeners() {
    if (listening) return;
    listening = true;

    const later = () => {
        if (restoring) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 400);
    };
    dom.regForm.addEventListener('input', later);
    dom.regForm.addEventListener('change', later);
    window.addEventListener('pagehide', () => {
        if (saveTimer) save();
    });
}
