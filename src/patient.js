import { MAX_UPLOAD_BYTES } from './config.js';
import { dom } from './dom.js';
import { parseSheetDate, showAlert } from './utils.js';

/**
 * Demographic fields collected from the static part of the form.
 *
 * School and grade are no longer here: they are asked by the school-physical and
 * sports-physical intake forms instead, so only the patients who need them see them.
 */
export const DEMOGRAPHIC_FIELDS = [
    'firstName', 'middleName', 'lastName', 'dob', 'gender', 'race', 'ethnicity',
    'street', 'city', 'state', 'zip', 'cell', 'home', 'email', 'ssn',
    'parentName', 'parentRel', 'parentContact'
];

/**
 * The age bands services and questions are usually gated on.
 *
 * Every age value in the sheet - an `Age Eligibility` entry or an `@age`
 * trigger - is a range of whole years, and these are just the four the School
 * Health forms split on. `4-11y` is 4 through 11, `18+y` is 18 and over, so a
 * patient turning 4, 12 or 18 falls in exactly one of them. Any other range
 * (`8-11y`, `65+y`) works the same way.
 *
 * The `y` is there for Google Sheets: a bare `12-17` typed into a cell is read
 * as December 17 and stored as a date. See "A hazard with range-shaped cells" in
 * docs/schema.md.
 */
export const AGE_BANDS = ['0-3y', '4-11y', '12-17y', '18+y'];

/**
 * Parses an age value from the sheet into an inclusive range of years.
 *
 * Accepts `12-17y` and `18+y` (or `18y+`), and the bare `12-17` / `18+` the
 * sheet used before the suffix, so the page reads either vocabulary and never
 * has to ship in step with a sheet migration.
 *
 * @param {string} value
 * @returns {{low: number, high: number}|null} null when it is not an age range.
 */
export function parseAgeRange(value) {
    const match = /^(\d+)\s*(?:-\s*(\d+)\s*y?|y?\s*\+\s*y?|y)$/i.exec(String(value ?? '').trim());
    if (!match) return null;

    const low = Number(match[1]);
    if (match[2] !== undefined) return { low, high: Number(match[2]) };
    // `18+y` is open-ended; a lone `5y` is just that year.
    return { low, high: /\+/.test(match[0]) ? Infinity : low };
}

/**
 * True when a patient of `years` falls in the age range `value`.
 *
 * False while the date of birth is unknown, and for a value that is not an age
 * range at all, which is logged: an unreadable age gate hides what it guards.
 */
export function ageMatches(value, years) {
    const range = parseAgeRange(value);
    if (!range) {
        console.warn(`"${value}" is not an age range; expected e.g. 12-17y or 18+y.`);
        return false;
    }
    return years !== null && years >= range.low && years <= range.high;
}

/** Whole years between a date of birth and today. */
function ageInYears(dob) {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDelta = today.getMonth() - dob.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age -= 1;
    return age;
}

/**
 * The patient's age in whole years, which every age gate is measured against.
 *
 * @returns {number|null} null while the date of birth is blank or unparseable.
 */
export function ageYears() {
    const dob = parseSheetDate(dom.dob.value);
    if (dob === null) return null;
    const age = ageInYears(dob);
    return age < 0 ? null : age;
}

/**
 * The gender selected, or null if nothing has been chosen yet.
 *
 * @returns {string|null}
 */
export function gender() {
    return dom.gender.value || null;
}

/** Shows the guardian fields for minors, and only marks them required while visible. */
export function checkAge() {
    const dob = parseSheetDate(dom.dob.value);
    const isMinor = dob !== null && ageInYears(dob) < 18;

    dom.parentFields.classList.toggle('d-none', !isMinor);
    // Required is toggled with visibility: a required-but-hidden control makes
    // the browser refuse to submit the form without showing a message.
    dom.parentName.required = isMinor;
    dom.parentRel.required = isMinor;

    if (!isMinor) {
        dom.parentName.value = '';
        dom.parentRel.value = '';
    }
}

export function toggleRecordsSection() {
    dom.recordsSection.classList.toggle('d-none', !dom.hasRecordsCheck.checked);
    if (!dom.hasRecordsCheck.checked) {
        dom.medicalRecordsUpload.value = '';
        dom.fileList.textContent = '';
    }
}

const formatMb = bytes => (bytes / 1024 / 1024).toFixed(2);

/** Validates the upload total and summarises the selection for the user. */
export function handleFileSelection(event) {
    const files = Array.from(event.target.files);
    dom.fileList.textContent = '';

    if (files.length === 0) return;

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_UPLOAD_BYTES) {
        event.target.value = '';
        showAlert(
            `Those files total ${formatMb(totalSize)} MB. The combined size must stay under ` +
                `${formatMb(MAX_UPLOAD_BYTES)} MB — please upload fewer or smaller files.`,
            'warning'
        );
        return;
    }

    dom.fileList.textContent =
        `Selected: ${files.map(file => file.name).join(', ')} (${formatMb(totalSize)} MB)`;
}

/**
 * Reads the selected files as base64 data URLs for transport to Apps Script.
 *
 * @returns {Promise<Array<{name: string, type: string, data: string}>>}
 */
export async function readFilesAsBase64(fileInput) {
    const files = Array.from(fileInput.files ?? []);
    if (files.length === 0) return [];

    return Promise.all(
        files.map(
            file =>
                new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () =>
                        resolve({ name: file.name, type: file.type, data: reader.result });
                    reader.onerror = () =>
                        reject(new Error(`Could not read "${file.name}". Please try a different file.`));
                    reader.readAsDataURL(file);
                })
        )
    );
}
