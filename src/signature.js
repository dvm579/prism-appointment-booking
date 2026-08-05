// Signature capture.
//
// Two kinds of signature live here:
//
//  * The consent signature, shown whenever the selected services carry consent.
//  * Additional signatures requested by `QuestionType = signature` rows. The
//    question itself renders inline as a Yes/No so it does not interrupt the
//    questionnaire; answering Yes adds a pad down here, next to the consent
//    signature, so the patient signs everything in one place at the end.

import { dom } from './dom.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';

const TYPED_CANVAS_WIDTH = 600;
const TYPED_CANVAS_HEIGHT = 150;
const SIGNATURE_FONT = "60px 'Caveat', cursive";

/** Additional pads, keyed by the question that asked for them. */
const extraPads = new Map();

// --- Canvas plumbing --------------------------------------------------------

/**
 * Sizes a canvas to its container at device resolution.
 *
 * Without this a CSS-stretched canvas makes the stroke land at an offset from the
 * pointer — the usual cause of "the signature pad doesn't work on my phone".
 */
function fitCanvas(canvas, pad) {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth || 600;
    const height = canvas.offsetHeight || 180;

    // Resizing clears the canvas, so preserve any strokes already drawn.
    const existing = pad && !pad.isEmpty() ? pad.toData() : null;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.getContext('2d').scale(ratio, ratio);

    if (pad) {
        pad.clear();
        if (existing) pad.fromData(existing);
    }
}

function newPad(canvas) {
    const pad = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)'
    });
    fitCanvas(canvas, pad);
    return pad;
}

function fitAllCanvases() {
    if (state.signaturePad) fitCanvas(dom.sigPad, state.signaturePad);
    extraPads.forEach(entry => fitCanvas(entry.canvas, entry.pad));
}

// --- Typed signatures -------------------------------------------------------

function paintBlank(canvas) {
    canvas.width = TYPED_CANVAS_WIDTH;
    canvas.height = TYPED_CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** Draws a typed name onto a canvas in the signature face. */
async function renderTypedName(canvas, text) {
    // Load the face explicitly: a font that has not been used yet may not be in
    // `document.fonts.ready`'s set at all, and would render as the fallback.
    try {
        await document.fonts.load(SIGNATURE_FONT);
    } catch {
        /* Fall back to whatever cursive face is available. */
    }

    paintBlank(canvas);
    const ctx = canvas.getContext('2d');
    ctx.font = SIGNATURE_FONT;
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 20, canvas.height / 2);
}

const renderConsentTypedName = () =>
    renderTypedName(dom.typeCanvas, dom.typedName.value);

// --- Consent signature ------------------------------------------------------

/** Creates the consent pad on first use, or resets it on later visits. */
export function initSignaturePad() {
    if (!state.signaturePad) {
        state.signaturePad = newPad(dom.sigPad);
    } else {
        state.signaturePad.clear();
    }
    dom.typedName.value = '';
    paintBlank(dom.typeCanvas);
}

/**
 * Shows or hides the whole consent-signature area.
 *
 * Hidden when none of the selected services requires consent — there is nothing
 * to attest to, so the patient is not asked to sign.
 */
export function setConsentSignatureVisible(visible) {
    dom.consentSignatureBlock.classList.toggle('d-none', !visible);
    dom.certifyConsentRow.classList.toggle('d-none', !visible);
    dom.certifyConsent.required = visible;
    if (!visible) {
        dom.certifyConsent.checked = false;
        state.signaturePad?.clear();
        dom.typedName.value = '';
    }
}

/**
 * Reads the consent signature.
 *
 * @returns {{dataUrl: string}|{error: string}}
 */
export function readConsentSignature() {
    if (dom.drawTab.classList.contains('active')) {
        if (!state.signaturePad || state.signaturePad.isEmpty()) {
            return { error: 'Please provide a signature by drawing it.' };
        }
        return { dataUrl: state.signaturePad.toDataURL('image/png') };
    }

    if (!dom.typedName.value.trim()) {
        return { error: 'Please provide a signature by typing your name.' };
    }
    return { dataUrl: dom.typeCanvas.toDataURL('image/png') };
}

// --- Additional signatures --------------------------------------------------

/**
 * Adds or removes pads so that exactly the requested signatures are on screen.
 *
 * @param {Array<{questionId: string, label: string}>} requested
 */
export function syncAdditionalSignatures(requested) {
    const wanted = new Map(requested.map(item => [item.questionId, item.label]));

    // Drop pads whose question is no longer answered Yes (or is no longer shown).
    extraPads.forEach((entry, questionId) => {
        if (wanted.has(questionId)) return;
        entry.pad.off();
        entry.wrapper.remove();
        extraPads.delete(questionId);
    });

    wanted.forEach((label, questionId) => {
        if (extraPads.has(questionId)) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'additional-signature border rounded p-3 mt-3';
        wrapper.dataset.signatureFor = questionId;
        wrapper.innerHTML = `
            <label class="form-label d-block"><strong>${escapeHtml(label)}</strong><span class="text-danger ms-1">*</span></label>
            <p class="small mb-2">Draw below, or type the name instead.</p>
            <canvas class="signature-canvas border"
                    aria-label="${escapeHtml(label)} drawing area"></canvas>
            <div class="d-flex align-items-center gap-2 mt-2 flex-wrap">
                <button class="btn btn-outline-secondary btn-sm" type="button" data-clear-signature>Clear</button>
                <input type="text" class="form-control typed-signature-sm"
                       aria-label="${escapeHtml(label)} — type name instead" placeholder="Type name">
            </div>`;

        dom.additionalSignatures.appendChild(wrapper);

        const canvas = wrapper.querySelector('canvas');
        const typedInput = wrapper.querySelector('input[type="text"]');
        const typedCanvas = document.createElement('canvas');
        paintBlank(typedCanvas);

        const pad = newPad(canvas);
        wrapper.querySelector('[data-clear-signature]').addEventListener('click', () => pad.clear());
        typedInput.addEventListener('input', () => renderTypedName(typedCanvas, typedInput.value));

        extraPads.set(questionId, { wrapper, canvas, pad, typedInput, typedCanvas, label });
    });

    dom.additionalSignatures.classList.toggle('d-none', extraPads.size === 0);
}

/**
 * Reads every additional signature currently on screen.
 *
 * @returns {{signatures: Array<{questionId: string, label: string, data: string}>,
 *            missing: {label: string, element: Element}|null}}
 */
export function readAdditionalSignatures() {
    const signatures = [];
    let missing = null;

    extraPads.forEach((entry, questionId) => {
        // A drawn signature wins; otherwise fall back to the typed name.
        let data = '';
        if (!entry.pad.isEmpty()) {
            data = entry.pad.toDataURL('image/png');
        } else if (entry.typedInput.value.trim()) {
            data = entry.typedCanvas.toDataURL('image/png');
        }

        if (!data) {
            if (!missing) missing = { label: entry.label, element: entry.canvas };
            return;
        }
        signatures.push({ questionId, label: entry.label, data });
    });

    return { signatures, missing };
}

/** Discards every additional pad, e.g. when the patient goes back to the slots. */
export function resetAdditionalSignatures() {
    extraPads.forEach(entry => {
        entry.pad.off();
        entry.wrapper.remove();
    });
    extraPads.clear();
    dom.additionalSignatures.classList.add('d-none');
}

// --- Wiring -----------------------------------------------------------------

export function setupSignatureListeners() {
    dom.clearSignatureBtn.addEventListener('click', () => state.signaturePad?.clear());
    dom.typedName.addEventListener('input', renderConsentTypedName);

    // Re-render on tab activation so switching back and forth is lossless, and
    // re-measure the pads because a canvas has no layout while hidden.
    dom.typeTab.addEventListener('shown.bs.tab', renderConsentTypedName);
    dom.drawTab.addEventListener('shown.bs.tab', fitAllCanvases);

    window.addEventListener('resize', fitAllCanvases);
    window.addEventListener('orientationchange', fitAllCanvases);
}
