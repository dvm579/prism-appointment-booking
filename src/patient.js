import { MAX_UPLOAD_BYTES } from './config.js';
import { dom } from './dom.js';
import { parseSheetDate, showAlert } from './utils.js';

/** Demographic fields collected from the static part of the form. */
export const DEMOGRAPHIC_FIELDS = [
    'firstName', 'middleName', 'lastName', 'dob', 'gender', 'race', 'ethnicity',
    'street', 'city', 'state', 'zip', 'cell', 'home', 'email', 'ssn',
    'parentName', 'parentRel', 'parentContact', 'school', 'grade'
];

/** Whole years between a date of birth and today. */
function ageInYears(dob) {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDelta = today.getMonth() - dob.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age -= 1;
    return age;
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
