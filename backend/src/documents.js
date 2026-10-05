// Documents generated for a registration, filled in-process while the patient
// waits. Replaces the Apps Script document queue for the forms that have a
// filler here; every other form keeps being handled by Apps Script, because the
// page only routes an event to this service when all of its services are ported.
//
// A filler is `async (job) => [pdf]`, where a pdf is
//   { name, bytes, folderId, folderPath, description }
// - `folderPath` is the AppSheet-relative path of `folderId`, which is what the
// Attachments sheet records. Uploading and logging happen here, once, the same
// way for every form, matching logAttachment_ in apps-script/pdfHelper.gs.

import { randomUUID } from 'node:crypto';
import { MAIN_SPREADSHEET_ID } from './config.js';

/** `LastFirst_Label_MMddyyyy.pdf`, with anything Drive dislikes stripped out. */
export function pdfFileName(data, label, serviceDate) {
    const name = [data.demographics?.lastName, data.demographics?.firstName].filter(Boolean).join('');
    const safe = (name || 'Patient').replace(/\s+/g, '').replace(/[\\/:*?"<>|]+/g, '');
    return `${safe}_${label}_${String(serviceDate || '').replace(/-/g, '')}.pdf`;
}

/** Every rendered service that requires the form, falling back to the form map. */
function servicesForForm(job, formId) {
    const matches = job.services.filter(s => s.formIds.some(id => String(id).trim() === formId));
    return matches.length ? matches : [{ serviceId: job.formToService[formId] || 'MANUAL_ENTRY' }];
}

/** The Attachments row, column for column as logAttachment_ writes it. */
function attachmentRow(job, serviceId, pdf) {
    const d = job.data.demographics || {};
    return [
        job.patientID, job.appointmentID, serviceId, randomUUID(), job.stamp,
        job.event.facilityName, d.firstName ?? '', d.lastName ?? '', d.dob ?? '',
        job.event.dateOfService, pdf.description, 'File',
        '', '', '', '', '',
        pdf.folderPath + pdf.name
    ];
}

/**
 * @param {{drive, sheets, fillers: Object<string, Function>, rows?: Function}} deps
 *   `fillers` is FormID -> filler. `rows` writes any clinical-sheet rows the job
 *   needs and is optional.
 */
export function documentGenerator({ drive, sheets, fillers, rows }) {
    async function generate(job) {
        const pdfs = [];
        await Promise.all(job.forms.map(async formId => {
            const fill = fillers[formId];
            if (!fill) return;
            try {
                for (const pdf of await fill(job)) pdfs.push({ ...pdf, formId });
            } catch (error) {
                console.error(`Filling ${formId} failed:`, error.message);
            }
        }));

        const uploaded = await Promise.all(pdfs.map(async pdf => ({
            ...pdf,
            file: await drive.upload(pdf.name, 'application/pdf', pdf.bytes, pdf.folderId)
        })));

        const attachmentRows = uploaded.flatMap(pdf =>
            servicesForForm(job, pdf.formId).map(service => attachmentRow(job, service.serviceId, pdf))
        );
        await Promise.all([
            attachmentRows.length && sheets.append(MAIN_SPREADSHEET_ID, 'Attachments', attachmentRows),
            rows && rows(job)
        ]);
        return uploaded.map(pdf => pdf.file);
    }

    return { generate };
}
