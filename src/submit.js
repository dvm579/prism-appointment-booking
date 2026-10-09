import { callAPI } from './api.js';
import { dom } from './dom.js';
import { state, currentEvent, isGeneralRegistration } from './state.js';
import { collectResponses, collectSelectedServices, consentRequired } from './questions.js';
import { readAdditionalSignatures, readConsentSignature } from './signature.js';
import { collectDeclines } from './consent.js';
import { revealElement } from './steps.js';
import { INSURANCE_FIELDS } from './insurance.js';
import { DEMOGRAPHIC_FIELDS, readFilesAsBase64 } from './patient.js';
import { hideSlotTimer, returnAfterLostHold } from './slots.js';
import { clearDraft } from './draft.js';
import {
    handleError,
    hideLoading,
    parseSheetDate,
    showAlert,
    showLoading,
    updateLoadingMessage,
    uuid
} from './utils.js';

/**
 * Stable idempotency key for this registration attempt.
 *
 * Reused across retries so that a submission whose response was lost in transit
 * can be recognised by the backend instead of creating a second patient record.
 * Cleared only once a submission is confirmed.
 */
let submissionId = null;

let submitInFlight = false;

/** Blocks submission and points the user at the problem. */
function reject(message, element) {
    showAlert(message, 'warning');
    if (element) {
        // The problem can be several steps back, and scrolling to an element on
        // a step that is not showing scrolls to nothing.
        revealElement(element);
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (element.type !== 'radio' && element.type !== 'checkbox') element.focus();
    }
    return false;
}

/**
 * Runs every check that does not need async work.
 *
 * All validation happens before the loading overlay appears — an early return
 * after `showLoading()` used to leave the overlay covering the page, which made
 * the form permanently unusable until a reload.
 *
 * @returns {{services: Array, responses: Array, signature: string,
 *            additionalSignatures: Array}|null}
 */
function validate(form) {
    // The form carries `novalidate`, so constraint validation is triggered here
    // instead of by the browser. That is deliberate: native reporting silently
    // aborts submission when an invalid control is not focusable, which is
    // indistinguishable from the page having frozen.
    form.classList.add('was-validated');
    if (!form.checkValidity()) {
        return reject(
            'Please complete the highlighted required fields.',
            form.querySelector(':invalid')
        );
    }

    if (!form.consentCalls.checked && !form.consentTexts.checked && !form.consentEmails.checked) {
        return reject('Please consent to at least one method of contact to continue.', form.consentEmails);
    }

    const services = collectSelectedServices();
    if (services.length === 0 && !isGeneralRegistration()) {
        return reject(
            'Please select at least one service to continue.',
            dom.dynamicFormsContainer.querySelector('.service-selector')
        );
    }

    const { responses, firstInvalid } = collectResponses();
    if (firstInvalid) {
        return reject('Please answer all required questions before submitting.', firstInvalid);
    }

    // A signature is only required when a selected service carries consent. If
    // none does, there is nothing to attest to and the pad is not even shown.
    let signature = '';
    if (consentRequired()) {
        const consentSignature = readConsentSignature();
        if (consentSignature.error) {
            return reject(consentSignature.error, dom.sigPad);
        }
        signature = consentSignature.dataUrl;
    }

    const { signatures: additionalSignatures, missing } = readAdditionalSignatures();
    if (missing) {
        return reject(`Please provide the "${missing.label}" signature.`, missing.element);
    }

    return { services, responses, signature, additionalSignatures };
}

/** Handles the registration form submit event. */
export async function submitBooking(event) {
    event.preventDefault();
    if (submitInFlight) return;

    const form = event.target;
    const validated = validate(form);
    if (!validated) return;

    submitInFlight = true;
    dom.submitButton.disabled = true;
    submissionId ??= uuid();
    showLoading('Preparing your files…');

    try {
        const medicalRecords = dom.hasRecordsCheck.checked
            ? await readFilesAsBase64(dom.medicalRecordsUpload)
            : [];

        const payload = {
            submissionId,
            eventId: state.eventId,
            slotTime: state.heldSlotTime,
            // Read only by an endpoints.gs from before the waitlist was removed,
            // which needs it to take a general registration without a slot. The
            // current backends decide from eventId and ignore it.
            isWaitlist: isGeneralRegistration(),
            // Not read by either backend yet; recorded so a paper registration can
            // be told apart from an online one that simply asked nothing.
            intake: state.paperIntake ? 'paper' : 'online',
            selectedServices: validated.services,
            formResponses: validated.responses,
            medicalRecords,
            signature: validated.signature,
            additionalSignatures: validated.additionalSignatures,
            // Opt-out consent: one signature covers every section not listed here.
            consentDeclines: collectDeclines(),
            demographics: readFields(form, DEMOGRAPHIC_FIELDS),
            insurance: readFields(form, INSURANCE_FIELDS),
            consentCalls: form.consentCalls.checked,
            consentTexts: form.consentTexts.checked,
            consentEmails: form.consentEmails.checked,
            electronicConsent: form.electronicConsent.checked,
            vaxConsent: form.certifyConsent.checked
        };

        updateLoadingMessage('Submitting your registration…');
        const response = await callAPI('submitForm', payload);

        // Only now is the slot permanently ours: stop the countdown and drop the
        // hold so the unload handler cannot release a booked slot.
        hideSlotTimer();
        state.heldSlotTime = null;
        submissionId = null;
        clearDraft();

        displayConfirmation(response, payload.demographics);
    } catch (error) {
        if (error.body?.code === 'SLOT_EXPIRED') {
            // Submitting again would fail the same way: there is no hold left.
            console.error('The slot hold was gone at submit.', error);
            await returnAfterLostHold();
            return;
        }
        // The slot is still held and the countdown is still running, so the user
        // can correct something and submit again.
        handleError(
            `We could not submit your registration: ${error.message} ` +
                'Your time slot is still reserved — please try again.',
            error
        );
    } finally {
        submitInFlight = false;
        dom.submitButton.disabled = false;
        hideLoading();
    }
}

/** Reads a list of named form controls into a plain object. */
function readFields(form, names) {
    return names.reduce((values, name) => {
        values[name] = form[name]?.value ?? '';
        return values;
    }, {});
}

/** Swaps the form out for the confirmation panel. */
function displayConfirmation(response, demographics) {
    const { appointmentID, qrBase64 } = response;

    dom.slotSection.classList.add('d-none');
    dom.formSection.classList.add('d-none');
    dom.eventSelectionSection.classList.add('d-none');
    dom.confirmationSection.classList.remove('d-none');

    dom.confPatientName.textContent = `${demographics.firstName} ${demographics.lastName}`.trim();
    dom.confPatientDob.textContent = demographics.dob;

    if (isGeneralRegistration()) {
        dom.confEventName.textContent = 'General Registration / School Records Check';
        dom.confEventDateRow.classList.add('d-none');
    } else {
        const event = currentEvent();
        const date = parseSheetDate(event?.Date);
        dom.confEventName.textContent = event?.['Event Name'] ?? 'Your Event';
        dom.confEventDate.textContent = date ? date.toLocaleDateString() : '';
        dom.confEventDateRow.classList.remove('d-none');
    }

    if (isGeneralRegistration()) {
        dom.confApptIdRow.classList.add('d-none');
        dom.confGeneralMessage.classList.remove('d-none');
        dom.confQrCode.classList.add('d-none');
    } else {
        dom.confApptIdRow.classList.remove('d-none');
        dom.confGeneralMessage.classList.add('d-none');
        dom.confApptId.textContent = appointmentID ?? '';
        if (qrBase64) {
            dom.confQrCode.src = `data:image/png;base64,${qrBase64}`;
            dom.confQrCode.classList.remove('d-none');
        } else {
            // The QR service is a separate dependency; a missing code should not
            // make a successful registration look like a failure.
            dom.confQrCode.classList.add('d-none');
        }
    }

    dom.confirmationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
