// The School Health intake forms, filled onto their printed artwork.
//
// Each age service lists two forms - `shccore` (the shared front pages) and its
// own - but both print on one PDF, so the age form's filler draws the answers of
// both. `shccore` has no filler of its own. The vaccine consent is its own PDF.
//
// Positions come from tools/school-health/measure_pdfs.py (fields.json), keyed
// by QuestionID; a check carries the exact option string it stands for. Fields
// whose `q` starts with '@' are the running page header, filled from the patient
// panel because no question asks for the patient's own name or date of birth.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { pdfFileName } from '../../documents.js';
import { artwork, fillPdf } from '../overlay.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIELDS = JSON.parse(readFileSync(path.join(here, 'fields.json'), 'utf8'));
const ASSETS = path.join(here, '..', '..', '..', 'assets', 'forms');

/** "Completed Forms/School Health", created 2026-10-05 for these. */
const FOLDER_ID = '1oilLsgjJ4iF8s1jhWl0rY1er2EP9OmyX';
const FOLDER_PATH = 'Completed Forms/School Health/';

const FORMS = {
    shc0003: { label: 'SchoolHealth0-3', description: 'School Health Parent Form (ages 0-3)' },
    shc0411: { label: 'SchoolHealth4-11', description: 'School Health Parent Form (ages 4-11)' },
    shc1217: { label: 'SchoolHealth12-17', description: 'School Health Parent Form (ages 12-17)' },
    shcadult: { label: 'SchoolHealthAdult', description: 'School Health Patient Form (18+)' },
    shcvax26: { label: 'SchoolHealthVaccineConsent', description: 'School Health Vaccine Consent' }
};

/** `2018-04-02` -> `04/02/2018`, the shape of the printed `__/__/____` blanks. */
function printedDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
    return m ? `${m[2]}/${m[3]}/${m[1]}` : String(value ?? '');
}

/** True when a recorded answer chose this option. Multi-selects are joined with ', '. */
export function chose(answer, option) {
    const a = String(answer ?? '').trim();
    if (!a) return false;
    return a === option || `, ${a}, `.includes(`, ${option}, `);
}

function header(job, key) {
    const d = job.data.demographics || {};
    switch (key) {
        case '@name': return [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ');
        case '@dob': return printedDate(d.dob);
        case '@visit': return printedDate(job.event.dateOfService.replace(/^(\d\d)-(\d\d)-(\d{4})$/, '$3-$1-$2'));
        default: return '';
    }
}

function filler(formId) {
    const { label, description } = FORMS[formId];
    const { fields } = FIELDS[formId];
    return async job => {
        const answers = Object.fromEntries((job.data.formResponses || []).map(r => [r.questionId, r.answer]));
        const bytes = await fillPdf(
            artwork(path.join(ASSETS, `${formId}.pdf`)),
            fields.map(f => ({ ...f, kind: f.kind[0], key: f.q })),
            field => {
                if (field.q.startsWith('@')) return header(job, field.q);
                const answer = answers[field.q];
                if (field.kind === 'c') return chose(answer, field.option);
                return printedDate(answer);
            },
            // measure_pdfs.py measures a blank down to its rule; the baseline sits 2.5 pt above.
            { textInset: 2.5 }
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

export const shcFillers = Object.fromEntries(Object.keys(FORMS).map(id => [id, filler(id)]));
