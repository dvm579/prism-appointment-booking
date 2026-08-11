/**
 * Repair tools for the document queue.
 *
 *   installProjectTriggers  — the queue and the slot sweep both need one
 *   inspectDeadDocJobs      — why a buried job could not be read
 *   requeueDeadDocJobs      — put them back once the cause is fixed
 *   tidySpillFolder         — remove payloads no job points at any more
 */

/** How often the two background jobs run, in minutes. */
var DOC_QUEUE_TRIGGER_MINUTES = 5;
var SLOT_SWEEP_TRIGGER_MINUTES = 5;

/**
 * Installs the time-driven triggers this project needs, replacing any duplicates.
 *
 * `processDocQueue` files the paperwork for each registration. `checkPendingToOpen`
 * returns abandoned holds to the pool — without it a patient who closes the tab
 * takes a slot out of circulation permanently.
 */
function installProjectTriggers() {
  var wanted = [
    { handler: 'processDocQueue', minutes: DOC_QUEUE_TRIGGER_MINUTES },
    { handler: 'checkPendingToOpen', minutes: SLOT_SWEEP_TRIGGER_MINUTES }
  ];
  var handlers = wanted.map(function (item) { return item.handler; });

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) === -1) return;
    ScriptApp.deleteTrigger(trigger);
    console.log('Removed existing trigger for %s', trigger.getHandlerFunction());
  });

  wanted.forEach(function (item) {
    ScriptApp.newTrigger(item.handler).timeBased().everyMinutes(item.minutes).create();
    console.log('Installed %s every %s minutes', item.handler, item.minutes);
  });

  return ScriptApp.getProjectTriggers().map(function (trigger) {
    return trigger.getHandlerFunction();
  });
}

/**
 * Reports why each buried job could not be read.
 *
 * `loadDocJob_` does four things that can fail independently, so each is tried on
 * its own and the first failure is named rather than collapsed into one message.
 */
function inspectDeadDocJobs() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var lines = [];
  var log = function (text) { lines.push(text); };

  Object.keys(props).forEach(function (key) {
    if (key.indexOf('docJobDead:') !== 0) return;

    log('=== ' + key + ' ===');
    var stored;
    try {
      stored = JSON.parse(props[key]);
    } catch (error) {
      log('  the stored pointer itself is not JSON: ' + error.message);
      log('  raw: ' + String(props[key]).slice(0, 200));
      return;
    }

    log('  attempts: ' + (stored.attempts || 0));
    log('  recorded error: ' + (stored.error || '(none — buried before it could be read)'));
    if (!stored.spillFileId) {
      log('  stored inline, so reading it never touched Drive');
      return;
    }
    log('  spillFileId: ' + stored.spillFileId);

    var file;
    try {
      file = DriveApp.getFileById(stored.spillFileId);
      log('  step 1 getFileById: ok — "' + file.getName() + '"');
      log('    size: ' + file.getSize() + ' bytes, mime: ' + file.getMimeType());
      log('    trashed: ' + file.isTrashed());
    } catch (error) {
      log('  step 1 getFileById FAILED: ' + error.message);
      return;
    }

    var blob;
    try {
      blob = file.getBlob();
      log('  step 2 getBlob: ok — ' + blob.getBytes().length + ' bytes');
    } catch (error) {
      log('  step 2 getBlob FAILED: ' + error.message);
      return;
    }

    var text;
    try {
      text = blob.getDataAsString();
      log('  step 3 getDataAsString: ok — ' + text.length + ' chars');
      log('    starts: ' + text.slice(0, 80));
      log('    ends:   ' + text.slice(-80));
    } catch (error) {
      log('  step 3 getDataAsString FAILED: ' + error.message);
      return;
    }

    try {
      var job = JSON.parse(text);
      log('  step 4 JSON.parse: ok');
      log('    forms: ' + (job.info && job.info.forms));
      log('    services: ' + ((job.info && job.info.services) || []).map(function (s) {
        return s.typeId;
      }).join(', '));
      log('    responses: ' + ((job.data && job.data.formResponses) || []).length);
      log('    additionalSignatures: ' + ((job.data && job.data.additionalSignatures) || []).length);
      log('  -> readable now; the original failure was transient, so requeue it');
    } catch (error) {
      log('  step 4 JSON.parse FAILED: ' + error.message);
      log('    this is the cause — the spilled payload is not valid JSON');
    }
  });

  if (!lines.length) log('No dead jobs.');
  console.log(lines.join('\n'));
  return lines.join('\n');
}

/**
 * Moves buried jobs back into the queue for another attempt.
 *
 * A job that already filed some of its documents will file those again, so only
 * run this for jobs that failed before generating anything.
 */
function requeueDeadDocJobs() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var moved = 0;

  Object.keys(all).forEach(function (key) {
    if (key.indexOf('docJobDead:') !== 0) return;

    var stored;
    try {
      stored = JSON.parse(all[key]);
    } catch (error) {
      console.error('Leaving %s alone — its pointer is unreadable.', key);
      return;
    }
    if (!stored.spillFileId && !stored.data) {
      console.error('Leaving %s alone — nothing to run.', key);
      return;
    }

    stored.attempts = 0;
    delete stored.error;
    props.setProperty(key.replace('docJobDead:', 'docJob:'), JSON.stringify(stored));
    props.deleteProperty(key);
    moved++;
  });

  console.log('Requeued %s job(s). Run processDocQueue, or wait for its trigger.', moved);
  return moved;
}

/** Trashes spilled payloads no queued or buried job still points at. */
function tidySpillFolder() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var referenced = {};

  Object.keys(props).forEach(function (key) {
    if (key.indexOf('docJob') !== 0) return;
    try {
      var id = JSON.parse(props[key]).spillFileId;
      if (id) referenced[id] = true;
    } catch (error) {
      // An unreadable pointer cannot claim a file.
    }
  });

  var folders = DriveApp.getFoldersByName(DOC_SPILL_FOLDER_NAME);
  if (!folders.hasNext()) {
    console.log('No spill folder.');
    return 0;
  }

  var files = folders.next().getFiles();
  var trashed = 0;
  while (files.hasNext()) {
    var file = files.next();
    if (referenced[file.getId()]) continue;
    file.setTrashed(true);
    trashed++;
  }

  console.log('Trashed %s orphaned payload(s).', trashed);
  return trashed;
}
