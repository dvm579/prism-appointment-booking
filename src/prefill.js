// Questionnaire questions the patient panel has already asked.
//
// The School Health shared core is the paper form's front page, so it repeats
// the patient panel: middle name, race, ethnicity, who is filling it in, a phone
// number. Asking twice makes a long form longer and lets the two answers
// disagree. These questions are still rendered, and still gated by their
// triggers like any other, but are never shown: their answer is taken from the
// panel when the responses are collected, so Question Responses and the Core
// Field Map still get a value for every printed field.
//
// Only equivalents belong here. Sex at birth is not gender, so it stays asked;
// so does anything else the patient could reasonably answer differently.

import { ageYears } from './patient.js';

/** Panel answers reworded to the paper form's own option, where they differ. */
const RACE = {
    'White or Caucasian': 'White',
    'Prefer not to answer': 'Prefer not to say'
};
const ETHNICITY = {
    'Prefer not to answer': 'Prefer not to say'
};

const field = id => String(document.getElementById(id)?.value ?? '').trim();
const isMinor = () => {
    const years = ageYears();
    return years !== null && years < 18;
};
const fullName = () => [field('firstName'), field('middleName'), field('lastName')]
    .filter(Boolean)
    .join(' ');

/**
 * QuestionID → the answer it takes from the panel.
 *
 * Race and ethnicity pass through unchanged when the paper form has no match
 * ("Middle Eastern or North African", "Unknown"): a value the printed form cannot
 * tick is still better recorded than dropped.
 */
const PREFILLED = {
    'shccore-5': () => field('middleName'),        // Child's middle name
    'shccore-51': () => field('middleName'),       // Middle name (18+)
    'shccore-6': () => RACE[field('race')] ?? field('race'),
    'shccore-7': () => ETHNICITY[field('ethnicity')] ?? field('ethnicity'),
    // "Your name (print)" is the parent on a child's form and the patient on
    // an adult's.
    'shccore-19': () => (isMinor() ? field('parentName') : fullName()),
    'shccore-20': () => field('parentRel'),        // Relationship to child
    'shccore-46': () => field('parentName'),       // Parent or guardian (print)
    'shccore-3': () => field('parentContact') || field('cell'),
    'shccore-50': () => field('cell'),
    // The consent signature at the end of the form is the signature.
    'shccore-47': () => signedToday(),

    // The vaccine consent's own header block repeats the panel too.
    'shcvax26-1': () => fullName(),                // Child's name
    'shcvax26-2': () => field('dob'),              // Date of birth
    'shcvax26-4': () => [field('parentName'), field('parentRel')].filter(Boolean).join(', '),
    'shcvax26-13': () => signedToday(),            // Parent or guardian signature
    'shcvax26-14': () => new Date().toISOString().slice(0, 10),
    'shcvax26-15': () => field('parentContact') || field('cell')
};

function signedToday() {
    return `Signed electronically ${new Date().toISOString().slice(0, 10)}`;
}

/** True when a question is answered from the panel rather than asked. */
export function isPrefilled(questionId) {
    return Object.hasOwn(PREFILLED, questionId);
}

/** The panel's answer to a prefilled question, read now. */
export function prefilledAnswer(questionId) {
    return PREFILLED[questionId]();
}
