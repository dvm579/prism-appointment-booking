// Paper or online intake, decided per event.
//
// Paper intake keeps the registration to what the EMR needs before the day: the
// patient panel, the services they are booking, and their insurance. Intake
// forms, consent and signatures are filled in on paper on site and scanned to
// the chart, so none of them are rendered here - and because the submission then
// names no forms, neither backend generates a document for them.
//
// It is a mode of the one page rather than a fork of it, so the full forms keep
// working on any event set to `online` while they are polished.

import { DEFAULT_INTAKE } from './config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { toggleRecordsSection } from './patient.js';

/**
 * True when this event's forms are done on paper.
 *
 * The Events row's `Intake` column wins when it says `paper` or `online`;
 * anything else, including the column not existing, falls back to DEFAULT_INTAKE.
 *
 * @param {Object|null} event Row from the Events sheet.
 */
export function isPaperIntake(event) {
    const value = String(event?.Intake ?? '').trim().toLowerCase();
    if (value === 'paper' || value === 'online') return value === 'paper';
    return String(DEFAULT_INTAKE).trim().toLowerCase() === 'paper';
}

/**
 * Sets the mode for the event about to be rendered, and the page furniture that
 * follows from it.
 *
 * Reversible, because the event picker can render one event and then another.
 */
export function applyIntakeMode(event) {
    const paper = isPaperIntake(event);
    state.paperIntake = paper;

    dom.paperIntakeNote.classList.toggle('d-none', !paper);
    dom.confPaperNote.classList.toggle('d-none', !paper);

    // Records are scanned on site with the forms.
    dom.recordsToggle.classList.toggle('d-none', paper);
    if (paper && dom.hasRecordsCheck.checked) {
        dom.hasRecordsCheck.checked = false;
        toggleRecordsSection();
    }

    // Nothing is signed online, so there is no electronic signature to agree to.
    // Required follows visibility: a required control the patient cannot see
    // blocks the step with no message.
    dom.electronicConsentRow.classList.toggle('d-none', paper);
    dom.electronicConsent.required = !paper;
    if (paper) dom.electronicConsent.checked = false;

    dom.consentHeading.textContent = paper ? 'Contact Preferences' : 'Consent & Signature';
}
