/**
 * Web app endpoints for the Prism Health appointment booking frontend.
 *
 * This file mirrors `endpoints.gs` in the Apps Script project. The rest of that
 * project (document generation, email templates, triggers) is maintained
 * separately and is not tracked here — see apps-script/README.md.
 */

const SPREADSHEET_ID = '1CX9GiID58srjCcrB_QH2RNgzMYtYSKFbfTmxKPwYeLs'; // Main DB
const RESPONSES_SPREADSHEET_ID = '1VnopEIAJSdfO6OKhWwHVn9SzCau0xkKndEecF4Xc1nY'; // Question responses
const UPLOAD_FOLDER_ID = '1LydgJoBKURyzl-_nYDWRn4dYL51AeM2k'; // EMR attachments
const QR_SERVICE_URL = 'https://qr-461807656593.us-central1.run.app';

/** Columns of the 'Appointment Slots' sheet (1-based). */
const SLOT_COL = { eventId: 1, startTime: 3, status: 5, updatedAt: 6, appointmentId: 7 };

/** How long a 'Pending' slot is honoured before the sweep reopens it. */
const PENDING_GRACE_MS = 25 * 60 * 1000;

/**
 * How long a completed submission is remembered for idempotency — long enough to
 * cover a patient retrying after a request that timed out in transit.
 */
const SUBMISSION_CACHE_SECONDS = 6 * 60 * 60;

/**
 * Longest we queue behind another writer before giving up. Kept well below the
 * client's patience so the browser gets a real answer rather than a dead request.
 */
const LOCK_TIMEOUT_MS = 45 * 1000;

// --- Spreadsheet access -----------------------------------------------------

/**
 * The container spreadsheet: 'Events', 'Appointment Slots', 'Appointment Waitlist'.
 *
 * Resolved lazily rather than at load time — a top-level
 * `SpreadsheetApp.getActiveSpreadsheet()` runs on every single execution of the
 * project, including triggers that do not need it.
 */
function bookingBook_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) {
    throw coded_(
      'NO_CONTAINER',
      'This script must stay bound to the scheduling spreadsheet.'
    );
  }
  return book;
}

/** The EMR spreadsheet: 'Patients', 'Appointments', 'Services Rendered'. */
function mainBook_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/** Fetches a sheet by name, failing with a message that names the problem. */
function sheet_(book, name) {
  const sheet = book.getSheetByName(name);
  if (!sheet) throw coded_('MISSING_SHEET', 'The "' + name + '" sheet could not be found.');
  return sheet;
}

// --- Entry point ------------------------------------------------------------

/**
 * Single entry point for all write operations.
 *
 * Nothing is allowed to throw out of here: an uncaught exception is served as an
 * HTML error page, which the browser can only report as a generic failure.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({
        status: 'error',
        code: 'EMPTY_REQUEST',
        message: 'No request body was received.'
      });
    }

    const request = JSON.parse(e.postData.contents);
    const payload = request.payload || {};

    switch (request.action) {
      case 'bookSlot':
        return jsonResponse_(bookSlot1(payload));
      case 'releaseSlot':
        return jsonResponse_(releaseSlot1(payload));
      case 'submitForm':
        return jsonResponse_(submitForm1(payload));
      default:
        return jsonResponse_({
          status: 'error',
          code: 'UNKNOWN_ACTION',
          message: 'Invalid action specified.'
        });
    }
  } catch (error) {
    console.error('doPost failed: %s\n%s', error.message, error.stack);
    return jsonResponse_({
      status: 'error',
      code: error.code || 'UNHANDLED',
      message: error.message
    });
  }
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** Error carrying a machine-readable code through to the client. */
function coded_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// --- Locking ----------------------------------------------------------------

/**
 * Runs `work` while holding the script lock, then releases it.
 *
 * Two things matter here. First, lock acquisition is inside the try: `waitLock`
 * throws on timeout, and when that happened outside the handler's try block the
 * whole request came back as an HTML error page. Second, the lock is only
 * released if it was actually taken.
 *
 * Keep the critical section small — only the slot read/modify/write needs
 * serialising. Drive writes, the QR fetch, email and document generation must
 * stay outside, or a handful of simultaneous registrations queue past the timeout.
 */
function withScriptLock_(work) {
  const lock = LockService.getScriptLock();
  let acquired = false;

  try {
    acquired = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!acquired) {
      throw coded_(
        'BUSY',
        'The booking system is handling a lot of requests right now. Please try again in a moment.'
      );
    }
    return work();
  } finally {
    if (acquired) lock.releaseLock();
  }
}

// --- Value normalisation ----------------------------------------------------

/**
 * Canonical 'HH:mm' form of a slot start time.
 *
 * Depending on the column's number format a cell displays as '9:00', '09:00' or
 * '9:00 AM', and the frontend sends 'HH:mm'. Every comparison goes through here
 * so the sheet's formatting cannot break booking. The previous bare
 * `padStart(5, '0')` meant a sheet displaying '9:00' never matched the client's
 * '09:00', so morning slots could not be booked at all.
 *
 * @param {string|Date} value
 * @return {string} '' when the value cannot be parsed.
 */
function normalizeTime_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }

  const match = String(value == null ? '' : value)
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([AaPp])\.?[Mm]?\.?)?$/);
  if (!match) return '';

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] ? match[3].toLowerCase() : null;

  if (meridiem === 'p' && hours < 12) hours += 12;
  if (meridiem === 'a' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return '';

  return ('0' + hours).slice(-2) + ':' + ('0' + minutes).slice(-2);
}

/**
 * Finds the 1-based row of a slot in the given status.
 *
 * @return {number} 0 when no matching row exists.
 */
function findSlotRow_(rows, eventId, startTime, status) {
  const wanted = normalizeTime_(startTime);
  if (!wanted) return 0;

  for (let i = 1; i < rows.length; i++) {
    if (
      String(rows[i][SLOT_COL.eventId - 1]) === String(eventId) &&
      normalizeTime_(rows[i][SLOT_COL.startTime - 1]) === wanted &&
      rows[i][SLOT_COL.status - 1] === status
    ) {
      return i + 1;
    }
  }
  return 0;
}

// --- Slot reservation -------------------------------------------------------

/** Marks an open slot as pending so the patient can fill in the form. */
function bookSlot1(payload) {
  if (!payload.eventId || !payload.startTime) {
    throw coded_('BAD_REQUEST', 'An event and a start time are required to reserve a slot.');
  }

  return withScriptLock_(function () {
    const sheet = sheet_(bookingBook_(), 'Appointment Slots');
    const row = findSlotRow_(
      sheet.getDataRange().getDisplayValues(),
      payload.eventId,
      payload.startTime,
      'Open'
    );

    if (!row) {
      throw coded_('SLOT_UNAVAILABLE', 'That slot is no longer available. Please choose another.');
    }

    sheet.getRange(row, SLOT_COL.status, 1, 2).setValues([['Pending', new Date()]]);
    // Commit before releasing the lock so the next request sees the change.
    SpreadsheetApp.flush();

    return { status: 'success', message: 'Slot reserved.' };
  });
}

/** Returns a pending slot to the pool. Safe to call more than once. */
function releaseSlot1(payload) {
  if (!payload.eventId || !payload.startTime) {
    return { status: 'success', message: 'No slot to release.' };
  }

  return withScriptLock_(function () {
    const sheet = sheet_(bookingBook_(), 'Appointment Slots');
    const row = findSlotRow_(
      sheet.getDataRange().getDisplayValues(),
      payload.eventId,
      payload.startTime,
      'Pending'
    );

    if (!row) return { status: 'success', message: 'Slot was not in a pending state.' };

    sheet.getRange(row, SLOT_COL.status, 1, 2).setValues([['Open', new Date()]]);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Slot released.' };
  });
}

/**
 * Confirms a pending slot as booked.
 *
 * Split out of `submitForm` so the lock covers only this, and so the slot is
 * claimed before any slow side effects run.
 */
function confirmSlot_(eventId, slotTime, appointmentID, now) {
  return withScriptLock_(function () {
    const sheet = sheet_(bookingBook_(), 'Appointment Slots');
    const row = findSlotRow_(
      sheet.getDataRange().getDisplayValues(),
      eventId,
      slotTime,
      'Pending'
    );

    if (!row) {
      throw coded_(
        'SLOT_EXPIRED',
        'We could not confirm your slot — the reservation may have expired. Please choose a slot again.'
      );
    }

    sheet.getRange(row, SLOT_COL.status, 1, 3).setValues([['Booked', now, appointmentID]]);
    SpreadsheetApp.flush();
    return true;
  });
}

// --- Idempotency ------------------------------------------------------------

/** Returns a previous result for this submissionId, if we have one. */
function recallSubmission_(submissionId) {
  if (!submissionId) return null;
  try {
    const cached = CacheService.getScriptCache().get('submission:' + submissionId);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('Could not read the submission cache: %s', error.message);
    return null;
  }
}

/** Remembers a completed submission so a client retry does not duplicate it. */
function rememberSubmission_(submissionId, result) {
  if (!submissionId) return;
  try {
    CacheService.getScriptCache().put(
      'submission:' + submissionId,
      JSON.stringify(result),
      SUBMISSION_CACHE_SECONDS
    );
  } catch (error) {
    console.warn('Could not write the submission cache: %s', error.message);
  }
}

// --- Registration -----------------------------------------------------------

/** Looks up an event row by EventID. */
function findEvent_(eventId) {
  const rows = sheet_(bookingBook_(), 'Events').getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(eventId)) {
      return {
        facilityID: rows[i][2],
        facilityName: rows[i][3],
        eventName: rows[i][4],
        dateOfService: rows[i][5]
          ? Utilities.formatDate(new Date(rows[i][5]), Session.getScriptTimeZone(), 'MM-dd-yyyy')
          : ''
      };
    }
  }
  return null;
}

/**
 * Records a full registration.
 *
 * Ordering is deliberate: everything that can fail without costing the patient
 * their appointment (QR code, email, document generation) happens last and is
 * individually guarded, so a Gmail quota error or a QR service outage no longer
 * fails a registration whose rows have already been written.
 */
function submitForm1(data) {
  const replay = recallSubmission_(data.submissionId);
  if (replay) {
    console.info('Replaying cached result for submission %s', data.submissionId);
    return replay;
  }

  const event = findEvent_(data.eventId);
  if (!event) {
    throw coded_(
      'UNKNOWN_EVENT',
      'We could not find the event for this registration (' + data.eventId + ').'
    );
  }

  const mainBook = mainBook_();
  const now = new Date();
  const patientID = Utilities.getUuid();
  const appointmentID = data.isWaitlist ? '' : Utilities.getUuid();
  const selectedServices = data.selectedServices || [];
  const demographics = data.demographics || {};
  const insurance = data.insurance || {};

  // Claim the slot first: if the reservation has expired there is no point
  // writing anything else.
  if (!data.isWaitlist) {
    confirmSlot_(data.eventId, data.slotTime, appointmentID, now);
  }

  const uploadFolder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);

  // The consent signature is optional: a registration whose services carry no
  // consent has nothing to attest to, so the client sends no signature at all.
  const sigFile = saveSignature_(
    uploadFolder,
    data.signature,
    'sig_' + data.eventId + '_' + now.getTime() + '.png'
  );

  // 1. Patient demographics.
  const fullAddress = [
    demographics.street,
    demographics.city,
    ((demographics.state || '') + ' ' + (demographics.zip || '')).trim()
  ]
    .filter(function (part) { return part; })
    .join(', ');

  sheet_(mainBook, 'Patients').appendRow([
    now, patientID, event.facilityID, event.facilityName,
    demographics.firstName, demographics.middleName, demographics.lastName,
    demographics.dob, demographics.gender, demographics.race,
    demographics.ethnicity, fullAddress, demographics.street,
    demographics.city, demographics.state, demographics.zip,
    demographics.cell, demographics.home, demographics.email,
    demographics.ssn, demographics.parentName, demographics.parentRel,
    demographics.parentContact, insurance.primaryIns, insurance.primaryPayer,
    insurance.primaryPlan, insurance.primaryId, insurance.primaryGroup,
    insurance.primaryPayerId, insurance.secondaryIns, insurance.secondaryPlan,
    insurance.secondaryId, insurance.secondaryGroup, insurance.secondaryPayerId,
    '', sigFile ? sigFile.getUrl() : '', '',
    data.consentCalls, data.consentTexts, data.consentEmails,
    data.electronicConsent, data.vaxConsent,
    // School and grade moved to the school-physical and sports-physical intake
    // forms, so they now arrive as question responses. These two columns are kept
    // blank rather than removed so existing Patients rows keep their shape.
    '', ''
  ]);

  // 2. Waitlist entries stop here.
  if (data.isWaitlist) {
    sheet_(bookingBook_(), 'Appointment Waitlist').appendRow([data.eventId, patientID]);
    trySendConfirmationEmail_(data, patientID, null, null, event.eventName, event.dateOfService);

    const waitlistResult = { status: 'success', isWaitlist: true, patientID: patientID };
    rememberSubmission_(data.submissionId, waitlistResult);
    return waitlistResult;
  }

  // 3. Appointment record.
  sheet_(mainBook, 'Appointments').appendRow([
    appointmentID, '', event.facilityID, '', event.facilityName, patientID,
    demographics.firstName, demographics.lastName, demographics.dob,
    // Logged exactly as the client sent it, which is the sheet's own start-time
    // string — downstream reports and document jobs read this column.
    event.dateOfService, '', data.eventId, data.slotTime
  ]);

  // 4. One row per selected service, keeping the ServiceID maps that questionnaire
  //    answers are attributed through.
  const servicesSheet = sheet_(mainBook, 'Services Rendered');
  const serviceMap = {};
  selectedServices.forEach(function (service) {
    const serviceID = Utilities.getUuid();
    serviceMap[service.id] = serviceID;
    servicesSheet.appendRow([
      serviceID, appointmentID, event.facilityID, event.facilityName, patientID,
      demographics.firstName, demographics.lastName, demographics.dob,
      event.dateOfService, service.serviceTypeId, service.name
    ]);
  });

  // 5. Questionnaire answers, with any requested signatures stored alongside.
  const signatureUrls = saveAdditionalSignatures_(
    uploadFolder, data.additionalSignatures, data.eventId, now
  );
  writeFormResponses_(
    data.formResponses, patientID, buildFormServiceMap_(selectedServices, serviceMap), signatureUrls
  );

  // 6. Best-effort extras. None of these may fail the registration.
  const qrBase64 = tryFetchQrCode_(appointmentID);
  trySendConfirmationEmail_(
    data, patientID, appointmentID, qrBase64, event.eventName, event.dateOfService
  );

  delete data.medicalRecords;
  delete data.signature;
  tryEnqueueDocJob_(
    data, patientID, appointmentID, event.facilityID, event.facilityName,
    event.dateOfService, sigFile,
    selectedServices.map(function (service) { return service.id; }).join(','),
    serviceMap
  );

  const result = {
    status: 'success',
    appointmentID: appointmentID,
    qrBase64: qrBase64,
    isWaitlist: false
  };
  rememberSubmission_(data.submissionId, result);
  return result;
}

/**
 * Maps each intake form to the ServiceID it should be attributed to.
 *
 * A form can be required by more than one selected service (Service Types is the
 * source of truth for which). The first selected service that uses the form wins,
 * so a shared questionnaire is filled in and recorded once.
 *
 * Falls back to keying by `service.id` for older clients that sent the form id as
 * the service id and no `formIds` list.
 */
function buildFormServiceMap_(selectedServices, serviceMap) {
  const formToService = {};

  selectedServices.forEach(function (service) {
    const serviceID = serviceMap[service.id];
    const formIds = service.formIds && service.formIds.length
      ? service.formIds
      : [service.id];

    formIds.forEach(function (formId) {
      const key = String(formId).trim();
      if (key && !formToService[key]) formToService[key] = serviceID;
    });
  });

  return formToService;
}

/**
 * Appends questionnaire answers in a single write.
 *
 * A question that requested a signature has its answer replaced by the Drive URL
 * of the signature image, so the response row carries the artefact rather than a
 * bare "Yes" and no extra column is needed.
 */
function writeFormResponses_(formResponses, patientID, formToService, signatureUrls) {
  if (!formResponses || formResponses.length === 0) return;

  try {
    const sheet = SpreadsheetApp.openById(RESPONSES_SPREADSHEET_ID).getSheetByName(
      'Question Responses'
    );
    if (!sheet) {
      console.error('The "Question Responses" sheet is missing; answers were not saved.');
      return;
    }

    const urls = signatureUrls || {};
    const rows = formResponses.map(function (response) {
      const formId = response.formId ? String(response.formId).trim() : '';
      const answer = urls[response.questionId] || response.answer;
      return [patientID, formToService[formId] || '', response.questionId, answer];
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  } catch (error) {
    // The appointment is already recorded; losing answers is bad, but failing a
    // registration in front of the patient is worse. Log loudly instead.
    console.error('Could not write question responses for %s: %s', patientID, error.message);
  }
}

/**
 * Writes a base64 data-URL signature to Drive.
 *
 * @return {File|null} null when no signature was supplied.
 */
function saveSignature_(folder, dataUrl, filename) {
  const raw = String(dataUrl == null ? '' : dataUrl);
  const comma = raw.indexOf(',');
  if (comma === -1) return null;

  return folder.createFile(
    Utilities.newBlob(Utilities.base64Decode(raw.slice(comma + 1)), 'image/png', filename)
  );
}

/**
 * Stores the signatures requested by `signature` questions.
 *
 * @return {Object} QuestionID -> Drive URL, for the response rows.
 */
function saveAdditionalSignatures_(folder, signatures, eventId, now) {
  const urls = {};
  if (!signatures || !signatures.length) return urls;

  signatures.forEach(function (signature, index) {
    try {
      const file = saveSignature_(
        folder,
        signature.data,
        'sig_' + eventId + '_' + signature.questionId + '_' + now.getTime() + '_' + index + '.png'
      );
      if (file) urls[signature.questionId] = file.getUrl();
    } catch (error) {
      console.error(
        'Could not store the "%s" signature: %s', signature.questionId, error.message
      );
    }
  });

  return urls;
}

/** Fetches the appointment QR code, returning '' if the service is unavailable. */
function tryFetchQrCode_(appointmentID) {
  try {
    const response = UrlFetchApp.fetch(
      QR_SERVICE_URL + '?data=' + encodeURIComponent(appointmentID),
      { muteHttpExceptions: true }
    );
    if (response.getResponseCode() !== 200) {
      console.error('QR service returned %s', response.getResponseCode());
      return '';
    }
    return response.getContentText();
  } catch (error) {
    console.error('QR service unreachable: %s', error.message);
    return '';
  }
}

function trySendConfirmationEmail_(data, patientID, appointmentID, qrBase64, eventName, eventDateStr) {
  try {
    sendConfirmationEmail(data, patientID, appointmentID, qrBase64, eventName, eventDateStr);
  } catch (error) {
    // Most often the daily MailApp quota. The registration stands either way.
    console.error('Confirmation email failed for %s: %s', patientID, error.message);
  }
}

function tryEnqueueDocJob_(data, patientID, appointmentID, facilityID, facilityName, dos, sigFile, formsUsed, serviceMap) {
  try {
    enqueueDocJob_(
      data, patientID, appointmentID, facilityID, facilityName, dos, sigFile, formsUsed, serviceMap
    );
  } catch (error) {
    console.error('Could not queue document generation for %s: %s', appointmentID, error.message);
  }
}

// --- Email ------------------------------------------------------------------

function sendConfirmationEmail(formData, patientID, appointmentID, qrBase64, eventName, eventDateStr) {
  const recipient = formData.demographics.email;
  if (!recipient) {
    console.warn('No email address supplied for %s; skipping confirmation.', patientID);
    return;
  }

  const formURL =
    'https://docs.google.com/forms/d/e/1FAIpQLSfKpeUm69ZnMKa3Jw7j8HTS2rNevcw3VJPBzJukr90QnkNHdw/viewform' +
    '?usp=pp_url&entry.1124294420=' +
    encodeURIComponent(patientID);
  const patientName = formData.demographics.firstName + ' ' + formData.demographics.lastName;

  if (!appointmentID) {
    const waitlistTemplate = HtmlService.createTemplateFromFile('WaitlistEmail');
    waitlistTemplate.eventName = eventName;
    waitlistTemplate.eventDate = eventDateStr;
    waitlistTemplate.patientName = patientName;
    waitlistTemplate.formUrl = formURL;

    MailApp.sendEmail({
      to: recipient,
      subject: 'Waitlist Confirmation for ' + eventName + ' on ' + eventDateStr,
      htmlBody: waitlistTemplate.evaluate().getContent()
    });
    return;
  }

  const template = HtmlService.createTemplateFromFile('ConfirmationEmail');
  template.eventName = eventName;
  template.eventDate = eventDateStr;
  template.apptTime = formData.slotTime;
  template.patientName = patientName;
  template.apptID = appointmentID;
  template.qrBase64 = qrBase64;
  template.formUrl = formURL;

  const message = {
    to: recipient,
    subject: 'Your Appointment for ' + eventName + ' on ' + eventDateStr,
    htmlBody: template.evaluate().getContent()
  };

  // The QR code is optional: the email must still go out without it.
  if (qrBase64) {
    message.inlineImages = {
      qrImage: Utilities.newBlob(
        Utilities.base64Decode(qrBase64),
        'image/png',
        'appt-confirmation.png'
      )
    };
  }

  MailApp.sendEmail(message);
}

// --- Maintenance trigger ----------------------------------------------------

/**
 * Reopens slots left 'Pending' by abandoned registrations.
 *
 * Install as a time-driven trigger (every 5 minutes). The grace period is longer
 * than the frontend's hold countdown so a slot is never swept out from under
 * someone who is still filling in the form.
 */
function checkPendingToOpen() {
  const sheet = sheet_(bookingBook_(), 'Appointment Slots');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, SLOT_COL.status, lastRow - 1, 2);
  const values = range.getValues();
  const now = Date.now();
  let changed = false;

  for (let i = 0; i < values.length; i++) {
    const status = values[i][0];
    const updatedAt = values[i][1];
    if (
      status === 'Pending' &&
      updatedAt instanceof Date &&
      now - updatedAt.getTime() > PENDING_GRACE_MS
    ) {
      values[i][0] = 'Open';
      values[i][1] = new Date();
      changed = true;
    }
  }

  // One batched write instead of one per row: far fewer Sheets calls, and no
  // chance of the trigger timing out on a busy sheet.
  if (changed) range.setValues(values);
}
