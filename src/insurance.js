// The insurance block, driven by a `QuestionType = insurance` row in Form Questions.
//
// The block is mounted in one fixed place rather than inline where the question
// appears: several selected forms may ask for insurance, and the details belong to
// the patient, not to a questionnaire. Mounting once also means the answers
// survive a service being toggled off and back on.

import { REQUIRED_INSURANCE_FIELDS } from './config.js';
import { dom } from './dom.js';

/** Insurance fields sent with the submission, in `Patients` column order. */
export const INSURANCE_FIELDS = [
    'primaryIns', 'primaryPayer', 'primaryPlan', 'primaryId', 'primaryGroup', 'primaryPayerId',
    'secondaryIns', 'secondaryPlan', 'secondaryId', 'secondaryGroup', 'secondaryPayerId'
];

let mounted = false;

function fields() {
    return dom.insuranceMount.querySelectorAll('input, select, textarea');
}

/** Reflects the uninsured/insured choice into the detail fields. */
function applyCoverageChoice() {
    const choice = dom.insuranceMount.querySelector('input[name="hasInsurance"]:checked');
    const insured = choice?.value === 'yes';
    const details = dom.insuranceMount.querySelector('#insuranceDetails');
    if (!details) return;

    details.classList.toggle('d-none', !insured);

    // Required is toggled with visibility, never left on a hidden control: a
    // required field the browser cannot focus aborts submission silently.
    REQUIRED_INSURANCE_FIELDS.forEach(name => {
        const input = details.querySelector(`[name="${name}"]`);
        if (input) input.required = insured;
    });

    if (!insured) {
        details.querySelectorAll('input, select, textarea').forEach(input => {
            input.value = '';
        });
    }
}

/** Clones the template into the page. Safe to call more than once. */
function mount() {
    if (mounted) return;
    dom.insuranceMount.appendChild(dom.insuranceTemplate.content.cloneNode(true));
    dom.insuranceMount.addEventListener('change', event => {
        if (event.target.name === 'hasInsurance') applyCoverageChoice();
    });
    mounted = true;
}

/**
 * Shows or hides the insurance block.
 *
 * @param {boolean} visible True when a selected form asks for insurance.
 */
export function setInsuranceVisible(visible) {
    if (visible) mount();
    if (!mounted) return;

    dom.insuranceMount.classList.toggle('d-none', !visible);

    const choices = dom.insuranceMount.querySelectorAll('input[name="hasInsurance"]');
    choices.forEach(choice => {
        choice.required = visible;
        if (!visible) choice.checked = false;
    });

    if (!visible) {
        fields().forEach(input => {
            if (input.type !== 'radio') input.value = '';
            input.required = false;
        });
        dom.insuranceMount.querySelector('#insuranceDetails')?.classList.add('d-none');
    } else {
        applyCoverageChoice();
    }
}

/** True when the patient said they have coverage. */
export function hasCoverage() {
    return (
        mounted &&
        dom.insuranceMount.querySelector('input[name="hasInsurance"]:checked')?.value === 'yes'
    );
}
