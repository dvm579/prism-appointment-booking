import { CSV_URLS, GENERAL_REGISTRATION_EVENT_ID } from './config.js';
import { fetchCSV, releaseSlotOnUnload } from './api.js';
import { dom } from './dom.js';
import { state, currentEvent } from './state.js';
import { displayEventDetails, renderEventCards } from './events.js';
import { joinWaitlist, renderSlots, returnToSlotPicker } from './slots.js';
import { refreshForDemographics, renderDynamicForms } from './questions.js';
import { initSignaturePad, setupSignatureListeners } from './signature.js';
import { checkAge, handleFileSelection, toggleRecordsSection } from './patient.js';
import { submitBooking } from './submit.js';
import { clearAlert, handleError, hideLoading, showLoading } from './utils.js';

/**
 * Switches the Google Translate widget's language.
 *
 * The widget renders a hidden <select>; driving it directly avoids a page reload.
 */
function changeLanguage(lang) {
    const select = document.querySelector('#google_translate_element select');
    if (!select) {
        console.error('Google Translate has not finished loading yet.');
        return;
    }
    select.value = lang;
    select.dispatchEvent(new Event('change'));
}

function setupEventListeners() {
    dom.regForm.addEventListener('submit', submitBooking);
    dom.goBackButton.addEventListener('click', returnToSlotPicker);
    dom.joinWaitlistBtn.addEventListener('click', joinWaitlist);

    // Date of birth and gender gate which services are offered and which questions
    // apply, so both re-run the dependent logic as soon as they change.
    dom.dob.addEventListener('change', () => {
        checkAge();
        refreshForDemographics();
    });
    dom.gender.addEventListener('change', refreshForDemographics);
    dom.hasRecordsCheck.addEventListener('change', toggleRecordsSection);
    dom.medicalRecordsUpload.addEventListener('change', handleFileSelection);

    setupSignatureListeners();

    dom.translationButtons.addEventListener('click', event => {
        const lang = event.target.closest('[data-lang]')?.dataset.lang;
        if (lang) changeLanguage(lang);
    });

    dom.appAlert.addEventListener('click', event => {
        if (event.target.closest('[data-dismiss-alert]')) clearAlert();
    });

    // Best-effort release so a slot is not held for the full grace period when
    // someone simply closes the tab. A persisted page may still be restored from
    // the back/forward cache, so leave that hold to the backend's sweep.
    window.addEventListener('pagehide', event => {
        if (!event.persisted) releaseSlotOnUnload(state.eventId, state.heldSlotTime);
    });
}

/**
 * Registration with no event: a general record request rather than a booking.
 *
 * The WAITLIST row in Events lists no services, so rendering the (empty) service
 * picker also collapses the consent accordion and the signature pad — a general
 * record request carries nothing to consent to.
 */
function startGeneralRegistration() {
    state.eventId = GENERAL_REGISTRATION_EVENT_ID;
    state.isWaitlist = true;

    dom.slotSection.classList.add('d-none');
    dom.formSection.classList.remove('d-none');
    dom.timer.classList.add('d-none');
    dom.eventDetails.innerHTML = '<b>General Registration</b>';

    initSignaturePad();
    renderDynamicForms(currentEvent());
}

async function init() {
    showLoading('Loading available appointments…');

    try {
        setupEventListeners();

        const params = new URLSearchParams(window.location.search);
        const eventId = params.get('eventId');
        const campaignId = params.get('campaignId');
        const facilityId = params.get('facilityId');

        [
            state.events,
            state.slots,
            state.serviceTypes,
            state.forms,
            state.questions,
            state.consentBlocks
        ] = await Promise.all([
            fetchCSV(CSV_URLS.events),
            fetchCSV(CSV_URLS.slots),
            fetchCSV(CSV_URLS.serviceTypes),
            fetchCSV(CSV_URLS.forms),
            fetchCSV(CSV_URLS.questions),
            fetchCSV(CSV_URLS.consentBlocks)
        ]);

        if (eventId) {
            state.eventId = eventId;
            const event = state.events.find(row => String(row.EventID) === String(eventId));
            if (!event) {
                handleError('We could not find that event. Please check the link you followed.');
                return;
            }
            displayEventDetails(event);
            renderSlots();
        } else if (campaignId || facilityId) {
            dom.slotSection.classList.add('d-none');
            dom.formSection.classList.add('d-none');
            dom.eventSelectionSection.classList.remove('d-none');
            renderEventCards({ campaignId, facilityId });
        } else {
            startGeneralRegistration();
        }
    } catch (error) {
        handleError('We could not load the registration page. Please refresh and try again.', error);
    } finally {
        hideLoading();
    }
}

// `type="module"` scripts are deferred, so the DOM is already parsed here. Guard
// anyway in case the script is ever loaded some other way.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
