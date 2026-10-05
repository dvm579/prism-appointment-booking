// Records a registration. A port of submitForm1 in apps-script/endpoints.gs,
// writing the same rows in the same column order.
//
// The order is still deliberate: claim the slot, write every record, and only
// then log the extras that may fail without costing the patient the appointment.
// What changes is how much waits on what. Apps Script appended row by row and
// saved each file before the row that linked to it; here every Drive id is
// reserved up front, so signature uploads, the batched row writes and the filling
// and uploading of the documents all run at once. Only the records that point at
// a registration - Attachments, clinical rows, the email - wait for it to exist.

import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import {
    BOOKING_SPREADSHEET_ID, MAIN_SPREADSHEET_ID, RESPONSES_SPREADSHEET_ID, UPLOAD_FOLDER_ID
} from './config.js';
import { dataUrlBytes, driveUrl } from './drive.js';
import { confirmationMessage } from './email.js';
import { coded } from './errors.js';
import { serviceDate } from './time.js';

/** Looks up an Events row by EventID. */
async function findEvent(sheets, eventId) {
    const rows = await sheets.read(BOOKING_SPREADSHEET_ID, 'Events');
    for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][1] ?? '') === String(eventId)) {
            return {
                facilityID: rows[i][2] ?? '',
                facilityName: rows[i][3] ?? '',
                eventName: rows[i][4] ?? '',
                dateOfService: serviceDate(rows[i][5])
            };
        }
    }
    return null;
}

/** FormID -> ServiceID of the first selected service that uses the form. */
export function formServiceMap(selectedServices, serviceMap) {
    const map = {};
    for (const service of selectedServices) {
        const ids = service.formIds?.length ? service.formIds : [service.id];
        for (const formId of ids) {
            const key = String(formId).trim();
            if (key && !map[key]) map[key] = serviceMap[service.id];
        }
    }
    return map;
}

/** Every FormID the registration used, once each, in order. */
export function formsUsed(selectedServices) {
    const seen = new Set();
    for (const service of selectedServices) {
        for (const formId of service.formIds?.length ? service.formIds : [service.id]) {
            const key = String(formId).trim();
            if (key) seen.add(key);
        }
    }
    return [...seen];
}

/**
 * A value Sheets must keep as typed text.
 *
 * Rows are written as if typed, so `02134` would become the number 2134 and lose
 * its leading zero - a ZIP in most of New England. A leading apostrophe tells
 * Sheets "this is text" and is not stored.
 */
export function asText(value) {
    const text = String(value ?? '').trim();
    return text ? `'${text}` : '';
}

/** A stopwatch that reports step durations without ever touching patient data. */
function stopwatch() {
    const start = Date.now();
    let last = start;
    const steps = {};
    return {
        lap(name) { const t = Date.now(); steps[name] = t - last; last = t; },
        total() { return { ...steps, total: Date.now() - start }; }
    };
}

export function submitAction({ sheets, store, slots, drive, mailer, documents, now = () => new Date() }) {
    /**
     * Reserves a Drive id for every signature and starts the uploads.
     *
     * The links exist at once, so the rows that carry them do not wait for the
     * files. The consent signature is part of the registration - if it cannot be
     * stored, the registration fails, as it did in endpoints.gs. A signature a
     * question asked for is logged and skipped instead.
     */
    async function planSignatures(data, at) {
        const wanted = [];
        const consent = dataUrlBytes(data.signature);
        if (consent) wanted.push({ bytes: consent, name: `sig_${data.eventId}_${at.getTime()}.png` });
        (data.additionalSignatures || []).forEach((signature, index) => {
            const bytes = dataUrlBytes(signature.data);
            if (bytes) wanted.push({
                bytes, questionId: signature.questionId,
                name: `sig_${data.eventId}_${signature.questionId}_${at.getTime()}_${index}.png`
            });
        });
        const planned = await Promise.all(wanted.map(async w => ({ ...w, id: await drive.reserveId() })));

        let sigFile = null;
        const signatureUrls = {};
        for (const p of planned) {
            if (p.questionId) signatureUrls[p.questionId] = driveUrl(p.id);
            else sigFile = { id: p.id, url: driveUrl(p.id), name: p.name };
        }
        const uploads = Promise.all(planned.map(p => {
            const upload = drive.upload(p.name, 'image/png', p.bytes, UPLOAD_FOLDER_ID, p.id);
            return p.questionId
                ? upload.catch(error => console.error(`Could not store the "${p.questionId}" signature:`, error.message))
                : upload;
        }));
        return { sigFile, signatureUrls, uploads };
    }

    /** Losing answers is bad; failing a registration that is already recorded is worse. */
    async function guarded(label, work) {
        try {
            return await work();
        } catch (error) {
            console.error(`${label} failed:`, error.message);
            return null;
        }
    }

    /** Remembers the result so a retry of this submission replays it instead of re-registering. */
    async function remember(submissionId, result) {
        if (!submissionId) return;
        await store.putSubmission(submissionId, result).catch(e => console.warn('Submission cache:', e.message));
    }

    async function qrCode(appointmentID) {
        return guarded('QR code', async () =>
            (await QRCode.toBuffer(appointmentID, { type: 'png', margin: 1, width: 300 })).toString('base64')
        ) || '';
    }

    async function email(data, patientID, appointmentID, qrBase64, event) {
        const to = data.demographics?.email;
        if (!to) {
            console.warn('No email address supplied; skipping confirmation.');
            return;
        }
        await guarded('Confirmation email', () => mailer.send(to, confirmationMessage({
            data, patientID, appointmentID, qrBase64,
            eventName: event.eventName, eventDate: event.dateOfService
        })));
    }

    return async function submitForm(data) {
        const clock = stopwatch();

        const replay = data.submissionId ? await store.getSubmission(data.submissionId).catch(() => null) : null;
        if (replay) {
            console.info('Replaying cached result for a repeated submission.');
            return replay;
        }

        const event = await findEvent(sheets, data.eventId);
        if (!event) {
            throw coded('UNKNOWN_EVENT', `We could not find the event for this registration (${data.eventId}).`);
        }
        clock.lap('event');

        const at = now();
        // One instant, written in each workbook's own zone.
        const [mainStamp, responsesStamp] = await Promise.all([
            sheets.stamp(MAIN_SPREADSHEET_ID, at),
            sheets.stamp(RESPONSES_SPREADSHEET_ID, at)
        ]);
        const patientID = randomUUID();
        const appointmentID = data.isWaitlist ? '' : randomUUID();
        const selectedServices = data.selectedServices || [];
        const demographics = data.demographics || {};
        const insurance = data.insurance || {};

        // Claim the slot first: if the reservation has expired, write nothing.
        if (!data.isWaitlist) await slots.confirmSlot(data.eventId, data.slotTime, appointmentID, at);
        clock.lap('slot');

        const { sigFile, signatureUrls, uploads } = await planSignatures(data, at);

        const fullAddress = [
            demographics.street,
            demographics.city,
            `${demographics.state || ''} ${demographics.zip || ''}`.trim()
        ].filter(Boolean).join(', ');

        const patientRow = [
            mainStamp, patientID, event.facilityID, event.facilityName,
            demographics.firstName, demographics.middleName, demographics.lastName,
            demographics.dob, demographics.gender, demographics.race,
            // A Full Address that is only a ZIP would turn into a number too.
            demographics.ethnicity, /^\d+$/.test(fullAddress) ? asText(fullAddress) : fullAddress, demographics.street,
            demographics.city, demographics.state, asText(demographics.zip),
            demographics.cell, demographics.home, demographics.email,
            demographics.ssn, demographics.parentName, demographics.parentRel,
            demographics.parentContact, insurance.primaryIns, insurance.primaryPayer,
            insurance.primaryPlan, insurance.primaryId, insurance.primaryGroup,
            insurance.primaryPayerId, insurance.secondaryIns, insurance.secondaryPlan,
            insurance.secondaryId, insurance.secondaryGroup, insurance.secondaryPayerId,
            '', sigFile ? sigFile.url : '', '',
            Boolean(data.consentCalls), Boolean(data.consentTexts), Boolean(data.consentEmails),
            Boolean(data.electronicConsent), Boolean(data.vaxConsent),
            // School and grade columns, kept blank so Patients rows keep their shape.
            '', ''
        ].map(value => value ?? '');

        if (data.isWaitlist) {
            await Promise.all([uploads, sheets.append(MAIN_SPREADSHEET_ID, 'Patients', [patientRow])]);
            await sheets.append(BOOKING_SPREADSHEET_ID, 'Appointment Waitlist', [[data.eventId, patientID]]);
            await email(data, patientID, null, null, event);
            const result = { status: 'success', isWaitlist: true, patientID };
            await remember(data.submissionId, result);
            return result;
        }

        const serviceMap = {};
        const renderedServices = selectedServices.map(service => {
            const serviceID = randomUUID();
            serviceMap[service.id] = serviceID;
            return {
                serviceId: serviceID,
                typeId: service.serviceTypeId || service.id,
                name: service.name,
                formIds: service.formIds?.length ? service.formIds : [service.id]
            };
        });
        const formToService = formServiceMap(selectedServices, serviceMap);

        const responseRows = (data.formResponses || []).map(response => {
            const formId = response.formId ? String(response.formId).trim() : '';
            return [patientID, formToService[formId] || '', response.questionId, signatureUrls[response.questionId] || response.answer];
        });

        const declineRows = (data.consentDeclines || []).map(decline => [
            responsesStamp, patientID, appointmentID, decline.consentId || '',
            decline.itemId || '', decline.label || '', decline.note || ''
        ]);

        // Documents start now: filling and uploading needs nothing the rows
        // write, and is the longest step. What logs them waits, below.
        const job = {
            data, patientID, appointmentID, sigFile, signatureUrls,
            event, forms: formsUsed(selectedServices), formToService, services: renderedServices,
            // Attachments lives in Main DB.
            stamp: mainStamp
        };
        const prepared = guarded('Documents', () => documents.prepare(job));

        // Patients, Appointments and Services Rendered are the appointment
        // itself: if any of them fails, the registration fails. Responses and
        // declines are guarded like endpoints.gs guarded them.
        await Promise.all([
            uploads,
            sheets.append(MAIN_SPREADSHEET_ID, 'Patients', [patientRow]),
            sheets.append(MAIN_SPREADSHEET_ID, 'Appointments', [[
                appointmentID, '', event.facilityID, '', event.facilityName, patientID,
                demographics.firstName, demographics.lastName, demographics.dob,
                event.dateOfService, '', data.eventId, data.slotTime
            ]]),
            sheets.append(MAIN_SPREADSHEET_ID, 'Services Rendered', renderedServices.map((service, i) => [
                service.serviceId, appointmentID, event.facilityID, event.facilityName, patientID,
                demographics.firstName, demographics.lastName, demographics.dob,
                event.dateOfService, selectedServices[i].serviceTypeId, selectedServices[i].name
            ])),
            responseRows.length && guarded('Question responses', () =>
                sheets.append(RESPONSES_SPREADSHEET_ID, 'Question Responses', responseRows)),
            declineRows.length && guarded('Consent declines', async () => {
                await sheets.ensureSheet(RESPONSES_SPREADSHEET_ID, 'Consent Declines',
                    ['Timestamp', 'PatientID', 'AppointmentID', 'ConsentID', 'ItemID', 'Item Label', 'Note']);
                await sheets.append(RESPONSES_SPREADSHEET_ID, 'Consent Declines', declineRows);
            })
        ]);
        clock.lap('rows');

        // The registration exists. Log its documents and send the email; none of
        // this may fail the booking.
        const qrBase64 = await qrCode(appointmentID);
        await Promise.all([
            guarded('Document log', async () => documents.record(job, (await prepared) || [])),
            email(data, patientID, appointmentID, qrBase64, event)
        ]);
        clock.lap('extras');

        const result = { status: 'success', appointmentID, qrBase64, isWaitlist: false };
        await remember(data.submissionId, result);
        console.info('submitForm timings (ms)', JSON.stringify(clock.total()));
        return result;
    };
}
