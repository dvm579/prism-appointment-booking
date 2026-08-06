// Resolves an event's service codes into the forms and consent it actually needs.
//
// The Events sheet names only service codes. Everything else — patient-facing
// label, which intake forms to show, which consent applies — is looked up in
// Service Types, so there is exactly one place to maintain it.

import { state } from './state.js';

/** Splits a comma-separated sheet cell into trimmed, non-empty values. */
export function splitList(value) {
    return String(value ?? '')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
}

/**
 * A service offered at an event, with everything it drags along.
 *
 * @typedef {Object} Service
 * @property {string} id ServiceTypeID, e.g. "VAXADMIN"
 * @property {string} name Patient-facing label from Service Types
 * @property {string[]} formIds Intake forms, in sheet order
 * @property {string[]} consentIds Consent blocks this service requires
 * @property {string[]} ageBands Age bands eligible for it; empty means any age
 * @property {string[]} genders Genders eligible for it; empty means any gender
 */

/**
 * The services an event offers, in the order the Events row lists them.
 *
 * `Active` on Service Types is not consulted here: it governs which services can
 * be picked when authoring a new event, not whether an already-scheduled event
 * still honours what it advertised. Filtering on it would strand patients on
 * existing events whose service has since been retired.
 *
 * @param {Object|null} event
 * @returns {Service[]}
 */
export function servicesForEvent(event) {
    return splitList(event?.Services)
        .map(code => {
            const row = state.serviceTypes.find(
                service => String(service.ServiceTypeID) === String(code)
            );
            if (!row) {
                console.warn(`Service "${code}" is not defined in Service Types; skipping it.`);
                return null;
            }
            return {
                id: String(row.ServiceTypeID),
                name: row['Service Name'] || String(row.ServiceTypeID),
                // Column is singular in the sheet but read as a list, so a service
                // can require several intake forms.
                formIds: splitList(row['Intake Form']),
                consentIds: splitList(row.ConsentIDs),
                ageBands: splitList(row['Age Eligibility']),
                genders: splitList(row['Gender Eligibility'])
            };
        })
        .filter(Boolean);
}

/**
 * Whether a service should be offered to this patient.
 *
 * An empty eligibility column means "no restriction". A restriction is only
 * applied once the demographic it depends on is actually known — gating on a
 * blank date of birth would hide every service before the patient has filled the
 * form in.
 *
 * Gender gating is skipped entirely for patients who answered Other or Decline to
 * Answer, so choosing either never narrows what is available to them.
 *
 * @param {Service} service
 * @param {{band: string|null, genderUngated: boolean, gender: string|null}} patient
 */
export function isServiceEligible(service, patient) {
    if (service.ageBands.length && patient.band && !service.ageBands.includes(patient.band)) {
        return false;
    }
    if (
        service.genders.length &&
        !patient.genderUngated &&
        patient.gender &&
        !service.genders.includes(patient.gender)
    ) {
        return false;
    }
    return true;
}

/** Display name for a form, from the Forms sheet. */
export function formName(formId) {
    const row = state.forms.find(form => String(form.FormID) === String(formId));
    return row?.['Form Name'] || formId;
}

/**
 * Union of intake forms across a set of services, deduplicated.
 *
 * A form required by two selected services is presented once — the order of first
 * appearance is kept so the sequence is stable as services are ticked.
 *
 * @param {Service[]} services
 * @returns {string[]}
 */
export function formsForServices(services) {
    const seen = new Set();
    const formIds = [];
    services.forEach(service =>
        service.formIds.forEach(formId => {
            if (seen.has(formId)) return;
            seen.add(formId);
            formIds.push(formId);
        })
    );
    return formIds;
}

/**
 * Union of consent blocks across a set of services.
 *
 * Deduplicated by ConsentID, so two services sharing one consent show it once,
 * then ordered by the sheet's DisplayOrder. Deduplicating by id rather than by
 * comparing HTML is why consent lives in its own sheet.
 *
 * @param {Service[]} services
 * @returns {Array<{id: string, name: string, html: string, order: number}>}
 */
export function consentForServices(services) {
    const ids = new Set();
    services.forEach(service => service.consentIds.forEach(id => ids.add(id)));

    return [...ids]
        .map(id => {
            const row = state.consentBlocks.find(
                block => String(block.ConsentID) === String(id)
            );
            if (!row) {
                console.warn(`Consent block "${id}" is missing from Consent Blocks.`);
                return null;
            }
            const order = Number(row.DisplayOrder);
            return {
                id: String(row.ConsentID),
                name: row['Consent Name'] || String(row.ConsentID),
                html: row.ConsentHTML || '',
                order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER
            };
        })
        .filter(block => block && block.html.trim())
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * The questions belonging to one form, in the order the sheet asks for.
 *
 * Rows without a usable DisplayOrder keep their relative sheet position, at the end.
 */
export function questionsForForm(formId) {
    return state.questions
        .filter(question => String(question.FormID) === String(formId))
        .map((question, index) => ({ question, index }))
        .sort((a, b) => {
            const orderA = Number(a.question.DisplayOrder);
            const orderB = Number(b.question.DisplayOrder);
            const validA = Number.isFinite(orderA);
            const validB = Number.isFinite(orderB);
            if (validA && validB && orderA !== orderB) return orderA - orderB;
            if (validA !== validB) return validA ? -1 : 1;
            return a.index - b.index;
        })
        .map(entry => entry.question);
}

/** Looks up a question definition by id. */
export function findQuestion(questionId) {
    return state.questions.find(q => String(q.QuestionID) === String(questionId)) || null;
}
