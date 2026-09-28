// Turns the registration form into one screen at a time.
//
// The School Health intake runs to 135 questions for a single eight-year-old,
// which as one page is about fifteen thousand pixels of scroll. Nothing about
// that is completable on a phone in a school corridor, so the same markup is
// shown a step at a time with a progress bar and a Next button.
//
// Steps hide with their own class, never with `d-none`. That distinction
// matters: `d-none` means "this does not apply to this patient", and both
// `collectResponses` and the trigger cascade read it. A step the patient has
// already filled in is still part of the submission, so it must stay collectable
// while off screen.

import { dom } from './dom.js';

/** Applied to a panel that belongs to a step other than the current one. */
const OFF_STEP = 'step-off';

let steps = [];
let index = 0;

/** Panels in the order the patient meets them, outside the questionnaire. */
function fixedPanels() {
    return [
        { el: dom.patientInfo, title: 'About the patient' },
        { el: dom.insuranceMount, title: 'Insurance' },
        { el: dom.recordsSection, title: 'Medical records' },
        { el: dom.consentFieldset, title: 'Consent and signature' }
    ];
}

/** True when a panel has nothing the patient can currently act on. */
function isEmpty(el) {
    if (!el || el.classList.contains('d-none')) return true;
    // A question wrapper hidden by its trigger does not count towards the step.
    return !Array.from(el.querySelectorAll('[data-question-id], input, select, textarea'))
        .some(control => !control.closest('.d-none'));
}

/**
 * Hides the heading of any section left with nothing to answer, and returns the
 * ones still worth naming.
 *
 * A section can empty out entirely — "About you" is adult-only, so a child's
 * registration keeps the heading and nothing beneath it. Only the heading is
 * hidden, never the box: hiding the box would put its questions behind `d-none`
 * and drop them from the submission.
 *
 * @returns {string[]} the sections that still have something in them.
 */
function liveSections(panel) {
    const alive = [];
    const headings = [];
    panel.querySelectorAll('.question-section').forEach(box => {
        const empty = isEmpty(box);
        const heading = box.querySelector('h5');
        if (heading) heading.classList.toggle('d-none', empty);
        if (!empty) {
            alive.push(box.dataset.section);
            if (heading) headings.push(heading);
        }
    });

    // With one section left, the step's own title already names it, and showing
    // both puts the same words on screen twice.
    if (headings.length === 1) headings[0].classList.add('d-none');
    return alive;
}

/**
 * Recomputes the step list from what is currently on the page.
 *
 * Called after every render and after any change that can reveal or withdraw a
 * question, because a step whose questions have all been triggered away should
 * not be a screen the patient has to click past.
 */
export function refreshSteps({ keepPosition = true } = {}) {
    if (!dom.stepNav) return;

    const container = dom.dynamicFormsContainer;
    const picker = container.querySelector('.service-picker');
    const fixed = fixedPanels();

    const candidates = [
        fixed[0],
        picker ? { el: picker, title: 'Services' } : null,
        ...Array.from(container.querySelectorAll('.question-step')).map(el => {
            const alive = liveSections(el);
            return { el, title: alive.join(' · ') || el.dataset.stepTitle || 'Questions' };
        }),
        fixed[1],
        fixed[2],
        fixed[3]
    ].filter(Boolean);

    const previous = steps[index]?.el ?? null;
    steps = candidates.filter(step => !isEmpty(step.el));

    // Everything that can be a step gets the class; `show` clears it for one.
    candidates.forEach(step => step.el.classList.add(OFF_STEP));

    if (steps.length === 0) return;

    const wanted = keepPosition && previous ? steps.findIndex(s => s.el === previous) : 0;
    show(wanted === -1 ? Math.min(index, steps.length - 1) : wanted);
}

/** Shows one step and repaints the progress bar. */
function show(next) {
    index = Math.max(0, Math.min(next, steps.length - 1));

    steps.forEach((step, i) => step.el.classList.toggle(OFF_STEP, i !== index));

    const current = steps[index];
    const percent = Math.round(((index + 1) / steps.length) * 100);

    dom.stepTitle.textContent = current.title;
    dom.stepCount.textContent = `Step ${index + 1} of ${steps.length}`;
    dom.stepBar.style.width = `${percent}%`;
    dom.stepBar.parentElement.setAttribute('aria-valuenow', String(percent));

    dom.stepBack.disabled = index === 0;
    const last = index === steps.length - 1;
    dom.stepNext.classList.toggle('d-none', last);
    dom.submitButton.classList.toggle('d-none', !last);

    dom.stepNav.classList.remove('d-none');
    current.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Checks the controls on the current step before letting the patient past it.
 *
 * Only this step's controls are checked. Running the browser's whole-form
 * validation here would trip over required fields on steps the patient has not
 * reached, which report as invalid and unfocusable.
 *
 * @returns {Element|null} the first control that needs attention.
 */
function firstInvalidOnStep() {
    const step = steps[index];
    if (!step) return null;

    for (const control of step.el.querySelectorAll('input, select, textarea')) {
        if (control.closest('.d-none') || control.disabled) continue;
        if (!control.checkValidity()) return control;
    }
    return null;
}

/** Moves forward, refusing while the current step has an unanswered required field. */
function next() {
    const invalid = firstInvalidOnStep();
    if (invalid) {
        dom.regForm.classList.add('was-validated');
        invalid.reportValidity?.();
        invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    show(index + 1);
}

/**
 * Brings an element on screen even when it belongs to another step.
 *
 * Submission validation can reject something the patient filled in five steps
 * ago; scrolling to it without showing its step would scroll to nothing.
 *
 * @returns {boolean} false when the element is not on any step.
 */
export function revealElement(element) {
    if (!element || steps.length === 0) return false;

    const at = steps.findIndex(step => step.el === element || step.el.contains(element));
    if (at === -1) return false;

    if (at !== index) show(at);
    return true;
}

/** Wires the navigation buttons. Safe to call more than once. */
export function attachStepListeners() {
    if (!dom.stepNav || dom.stepNav.dataset.listening === 'true') return;
    dom.stepNav.dataset.listening = 'true';

    dom.stepNext.addEventListener('click', next);
    dom.stepBack.addEventListener('click', () => show(index - 1));
}
