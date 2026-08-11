/**
 * Diagnostics for "the documents never got made".
 *
 * Run `diagnoseDocQueue` from the Apps Script editor and read the log. It answers,
 * in order, the questions that separate the possible causes:
 *
 *   1. Are all the project's files actually deployed?  (missing function names)
 *   2. Is anything scheduled to drain the queue?       (no trigger)
 *   3. Did the jobs get enqueued at all?               (empty queue)
 *   4. Did they fail and get set aside?                (dead-letter jobs)
 *
 * Read-only apart from `retryDeadDocJobs`, which is opt-in.
 */
function diagnoseDocQueue() {
  var lines = [];
  var log = function (text) { lines.push(text); };

  log('=== 1. Deployed code ===');
  var required = [
    'doPost', 'submitForm1', 'enqueueDocJob_', 'processDocQueue', 'runDocJob_',
    'generateDocsFor_', 'writeClinicalRows_', 'logAttachment_', 'servicesForForm_',
    'renderTemplateToPdf_', 'createAnswerMap'
  ];
  required.forEach(function (name) {
    var present = typeof this[name] === 'function';
    log((present ? '  ok      ' : '  MISSING ') + name);
  }, this);

  log('');
  log('  PDF_GENERATORS entries:');
  if (typeof PDF_GENERATORS === 'undefined') {
    log('    MISSING - pdfHandler.gs is not deployed');
  } else {
    Object.keys(PDF_GENERATORS).forEach(function (formId) {
      log('    ' + formId + ' -> ' + (typeof PDF_GENERATORS[formId] === 'function'
        ? 'ok' : 'NOT A FUNCTION (its file is missing)'));
    });
  }

  log('');
  log('  Clinical sheet registry:');
  if (typeof CLINICAL_SHEETS === 'undefined') {
    log('    MISSING - clinicalSheets.gs is not deployed');
  } else {
    Object.keys(CLINICAL_SHEETS).forEach(function (serviceId) {
      log('    ' + serviceId + ' -> ' + CLINICAL_SHEETS[serviceId].sheet);
    });
    try {
      var book = SpreadsheetApp.openById(CLINICAL_DOC_SPREADSHEET_ID);
      log('    spreadsheet: "' + book.getName() + '"');
      var names = book.getSheets().map(function (s) { return s.getName(); });
      Object.keys(CLINICAL_SHEETS).forEach(function (serviceId) {
        var sheetName = CLINICAL_SHEETS[serviceId].sheet;
        if (names.indexOf(sheetName) === -1) log('    MISSING TAB: "' + sheetName + '"');
      });
    } catch (error) {
      log('    CANNOT OPEN CLINICAL_DOC_SPREADSHEET_ID: ' + error.message);
    }
  }

  log('');
  log('=== 2. Triggers ===');
  var triggers = ScriptApp.getProjectTriggers();
  if (!triggers.length) log('  NONE INSTALLED');
  triggers.forEach(function (trigger) {
    log('  ' + trigger.getHandlerFunction() + '  (' + trigger.getEventType() + ')');
  });
  var draining = triggers.some(function (t) {
    return t.getHandlerFunction() === 'processDocQueue';
  });
  log('  processDocQueue scheduled: ' + (draining ? 'YES' : 'NO  <-- nothing drains the queue'));

  log('');
  log('=== 3. Queue contents ===');
  var props = PropertiesService.getScriptProperties().getProperties();
  var pending = [], dead = [], other = [];
  Object.keys(props).forEach(function (key) {
    if (key.indexOf('docJobDead:') === 0) dead.push(key);
    else if (key.indexOf('docJob:') === 0) pending.push(key);
    else other.push(key);
  });
  log('  pending jobs: ' + pending.length);
  log('  dead jobs:    ' + dead.length);
  log('  legacy docQueueV1 present: ' + (props.docQueueV1 ? 'yes' : 'no'));
  log('  other properties: ' + other.join(', '));

  describeDocJobs_(pending.slice(0, 5), props, 'PENDING', log);
  describeDocJobs_(dead.slice(0, 5), props, 'DEAD', log);

  log('');
  log('=== 4. Spill folder ===');
  try {
    var folders = DriveApp.getFoldersByName(DOC_SPILL_FOLDER_NAME);
    if (!folders.hasNext()) {
      log('  no spill folder yet — no job has ever exceeded the inline size cap');
    } else {
      var folder = folders.next();
      var files = folder.getFiles();
      var count = 0;
      while (files.hasNext()) { files.next(); count++; }
      log('  "' + DOC_SPILL_FOLDER_NAME + '" holds ' + count + ' spilled payload(s)');
    }
  } catch (error) {
    log('  CANNOT REACH THE SPILL FOLDER: ' + error.message);
  }

  console.log(lines.join('\n'));
  return lines.join('\n');
}

function describeDocJobs_(keys, props, label, log) {
  if (!keys.length) return;
  log('');
  log('  ' + label + ':');
  keys.forEach(function (key) {
    try {
      var stored = JSON.parse(props[key]);
      log('    ' + key);
      log('      created:  ' + (stored.created ? new Date(stored.created) : 'unknown'));
      log('      attempts: ' + (stored.attempts || 0));
      log('      spilled:  ' + (stored.spillFileId ? stored.spillFileId : 'no (inline)'));
      if (stored.error) log('      ERROR:    ' + stored.error);
      if (stored.info) {
        log('      forms:    ' + stored.info.forms);
        log('      services: ' + (stored.info.services || []).map(function (s) {
          return s.typeId;
        }).join(', '));
      }
    } catch (error) {
      log('    ' + key + ' — UNREADABLE: ' + error.message);
    }
  });
}

/**
 * Moves every dead job back into the queue for one more attempt.
 *
 * Run only after fixing whatever `diagnoseDocQueue` reported, and note that a job
 * which already filed some of its documents will file those again.
 */
function retryDeadDocJobs() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var moved = 0;

  Object.keys(all).forEach(function (key) {
    if (key.indexOf('docJobDead:') !== 0) return;
    var revived = key.replace('docJobDead:', 'docJob:');
    var stored = JSON.parse(all[key]);
    stored.attempts = 0;
    delete stored.error;
    props.setProperty(revived, JSON.stringify(stored));
    props.deleteProperty(key);
    moved++;
  });

  console.log('Requeued %s dead job(s). Run processDocQueue to work through them.', moved);
  return moved;
}
