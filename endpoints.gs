const SPREADSHEET_ID = "1CX9GiID58srjCcrB_QH2RNgzMYtYSKFbfTmxKPwYeLs"; // Main DB
const UPLOAD_FOLDER_ID = "1LydgJoBKURyzl-_nYDWRn4dYL51AeM2k"; // EMR Attachments Folder
const ss = SpreadsheetApp.getActiveSpreadsheet();

// This function is the single entry point for all write operations.
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // Wait up to 30 seconds for other processes to finish.

  try {
    const request = JSON.parse(e.postData.contents);
    let response;

    // Route the request based on the 'action' parameter
    switch (request.action) {
      case 'bookSlot':
        response = bookSlot1(request.payload);
        break;
      case 'releaseSlot':
        response = releaseSlot1(request.payload);
        break;
      case 'submitForm':
        response = submitForm1(request.payload);
        break;
      default:
        throw new Error("Invalid action specified.");
    }

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.log(error.message)
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// --- Action Functions (Adapted from your original code) ---

function bookSlot1(payload) {
  const { eventId, startTime } = payload;
  const sh = ss.getSheetByName('Appointment Slots');
  const rows = sh.getDataRange().getDisplayValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(eventId) &&
        rows[i][2].padStart(5, '0') === startTime &&
        rows[i][4] === 'Open') {
      sh.getRange(i + 1, 5, 1, 2).setValues([['Pending', new Date()]]);

      // ADD THIS LINE
      SpreadsheetApp.flush(); // Forces the spreadsheet to save changes immediately

      return { status: 'success', message: 'Slot booked successfully.' };
    }
  }
  throw new Error("Slot could not be booked. It may have been taken.");
}

function releaseSlot1(payload) {
  const { eventId, startTime } = payload;
  if (!eventId || !startTime) return { status: 'success', message: 'No slot to release.' };

  const sh = ss.getSheetByName('Appointment Slots');
  const rows = sh.getDataRange().getDisplayValues();

  for (let i = 1; i < rows.length; i++) {
    // Match by eventId, startTime, and ensure it's 'Pending'
    if (String(rows[i][0]) === String(eventId) &&
        rows[i][2].padStart(5, '0') === startTime &&
        rows[i][4] === 'Pending') {
      sh.getRange(i + 1, 5, 1, 2).setValues([['Open', new Date()]]);
      return { status: 'success', message: 'Slot released.' };
    }
  }
  return { status: 'success', message: 'Slot was not in a pending state.' };
}

function submitForm1(data) {
    const mainDB = SpreadsheetApp.openById(SPREADSHEET_ID);
    const responsesDB = SpreadsheetApp.openById("1VnopEIAJSdfO6OKhWwHVn9SzCau0xkKndEecF4Xc1nY").getSheetByName("Question Responses");
    const UPLOAD_FOLDER = DriveApp.getFolderById(UPLOAD_FOLDER_ID);

    // Create signature and patient metadata
    const sigBlob = Utilities.newBlob(Utilities.base64Decode(data.signature.split(',')[1]), 'image/png', `sig_${data.eventId}_${Date.now()}.png`);
    const sigFile = UPLOAD_FOLDER.createFile(sigBlob);
    const patientID = Utilities.getUuid();
    const appointmentID = data.isWaitlist ? '' : Utilities.getUuid();
    const now = new Date();

    // Fetch Event details
    const eventsSheet = ss.getSheetByName('Events');
    const eventsVals = eventsSheet.getDataRange().getValues();
    let matches = eventsVals.filter(row => String(row[1]) === String(data.eventId));
    let facilityID = matches[0][2],
        facilityName = matches[0][3],
        eventName = matches[0][4],
        dos = Utilities.formatDate(matches[0][5], Session.getScriptTimeZone(), "MM-dd-yyyy"),
        formsUsed = data.selectedServices.map(s => s.id).join(','); // Use actually selected forms

    // 1. Log Patient Demographics (Same as before)
    const patientsSheet = mainDB.getSheetByName('Patients');
    let fullAddress = data.demographics.street + ', ' + data.demographics.city + ', ' + data.demographics.state + ' ' + data.demographics.zip;
    patientsSheet.appendRow([
      now, patientID, facilityID, facilityName,
      data.demographics.firstName, data.demographics.middleName, data.demographics.lastName,
      data.demographics.dob, data.demographics.gender, data.demographics.race,
      data.demographics.ethnicity, fullAddress, data.demographics.street,
      data.demographics.city, data.demographics.state, data.demographics.zip,
      data.demographics.cell, data.demographics.home, data.demographics.email,
      data.demographics.ssn, data.demographics.parentName, data.demographics.parentRel,
      data.demographics.parentContact, data.insurance.primaryIns, data.insurance.primaryPayer,
      data.insurance.primaryPlan, data.insurance.primaryId, data.insurance.primaryGroup,
      data.insurance.primaryPayerId, data.insurance.secondaryIns, data.insurance.secondaryPlan,
      data.insurance.secondaryId, data.insurance.secondaryGroup, data.insurance.secondaryPayerId,
      '', sigFile.getUrl(), '',
      data.consentCalls, data.consentTexts, data.consentEmails, data.electronicConsent, data.vaxConsent,
      data.demographics.school, data.demographics.grade
    ]);

    // 2. Handle Waitlist vs Booking
    if (data.isWaitlist) {
        const waitlistSheet = ss.getSheetByName('Appointment Waitlist');
        waitlistSheet.appendRow([data.eventId, patientID]);
        sendConfirmationEmail(data, patientID, null, null, eventName, dos);
        return { status: 'success', isWaitlist: true };
    }

    // 3. Update Slot Status
    const sh = ss.getSheetByName('Appointment Slots');
    const rows = sh.getDataRange().getDisplayValues();
    let slotFoundAndUpdated = false;
    for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(data.eventId) && rows[i][2].padStart(5, "0") === data.slotTime && rows[i][4] === 'Pending') {
            sh.getRange(i + 1, 5, 1, 3).setValues([['Booked', now, appointmentID]]);
            slotFoundAndUpdated = true;
            break;
        }
    }
    if (!slotFoundAndUpdated) throw new Error("Could not confirm your slot. It may have timed out.");

    // 4. Log Main Appointment
    const appointmentsSheet = mainDB.getSheetByName('Appointments');
    appointmentsSheet.appendRow([appointmentID, '', facilityID, '', facilityName, patientID, data.demographics.firstName, data.demographics.lastName, data.demographics.dob, dos, "", data.eventId, data.slotTime]);

    // 5. THE MULTI-SERVICE LOOP (REPLACES VAXADMIN)
    const servicesSheet = mainDB.getSheetByName("Services Rendered");
    const serviceMap = {}; // To store ServiceIDs for mapping question responses

    data.selectedServices.forEach(service => {
        const serviceID = Utilities.getUuid();
        serviceMap[service.id] = serviceID; // Track which FormID belongs to which ServiceID

        servicesSheet.appendRow([
            serviceID, appointmentID, facilityID, facilityName, patientID,
            data.demographics.firstName, data.demographics.lastName, data.demographics.dob,
            dos, service.serviceTypeId, service.name
        ]);
    });

    // 6. Log Dynamic Responses with proper ServiceID mapping
    if (data.formResponses && data.formResponses.length > 0 && responsesDB) {
        const responseRows = data.formResponses.map(r => {
            // Use the formId passed from the frontend
            const sID = r.formId ? serviceMap[r.formId.trim()] : '';
            return [patientID, sID, r.questionId, r.answer];
        });
        responsesDB.getRange(responsesDB.getLastRow() + 1, 1, responseRows.length, 4).setValues(responseRows);
    }

    // 7. Queue PDF Generation
    const qrBase64 = UrlFetchApp.fetch("https://qr-461807656593.us-central1.run.app?data=" + encodeURIComponent(appointmentID)).getContentText();
    sendConfirmationEmail(data, patientID, appointmentID, qrBase64, eventName, dos);

    delete data.medicalRecords;
    delete data.signature;
    // Note: info.forms now contains the specific subset of selected forms
    enqueueDocJob_(data, patientID, appointmentID, facilityID, facilityName, dos, sigFile, formsUsed, serviceMap);

    return { status: 'success', appointmentID: appointmentID, qrBase64: qrBase64, isWaitlist: false };
}

function sendConfirmationEmail(formData, patientID, appointmentID, qrBase64, eventName, eventDateStr) {
  var recipient = formData.demographics.email;
  const formURL = "https://docs.google.com/forms/d/e/1FAIpQLSfKpeUm69ZnMKa3Jw7j8HTS2rNevcw3VJPBzJukr90QnkNHdw/viewform?usp=pp_url&entry.1124294420=" + encodeURIComponent(patientID)

  if (!appointmentID) {
    // Waitlist email (uses WaitlistEmail.html)
    var subject = 'Waitlist Confirmation for ' + eventName + ' on ' + eventDateStr;

    var tmpl = HtmlService.createTemplateFromFile('WaitlistEmail');
    tmpl.eventName   = eventName;
    tmpl.eventDate   = eventDateStr;
    tmpl.patientName = formData.demographics.firstName + ' ' + formData.demographics.lastName;
    tmpl.formUrl     = formURL;

    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      htmlBody: tmpl.evaluate().getContent()
    });
    return;
  }

  // Normal confirmation email
  var subject   = 'Your Appointment for ' + eventName + ' on ' + eventDateStr;
  var template = HtmlService.createTemplateFromFile('ConfirmationEmail');
  template.eventName    = eventName;
  template.eventDate    = eventDateStr;
  template.apptTime     = formData.slotTime;
  template.patientName  = formData.demographics.firstName + ' ' + formData.demographics.lastName;
  template.apptID       = appointmentID;
  template.qrBase64     = qrBase64;
  template.formUrl      = formURL;
  var htmlBody = template.evaluate().getContent();
  const qrBytes = Utilities.base64Decode(qrBase64);
  const qrBlob  = Utilities.newBlob(qrBytes, 'image/png', 'appt-confirmation.png');
  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    htmlBody: htmlBody,
    inlineImages: { qrImage: qrBlob }
  });
}

function checkPendingToOpen() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Appointment Slots');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const range = sheet.getRange(2, 5, lastRow - 1, 2);
  const data = range.getValues();
  const now = Date.now();
  const twentyMin = 20 * 60 * 1000;
  data.forEach((row, i) => {
    const status = row[0];
    const ts     = row[1];
    if (status === 'Pending' && ts instanceof Date) {
      if (now - ts.getTime() > twentyMin) {
        sheet.getRange(i + 2, 5, 1, 2).setValues([['Open', new Date()]]);
      }
    }
  });
}

