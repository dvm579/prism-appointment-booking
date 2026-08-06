// Service selection and the questionnaires it pulls in.
//
// The patient picks services; everything else follows. Selecting a service reveals
// the union of its intake forms (each rendered once, however many services need
// it), assembles the union of its consent blocks, and decides whether a signature
// is required at all.

import { dom } from './dom.js';
import { state } from './state.js';
import {
    consentForServices,
    findQuestion,
    formName,
    formsForServices,
    isServiceEligible,
    questionsForForm,
    servicesForEvent,
    splitList
} from './catalog.js';
import { setInsuranceVisible } from './insurance.js';
import { setConsentSignatureVisible, syncAdditionalSignatures } from './signature.js';
import { ageBand, gender, genderIsUngated } from './patient.js';
import { escapeHtml, isTruthyFlag } from './utils.js';

/** Question types handled specially rather than rendered as a plain field. */
const INSURANCE_TYPE = 'insurance';
const SIGNATURE_TYPE = 'signature';

/**
 * Prefix marking a TriggerID as referring to a demographic field rather than
 * another question in the same form — `@age` or `@gender`.
 */
const DEMOGRAPHIC_TRIGGER = '@';

/** Services offered at the current event, keyed by ServiceTypeID. */
const offered = new Map();

let listenersAttached = false;

// --- Question rendering -----------------------------------------------------

/**
 * Builds the markup for one question.
 *
 * Generated inputs deliberately carry NO `required` attribute. A `required`
 * control inside a hidden section makes the browser abort submission with
 * "An invalid form control is not focusable" — no message, and the submit handler
 * never runs, so the page looks frozen. Every question here sits in a section that
 * may be hidden, so required-ness is enforced by `collectResponses()`, which knows
 * what is actually visible.
 */
function createQuestionElement(question) {
    const wrapper = document.createElement('div');
    wrapper.className = 'mb-3';

    const questionId = question.QuestionID;
    const type = String(question.QuestionType ?? '').trim();
    const required = isTruthyFlag(question.IsRequired);

    // The insurance block is mounted once, in a fixed place. The question row is
    // only a marker that this form needs it, so nothing is rendered inline.
    if (type === INSURANCE_TYPE) {
        wrapper.classList.add('d-none');
        wrapper.dataset.insuranceMarker = questionId;
        return wrapper;
    }

    const triggerId = String(question.TriggerID ?? '').trim();
    if (triggerId) {
        wrapper.classList.add('d-none', 'conditional-question');
        wrapper.dataset.triggerId = triggerId;
        // Stored raw; `triggerValues()` splits the list and defaults a blank to "Yes".
        wrapper.dataset.triggerValue = String(question.TriggerValue ?? '').trim();
        // `@age` / `@gender` are evaluated against the demographics section rather
        // than against another question, so they are re-checked whenever those
        // fields change instead of on a change inside this container.
        if (triggerId.startsWith(DEMOGRAPHIC_TRIGGER)) {
            wrapper.dataset.demographicTrigger = triggerId.slice(1).toLowerCase();
        }
    }

    const label = document.createElement('label');
    label.className = 'form-label';
    label.setAttribute('for', questionId);
    label.textContent = question.QuestionText;
    if (required) {
        const asterisk = document.createElement('span');
        asterisk.className = 'text-danger ms-1';
        asterisk.textContent = '*';
        label.appendChild(asterisk);
    }
    wrapper.appendChild(label);

    const id = escapeHtml(questionId);
    const options = splitList(question.Options);
    const ariaRequired = required ? 'aria-required="true"' : '';
    let inputHtml;

    switch (type) {
        // A signature question asks Yes/No here and adds a pad at the end of the
        // form, so the questionnaire's flow is not interrupted by a drawing area.
        case SIGNATURE_TYPE:
            wrapper.dataset.signatureQuestion = questionId;
            wrapper.dataset.signatureLabel = question.QuestionText || 'Signature';
            inputHtml = `
                <p class="small mb-1">You will be asked to sign at the end of this form.</p>
                <div class="row g-2">
                    ${['Yes', 'No']
                        .map(
                            choice => `
                    <div class="col-6 col-md-3">
                        <input class="form-check-input" type="radio" name="${id}" id="${id}_${choice.toLowerCase()}"
                               value="${choice}" data-question-id="${id}" ${ariaRequired}>
                        <label class="form-check-label ms-2" for="${id}_${choice.toLowerCase()}">${choice}</label>
                    </div>`
                        )
                        .join('')}
                </div>`;
            break;

        case 'single_select':
            inputHtml = `
                <select class="form-select" name="${id}" id="${id}" data-question-id="${id}" ${ariaRequired}>
                    <option value="">Select an option…</option>
                    ${options
                        .map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`)
                        .join('')}
                </select>`;
            break;

        case 'multi_select':
            inputHtml = `<div class="mt-1">
                ${options
                    .map(
                        (opt, index) => `
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="${id}" id="${id}_${index}"
                               value="${escapeHtml(opt)}" data-question-id="${id}" ${ariaRequired}>
                        <label class="form-check-label" for="${id}_${index}">${escapeHtml(opt)}</label>
                    </div>`
                    )
                    .join('')}
            </div>`;
            break;

        case 'radio_yes_no':
            inputHtml = `
                <div class="row g-2">
                    ${['Yes', 'No']
                        .map(
                            choice => `
                    <div class="col-6 col-md-3">
                        <input class="form-check-input" type="radio" name="${id}" id="${id}_${choice.toLowerCase()}"
                               value="${choice}" data-question-id="${id}" ${ariaRequired}>
                        <label class="form-check-label ms-2" for="${id}_${choice.toLowerCase()}">${choice}</label>
                    </div>`
                        )
                        .join('')}
                </div>`;
            break;

        case 'text_area':
            inputHtml = `<textarea class="form-control" name="${id}" id="${id}" rows="2" data-question-id="${id}" ${ariaRequired}></textarea>`;
            break;

        case 'date':
            inputHtml = `<input type="date" class="form-control" name="${id}" id="${id}" data-question-id="${id}" ${ariaRequired}>`;
            break;

        default:
            inputHtml = `<input type="text" class="form-control" name="${id}" id="${id}" data-question-id="${id}" ${ariaRequired}>`;
    }

    const inputWrapper = document.createElement('div');
    inputWrapper.innerHTML = inputHtml;
    wrapper.appendChild(inputWrapper);
    return wrapper;
}

/**
 * The values that reveal a conditional question.
 *
 * `TriggerValue` is comma-separated, so one row can list several — `0-12, 12-18`
 * for any minor, or `Yes, Not sure` to catch both. A blank cell means "Yes",
 * which is what a bare `TriggerID` on a yes/no question is always meant to say.
 *
 * As with `Options`, a value therefore cannot itself contain a comma.
 *
 * @returns {string[]}
 */
function triggerValues(wrapper) {
    const values = splitList(wrapper.dataset.triggerValue);
    return values.length ? values : ['Yes'];
}

/** Clears every control inside a container that is being hidden. */
function clearInputs(container) {
    container.querySelectorAll('input, select, textarea').forEach(input => {
        if (input.type === 'checkbox' || input.type === 'radio') input.checked = false;
        else input.value = '';
    });
}

// --- Rendering --------------------------------------------------------------

/**
 * Renders the service picker and one collapsed section per intake form.
 *
 * Sections are titled with the form's name rather than a service name, because a
 * form shared by two services belongs to neither exclusively.
 *
 * @param {Object|null} event Row from the Events sheet.
 */
export function renderDynamicForms(event) {
    const container = dom.dynamicFormsContainer;
    container.innerHTML = '';
    offered.clear();

    const services = servicesForEvent(event);
    services.forEach(service => offered.set(service.id, service));

    if (services.length === 0) {
        applySelection();
        return;
    }

    // 1. Service picker. Every service the event offers gets a row; eligibility
    //    then hides the ones that do not apply to this patient.
    const picker = document.createElement('div');
    picker.className = 'service-picker mb-4 p-3 border border-primary rounded';
    picker.innerHTML = '<h5 class="mb-3">Please select the services you would like to receive:</h5>';
    services.forEach(service => {
        const row = document.createElement('div');
        row.className = 'form-check form-switch mb-2 service-option';
        row.dataset.serviceId = service.id;
        row.innerHTML = `
            <input class="form-check-input service-selector" type="checkbox"
                   id="select_${escapeHtml(service.id)}" value="${escapeHtml(service.id)}">
            <label class="form-check-label" for="select_${escapeHtml(service.id)}">${escapeHtml(service.name)}</label>`;
        picker.appendChild(row);
    });

    const note = document.createElement('p');
    note.id = 'serviceEligibilityNote';
    note.className = 'small mb-0 mt-3 d-none';
    picker.appendChild(note);

    container.appendChild(picker);

    // 2. One section per form used by any service at this event, hidden until the
    //    patient selects a service that needs it.
    const sections = document.createElement('div');
    sections.id = 'questionsContent';
    container.appendChild(sections);

    formsForServices(services).forEach(formId => {
        const section = document.createElement('div');
        section.id = `section_${formId}`;
        section.className = 'd-none mt-4 form-section';
        section.dataset.formId = formId;
        section.innerHTML = `<hr><h4 class="mb-3 text-info">${escapeHtml(formName(formId))}</h4>`;

        questionsForForm(formId).forEach(question =>
            section.appendChild(createQuestionElement(question))
        );

        sections.appendChild(section);
    });

    attachListeners();
    applyServiceEligibility();
    applySelection();
}

/** The services the patient has ticked. */
function selectedServices() {
    return Array.from(dom.dynamicFormsContainer.querySelectorAll('.service-selector:checked'))
        .map(checkbox => offered.get(checkbox.value))
        .filter(Boolean);
}

/**
 * Hides services the patient is not eligible for, based on the demographics above.
 *
 * Called whenever date of birth or gender changes, so a corrected date of birth
 * immediately corrects what is on offer. A service that becomes ineligible while
 * selected is unticked, which then cascades through `applySelection` to withdraw
 * its forms and consent.
 *
 * @returns {boolean} true when the selection changed and callers must recompute.
 */
export function applyServiceEligibility() {
    const patient = { band: ageBand(), gender: gender(), genderUngated: genderIsUngated() };
    const rows = dom.dynamicFormsContainer.querySelectorAll('.service-option');
    if (rows.length === 0) return false;

    let hidden = 0;
    let unticked = false;

    rows.forEach(row => {
        const service = offered.get(row.dataset.serviceId);
        if (!service) return;

        const eligible = isServiceEligible(service, patient);
        row.classList.toggle('d-none', !eligible);
        if (eligible) return;

        hidden += 1;
        const checkbox = row.querySelector('.service-selector');
        if (checkbox.checked) {
            checkbox.checked = false;
            unticked = true;
        }
    });

    const note = document.getElementById('serviceEligibilityNote');
    if (note) {
        if (hidden === rows.length) {
            note.textContent =
                'None of the services at this event are available for the date of birth and ' +
                'gender entered above. Please check those details, or speak to our team.';
            note.className = 'small mb-0 mt-3 text-warning';
        } else if (hidden > 0) {
            note.textContent =
                'Some services are not listed because they do not apply to the age or gender ' +
                'entered above.';
            note.className = 'small mb-0 mt-3 text-white-50';
        } else {
            note.className = 'small mb-0 mt-3 d-none';
        }
    }

    return unticked;
}

/**
 * Shows or hides questions gated on a demographic field.
 *
 * While the demographic is still unknown the question stays hidden: we cannot tell
 * whether it applies, and hidden questions are neither validated nor submitted.
 * Date of birth and gender are both required, so the correct set is always
 * revealed before the form can be submitted.
 */
function applyDemographicConditionals() {
    const values = { age: ageBand(), gender: gender() };

    dom.dynamicFormsContainer.querySelectorAll('[data-demographic-trigger]').forEach(wrapper => {
        const field = wrapper.dataset.demographicTrigger;
        const actual = values[field];

        if (!(field in values)) {
            console.warn(
                `Unknown demographic trigger "@${field}" on a question; expected @age or @gender.`
            );
        }

        const matches = actual !== null && actual !== undefined && triggerValues(wrapper).includes(actual);
        if (matches === !wrapper.classList.contains('d-none')) return;

        wrapper.classList.toggle('d-none', !matches);
        if (!matches) clearInputs(wrapper);
    });
}

/** Re-runs everything that depends on the demographics section. */
export function refreshForDemographics() {
    applyServiceEligibility();
    applySelection();
}

/**
 * Recomputes everything that depends on the current service selection: which form
 * sections are visible, the consent text, whether a signature is required, and
 * whether the insurance block applies.
 */
function applySelection() {
    const services = selectedServices();
    const neededForms = new Set(formsForServices(services));

    dom.dynamicFormsContainer.querySelectorAll('.form-section').forEach(section => {
        const needed = neededForms.has(section.dataset.formId);
        if (needed === !section.classList.contains('d-none')) return;
        section.classList.toggle('d-none', !needed);
        if (!needed) clearInputs(section);
    });

    // Evaluated after sections are shown, so questions inside a newly revealed
    // form are gated on the demographics straight away.
    applyDemographicConditionals();

    // Consent: union of the selected services' blocks, deduplicated by id.
    const blocks = consentForServices(services);
    dom.consentBody.innerHTML = blocks.map(block => block.html).join('\n<hr>\n');
    dom.consentAccordion.classList.toggle('d-none', blocks.length === 0);
    setConsentSignatureVisible(blocks.length > 0);

    // Insurance applies when any visible form asks for it.
    setInsuranceVisible(
        dom.dynamicFormsContainer.querySelectorAll(
            '.form-section:not(.d-none) [data-insurance-marker]'
        ).length > 0
    );

    syncRequestedSignatures();
}

/** Adds a pad for every visible signature question answered "Yes". */
function syncRequestedSignatures() {
    const requested = [];
    dom.dynamicFormsContainer
        .querySelectorAll('[data-signature-question]')
        .forEach(wrapper => {
            if (wrapper.closest('.d-none')) return;
            const questionId = wrapper.dataset.signatureQuestion;
            const answered = wrapper.querySelector(`input[name="${CSS.escape(questionId)}"]:checked`);
            if (answered?.value === 'Yes') {
                requested.push({ questionId, label: wrapper.dataset.signatureLabel });
            }
        });
    syncAdditionalSignatures(requested);
}

/**
 * Wires up the container once.
 *
 * `renderDynamicForms` can run more than once per page (pick a slot, go back, pick
 * another), and a second set of listeners would process every change twice.
 */
function attachListeners() {
    if (listenersAttached) return;
    listenersAttached = true;

    dom.dynamicFormsContainer.addEventListener('change', event => {
        const input = event.target;

        if (input.classList.contains('service-selector')) {
            applySelection();
            return;
        }

        const questionId = input.dataset?.questionId;
        if (!questionId) return;

        applyConditionalLogic(input, questionId);

        // A signature question's Yes/No decides whether its pad exists.
        if (input.closest('[data-signature-question]')) syncRequestedSignatures();
    });
}

/** Shows or hides questions that depend on the answer just given. */
function applyConditionalLogic(input, questionId) {
    const dependents = dom.dynamicFormsContainer.querySelectorAll(
        `[data-trigger-id="${CSS.escape(questionId)}"]`
    );
    if (dependents.length === 0) return;

    dependents.forEach(dependent => {
        const expected = triggerValues(dependent);
        let matches;

        if (input.type === 'radio' || input.type === 'checkbox') {
            // Read the group's state rather than the clicked input, so unchecking
            // also collapses the dependent question.
            const selected = dom.dynamicFormsContainer.querySelectorAll(
                `input[name="${CSS.escape(input.name)}"]:checked`
            );
            matches = Array.from(selected).some(option => expected.includes(option.value));
        } else {
            matches = expected.includes(input.value);
        }

        if (matches) {
            dependent.classList.remove('d-none');
        } else {
            dependent.classList.add('d-none');
            clearInputs(dependent);
        }
    });

    // A revealed or collapsed question may itself be a signature request.
    syncRequestedSignatures();
}

// --- Reading the answers ----------------------------------------------------

/**
 * The services to record, each carrying the forms it pulled in.
 *
 * `formIds` lets the backend map a questionnaire answer back to the right
 * ServiceID even when a form is shared between services.
 */
export function collectSelectedServices() {
    return selectedServices().map(service => ({
        id: service.id,
        name: service.name,
        serviceTypeId: service.id,
        formIds: service.formIds
    }));
}

/** True when any selected service requires consent, so a signature is needed. */
export function consentRequired() {
    return consentForServices(selectedServices()).length > 0;
}

/**
 * Reads every visible questionnaire answer and validates the required ones.
 *
 * @returns {{responses: Array<{questionId: string, answer: string, formId: string}>,
 *            firstInvalid: Element|null}}
 */
export function collectResponses() {
    const container = dom.dynamicFormsContainer;
    const responses = [];
    const seenGroups = new Set();
    let firstInvalid = null;

    for (const input of container.querySelectorAll('[data-question-id]')) {
        // Hidden means an unselected service or an untriggered conditional
        // question; neither should be answered or validated.
        if (input.closest('.d-none')) continue;

        const groupName = input.name;
        if (seenGroups.has(groupName)) continue;
        seenGroups.add(groupName);

        const questionId = input.dataset.questionId;
        const definition = findQuestion(questionId);
        const required = definition ? isTruthyFlag(definition.IsRequired) : false;

        let answer;
        if (input.type === 'radio') {
            const selected = container.querySelector(
                `input[name="${CSS.escape(groupName)}"]:checked`
            );
            answer = selected ? selected.value : '';
        } else if (input.type === 'checkbox') {
            const checked = container.querySelectorAll(
                `input[name="${CSS.escape(groupName)}"]:checked`
            );
            answer = Array.from(checked)
                .map(box => box.value)
                .join(', ');
        } else {
            answer = input.value;
        }

        if (required && !String(answer).trim() && !firstInvalid) {
            firstInvalid = input;
        }

        responses.push({
            questionId,
            answer,
            formId: definition?.FormID ?? ''
        });
    }

    return { responses, firstInvalid };
}
