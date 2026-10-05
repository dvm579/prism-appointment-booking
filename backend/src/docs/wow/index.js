// The four Wellness on Wheels / mobile health forms, and their clinical rows.
//
// Values come from the placeholder maps the Apps Script generators built
// (maps.js); positions from the measured table their Slides templates were
// built from (fields.json). Filling here replaces both the Slides templates
// and the document queue for these forms.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { CLINICAL_SPREADSHEET_ID } from '../../config.js';
import { dataUrlBytes } from '../../drive.js';
import { pdfFileName } from '../../documents.js';
import { artwork, fillPdf } from '../overlay.js';
import { MAPS } from './maps.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIELDS = JSON.parse(readFileSync(path.join(here, 'fields.json'), 'utf8'));
const ASSETS = path.join(here, '..', '..', '..', 'assets', 'forms');

/** "Completed Forms/Wellness on Wheels", where AppSheet looks for these. */
const FOLDER_ID = '1gdwPfu9kRXZi8Lht-yX3OkaSJhmsKDCD';
const FOLDER_PATH = 'Completed Forms/Wellness on Wheels/';

const FORMS = {
    '99be5397': { label: 'WOWSignUp', description: 'WOW Participant Sign-Up' },
    '6f25fcaa': { label: 'WOWTestingConsent', description: 'WOW Testing Consent' },
    '63948c3e': { label: 'MobileHealthScreeningAdult', description: 'Mobile Health Screening Questionnaire - Adult' },
    'c2e4d150': { label: 'MobileHealthScreeningPediatric', description: 'Mobile Health Screening Questionnaire - Minor' }
};

/** The `info` block the generators read: pid, aid, fid, fname, ds. */
function infoOf(job) {
    return {
        pid: job.patientID,
        aid: job.appointmentID,
        fid: job.event.facilityID,
        fname: job.event.facilityName,
        ds: job.event.dateOfService
    };
}

/** PNG bytes of the signature a question collected, else the consent signature. */
function signature(job, questionId) {
    const own = (job.data.additionalSignatures || []).find(s => String(s.questionId) === questionId);
    return dataUrlBytes(own?.data) || dataUrlBytes(job.data.signature);
}

/** Image placeholders, as the generators passed them to the Slides renderer. */
function images(formId, job) {
    switch (formId) {
        // `6f25fcaa-9` has a pad of its own; the guardian line has none online.
        case '6f25fcaa': return { '%wowtc.signature.patient%': signature(job, '6f25fcaa-9'), '%wowtc.signature.guardian%': null };
        case '63948c3e': return { '%mhqa.signature%': dataUrlBytes(job.data.signature) };
        case 'c2e4d150': return { '%mhqp.signature%': dataUrlBytes(job.data.signature) };
        default: return {};
    }
}

function filler(formId) {
    const { label, description } = FORMS[formId];
    return async job => {
        const map = MAPS[formId](job.data, infoOf(job));
        const pics = images(formId, job);
        const fields = FIELDS[formId].fields.map(f => ({ ...f, key: f.token }));
        const bytes = await fillPdf(artwork(path.join(ASSETS, `${formId}.pdf`)), fields, field =>
            field.kind === 'i' ? pics[field.key] ?? null
                : field.kind === 'c' ? map[field.key] === 'X'
                    : map[field.key]
        );
        return [{
            name: pdfFileName(job.data, label, job.event.dateOfService),
            bytes: Buffer.from(bytes),
            folderId: FOLDER_ID,
            folderPath: FOLDER_PATH,
            description
        }];
    };
}

export const wowFillers = Object.fromEntries(Object.keys(FORMS).map(id => [id, filler(id)]));

// --- Clinical rows ----------------------------------------------------------
// One row per rendered service, in the sheet the clinical team completes on
// site. A port of apps-script/clinicalSheets.gs for the WOW services; rows are
// positional because both sheets repeat AppSheet section-label columns.

const WOW_DOC_COLUMNS = 37;
const MOBILE_EM_COLUMNS = 82;
const MOBILE_EM_PREFILL = {
    '63948c3e': { chiefComplaint: '63948c3e-1', history: '63948c3e-2', medications: '63948c3e-5' },
    'c2e4d150': { chiefComplaint: 'c2e4d150-1', history: 'c2e4d150-5', medications: 'c2e4d150-7' }
};

const pad = (values, width) => [...values, ...Array(Math.max(0, width - values.length)).fill('')].slice(0, width);

function identity(job, service) {
    const d = job.data.demographics || {};
    return [service.serviceId, job.appointmentID, job.event.facilityID, job.event.facilityName,
        job.patientID, d.firstName ?? '', d.lastName ?? '', d.dob ?? '', job.event.dateOfService];
}

function mobileEm(job, service, formId) {
    const answers = Object.fromEntries((job.data.formResponses || []).map(r => [r.questionId, r.answer]));
    const prefill = MOBILE_EM_PREFILL[formId];
    const row = pad(identity(job, service), MOBILE_EM_COLUMNS);
    row[12] = answers[prefill.chiefComplaint] || '';
    row[15] = answers[prefill.history] || '';
    row[16] = answers[prefill.medications] || '';
    return row;
}

const CLINICAL = {
    VITALCHK: { sheet: 'WOW Documentation', build: (job, s) => pad(identity(job, s), WOW_DOC_COLUMNS) },
    HIV12HCV: { sheet: 'WOW Documentation', build: (job, s) => pad(identity(job, s), WOW_DOC_COLUMNS) },
    ENMADULT: { sheet: 'Mobile EM', build: (job, s) => mobileEm(job, s, '63948c3e') },
    ENMMINOR: { sheet: 'Mobile EM', build: (job, s) => mobileEm(job, s, 'c2e4d150') }
};

/** Appends one row per WOW service, one write per sheet. */
export async function wowClinicalRows(job, sheets) {
    const bySheet = {};
    for (const service of job.services) {
        const config = CLINICAL[service.typeId];
        if (!config) continue;
        (bySheet[config.sheet] ||= []).push(config.build(job, service));
    }
    await Promise.all(Object.entries(bySheet).map(([sheet, rows]) =>
        sheets.append(CLINICAL_SPREADSHEET_ID, sheet, rows).catch(error =>
            console.error(`Could not write ${rows.length} row(s) to ${sheet}:`, error.message))
    ));
}
