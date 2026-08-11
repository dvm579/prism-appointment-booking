/**
 * Per-service clinical documentation rows.
 *
 * A PDF is built once per intake form, but each service the patient selected needs
 * its own row in the sheet the clinical team completes on site. That is a different
 * cardinality from document generation, so it lives here rather than inside the
 * generators: `writeClinicalRows_` runs once per job and walks the rendered
 * services, not the forms.
 *
 * Rows are written POSITIONALLY. Both sheets contain AppSheet section-label columns
 * that repeat a heading immediately before the column that actually holds data
 * ("Plan" at 60 then 61, "Additional lab tests / procedures provided" at 68 then
 * 69), so matching on header text would land values in the wrong column.
 *
 * Only identity and patient-reported fields are filled. Everything the clinician
 * measures, decides, or attests to is deliberately left blank.
 */

/**
 * Spreadsheet holding the "WOW Documentation" and "Mobile EM" tabs.
 *
 * Defaults to the main EMR book. If those tabs live in their own spreadsheet, put
 * its id here — a wrong guess fails loudly with MISSING_SHEET rather than writing
 * rows into the wrong book.
 */
const CLINICAL_DOC_SPREADSHEET_ID = SPREADSHEET_ID;

/** Column counts, so a row is always padded to the sheet's full width. */
const WOW_DOC_COLUMNS = 37;
const MOBILE_EM_COLUMNS = 82;

/**
 * ServiceTypeID -> how to build its clinical row.
 *
 * VAXADMIN, ADULTVAX, PHYSICAL and SPRTPHYS are NOT here: their rows are still
 * written by their own generators (pedvax25.gs, schlphys26.gs), where the form and
 * the service are one-to-one. Adding them here as well would double-write.
 */
const CLINICAL_SHEETS = {
  VITALCHK: { sheet: 'WOW Documentation', build: buildWowDocumentationRow_ },
  HIV12HCV: { sheet: 'WOW Documentation', build: buildWowDocumentationRow_ },
  ENMADULT: {
    sheet: 'Mobile EM',
    build: function (ctx) { return buildMobileEmRow_(ctx, '63948c3e'); }
  },
  ENMMINOR: {
    sheet: 'Mobile EM',
    build: function (ctx) { return buildMobileEmRow_(ctx, 'c2e4d150'); }
  }
};

/**
 * Questions whose answers prefill the E/M note, per questionnaire.
 * Everything else on that sheet is the provider's to complete.
 */
const MOBILE_EM_PREFILL = {
  '63948c3e': { chiefComplaint: '63948c3e-1', history: '63948c3e-2', medications: '63948c3e-5' },
  'c2e4d150': { chiefComplaint: 'c2e4d150-1', history: 'c2e4d150-5', medications: 'c2e4d150-7' }
};

// --- Row builders -----------------------------------------------------------

/** The nine identity columns both sheets start with. */
function clinicalIdentityColumns_(ctx) {
  var data = ctx.data;
  return [
    ctx.service.serviceId,
    ctx.info.aid,
    ctx.info.fid,
    ctx.info.fname,
    ctx.info.pid,
    get(data, 'demographics.firstName', ''),
    get(data, 'demographics.lastName', ''),
    get(data, 'demographics.dob', ''),
    ctx.info.ds
  ];
}

/** Pads a row out to `width` so partial rows still align with the sheet. */
function padRow_(values, width) {
  var row = values.slice(0, width);
  while (row.length < width) row.push('');
  return row;
}

/**
 * WOW Documentation: identity only.
 *
 * Every remaining column — supply quantities, vitals, and the cholesterol/glucose,
 * HIV and Hep C kit/collection/result fields — is captured on site.
 */
function buildWowDocumentationRow_(ctx) {
  return padRow_(clinicalIdentityColumns_(ctx), WOW_DOC_COLUMNS);
}

/**
 * Mobile EM: identity plus the three patient-reported fields the intake form
 * already asked for, so the provider is not retyping them.
 */
function buildMobileEmRow_(ctx, formId) {
  var answers = createAnswerMap(ctx.data);
  var prefill = MOBILE_EM_PREFILL[formId] || {};
  var row = padRow_(clinicalIdentityColumns_(ctx), MOBILE_EM_COLUMNS);

  row[12] = answers[prefill.chiefComplaint] || ''; // 13 Chief Complaint
  row[15] = answers[prefill.history] || '';        // 16 History
  row[16] = answers[prefill.medications] || '';    // 17 Current Medications

  return row;
}

// --- Writing ----------------------------------------------------------------

/**
 * Appends one clinical row per rendered service that has a sheet configured.
 *
 * Each service is written independently: one misconfigured sheet must not cost the
 * others their row, since without it the clinical team has nothing to document
 * into during the appointment.
 */
function writeClinicalRows_(job) {
  var services = (job.info && job.info.services) || [];
  if (!services.length) return;

  var book = SpreadsheetApp.openById(CLINICAL_DOC_SPREADSHEET_ID);
  var byName = {};

  services.forEach(function (service) {
    var config = CLINICAL_SHEETS[service.typeId];
    if (!config) {
      // Normal for services whose row its own generator writes, and for any
      // service with no clinical sheet yet.
      console.log('No clinical sheet configured for service %s', service.typeId);
      return;
    }

    try {
      var row = config.build({ data: job.data, info: job.info, service: service });
      if (!byName[config.sheet]) byName[config.sheet] = [];
      byName[config.sheet].push(row);
    } catch (error) {
      console.error(
        'Could not build the %s row for service %s: %s',
        config.sheet, service.typeId, error.message
      );
    }
  });

  Object.keys(byName).forEach(function (sheetName) {
    try {
      var sheet = book.getSheetByName(sheetName);
      if (!sheet) {
        console.error('Clinical sheet "%s" not found; %s row(s) not written.',
          sheetName, byName[sheetName].length);
        return;
      }
      var rows = byName[sheetName];
      // One batched write per sheet rather than an appendRow per service.
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      console.log('Wrote %s row(s) to %s', rows.length, sheetName);
    } catch (error) {
      console.error('Could not write to %s: %s', sheetName, error.message);
    }
  });
}
