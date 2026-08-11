// MAP YOUR FORM IDs TO FUNCTION NAMES HERE
const PDF_GENERATORS = {
  'pedvax25': generatePedVax25PDF,
  'adultvax25': generateAdultVax25PDF,
  'schlphys26': generateSchoolPhys26PDF,
  // Wellness on Wheels / mobile health. The keys are opaque FormIDs, so each
  // generator lives in a file named after the id it serves.
  '99be5397': generateWowSignupPDF,
  '6f25fcaa': generateWowTestingConsentPDF,
  '63948c3e': generateMobileHealthAdultPDF,
  'c2e4d150': generateMobileHealthPediatricPDF,
  // Add new forms here as you create them
};

/**
 * The document queue: one Script Property per job.
 *
 * It used to be a single `docQueueV1` property holding the whole queue as one
 * JSON array. PropertiesService caps a value at 9 KB, and a job carries the
 * entire submission — an ENMADULT registration answers 61 questions across
 * three forms, so its job alone is around 5 KB. Two of those in the array
 * exceeded the cap, `setProperty` threw, and because `tryEnqueueDocJob_`
 * swallows the error the only trace was a log line and a missing PDF.
 *
 * One property per job means the cap applies per job instead of per queue, so
 * queue depth no longer has a ceiling — only the 500 KB store does. Enqueueing
 * also stops needing the script lock: every writer touches a key nobody else
 * has.
 */
var DOC_JOB_PREFIX = 'docJob:';
var DOC_DEAD_PREFIX = 'docJobDead:';

/** The old single-array queue. Drained into per-job properties on sight. */
var DOC_QUEUE_KEY = 'docQueueV1';

/**
 * Largest job kept inline in a property.
 *
 * Per-job properties raise the ceiling but do not remove it, and one job can
 * still pass 9 KB on its own: `additionalSignatures` carries a base64 PNG per
 * signature pad, which `6f25fcaa` collects. Anything over this spills to a
 * Drive file and the property holds a pointer, so no payload size can fail an
 * enqueue.
 *
 * Well under 9 KB because the cap counts bytes and this counts characters
 * before the check converts.
 */
var DOC_JOB_MAX_BYTES = 8000;
var DOC_SPILL_FOLDER_NAME = '_PRISM doc queue spill';

/** Attempts before a job is set aside rather than retried again. */
var DOC_JOB_MAX_ATTEMPTS = 3;

// --- Enqueue ----------------------------------------------------------------

function enqueueDocJob_(data, patientID, appointmentID, facilityID, facilityName, dos, sigFile, formsUsed, serviceMap, services) {
  // sigFile is null when none of the selected services required consent, so a
  // signature was never collected. The job still runs; generators just get no image.
  var job = {
    id: Utilities.getUuid(),
    created: Date.now(),
    attempts: 0,
    sigFileId: sigFile ? sigFile.getId() : '',
    data: data,
    info: {
        pid: patientID,
        aid: appointmentID,
        ds: dos,
        fid: facilityID,
        fname: facilityName,
        forms: formsUsed, // comma-separated FormIDs — the dispatcher keys on these
        sigUrl: sigFile ? "Attachments_Files_/" + sigFile.getName() : '',
        serviceMap: serviceMap,   // FormID -> ServiceID (first service using the form)
        // [{serviceId, typeId, name, formIds}] for every service rendered. A PDF is
        // built once per form, but Attachments and the clinical sheets need a row
        // per service, so the fan-out needs the whole list.
        services: services || []
    }
  };

  storeDocJob_(DOC_JOB_PREFIX, job);
  return job.id;
}

/** What a spilled job leaves in the property: everything but the payload. */
function docJobPointer_(job) {
  return {
    id: job.id,
    created: job.created,
    attempts: job.attempts || 0,
    spillFileId: job.spillFileId,
    error: job.error
  };
}

/**
 * Writes one job to its own property, spilling the payload to Drive if it is
 * too big to sit in one.
 *
 * A job that has already spilled keeps its file: `data` and `info` never change
 * between attempts, so a retry only rewrites the pointer.
 */
function storeDocJob_(prefix, job) {
  var props = PropertiesService.getScriptProperties();

  if (!job.spillFileId) {
    var payload = JSON.stringify(job);
    if (Utilities.newBlob(payload).getBytes().length <= DOC_JOB_MAX_BYTES) {
      props.setProperty(prefix + job.id, payload);
      return;
    }
    job.spillFileId = docSpillFolder_()
      .createFile(job.id + '.json', payload, 'application/json')
      .getId();
  }

  props.setProperty(prefix + job.id, JSON.stringify(docJobPointer_(job)));
}

/** The spill folder, created on first use so there is nothing to set up. */
function docSpillFolder_() {
  var found = DriveApp.getFoldersByName(DOC_SPILL_FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(DOC_SPILL_FOLDER_NAME);
}

/** Reads a stored job, pulling the payload back from Drive if it spilled. */
function loadDocJob_(raw) {
  var stored = JSON.parse(raw);
  if (!stored.spillFileId) return stored;

  var job = JSON.parse(DriveApp.getFileById(stored.spillFileId).getBlob().getDataAsString());
  job.id = stored.id;
  job.created = stored.created;
  job.attempts = stored.attempts || 0;
  job.spillFileId = stored.spillFileId;
  return job;
}

function discardDocSpill_(job) {
  if (!job.spillFileId) return;
  try {
    DriveApp.getFileById(job.spillFileId).setTrashed(true);
  } catch (error) {
    console.warn('Could not clean up spill file %s: %s', job.spillFileId, error.message);
  }
}

// --- Processing -------------------------------------------------------------

function processDocQueue() {
  migrateLegacyDocQueue_();

  var start = Date.now();
  var budget = 5 * 60 * 1000;
  // Room for the longest single job. Claiming is destructive, so a job cut off
  // by the execution limit is a document that never gets made — the margin
  // matters more than squeezing in one more job.
  var safety = 60 * 1000;

  var pending = pendingDocJobs_();

  for (var i = 0; i < pending.length; i++) {
    if (Date.now() - start > budget - safety) {
      console.log('Doc queue: out of time with %s job(s) still pending.', pending.length - i);
      return;
    }
    runDocJob_(pending[i].key);
  }
}

/** Every queued job's property key, oldest first. */
function pendingDocJobs_() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var jobs = [];

  Object.keys(all).forEach(function (key) {
    // 'docJobDead:…' does not match: the prefix includes the colon.
    if (key.indexOf(DOC_JOB_PREFIX) !== 0) return;

    var created = 0;
    try {
      created = JSON.parse(all[key]).created || 0;
    } catch (error) {
      // Unreadable, so it sorts first and `runDocJob_` sets it aside.
    }
    jobs.push({ key: key, created: created });
  });

  jobs.sort(function (a, b) { return a.created - b.created; });
  return jobs;
}

/**
 * Deletes a job's property and returns what it held.
 *
 * Read and delete are one critical section so two overlapping executions
 * cannot both take the same job and file every document twice. Deleting
 * *before* the work rather than after makes a job lost if the execution is cut
 * off mid-run — the deliberate trade, because duplicate EMR rows are far harder
 * to unpick than a missing PDF the log names.
 *
 * @return {string|null} null when another execution got there first.
 */
function claimDocJob_(key) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return null;

  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(key);
    if (raw) props.deleteProperty(key);
    return raw;
  } finally {
    lock.releaseLock();
  }
}

function runDocJob_(key) {
  var raw = claimDocJob_(key);
  if (!raw) return;

  var job;
  try {
    job = loadDocJob_(raw);
  } catch (error) {
    // Nothing to retry with — a job we cannot read cannot be run.
    console.error('Doc job %s could not be read (%s); setting it aside.', key, error.message);
    PropertiesService.getScriptProperties()
      .setProperty(key.replace(DOC_JOB_PREFIX, DOC_DEAD_PREFIX), raw);
    return;
  }

  try {
    generateDocsFor_(job);
    // Per-service clinical rows, after the documents exist. Guarded separately so
    // a sheet problem cannot trigger a job retry that would regenerate every PDF.
    try {
      writeClinicalRows_(job);
    } catch (error) {
      console.error('Clinical rows failed for appointment %s: %s', job.info.aid, error.message);
    }
    discardDocSpill_(job);
  } catch (error) {
    retryOrBuryDocJob_(job, error);
  }
}

/**
 * Runs the generator for each form this registration used.
 *
 * A generator that throws is logged and skipped: one bad template must not cost
 * the patient the rest of their paperwork. That also keeps job-level retries
 * safe — the only failures that reach `runDocJob_` happen before any generator
 * runs, so a retry cannot duplicate a document that was already filed.
 */
function generateDocsFor_(job) {
  var sigBlob = job.sigFileId ? DriveApp.getFileById(job.sigFileId).getBlob() : null;

  // FormIDs, e.g. "99be5397,6f25fcaa,63948c3e".
  var formsList = String(job.info.forms || '')
    .split(',')
    .map(function (formId) { return formId.trim(); })
    .filter(String);

  formsList.forEach(function (formId) {
    var generator = PDF_GENERATORS[formId];

    // A form with no generator is normal — plenty of intake forms have no
    // clinical sheet behind them.
    if (!generator) {
      console.log('No PDF generator for FormID: %s', formId);
      return;
    }

    console.log('Generating PDF for form: %s', formId);
    try {
      generator(job.data, sigBlob, job.info);
    } catch (error) {
      console.error('Generator for %s failed: %s', formId, error.message);
    }
  });
}

/**
 * Puts a failed job back for another pass, or sets it aside once it has had
 * enough.
 *
 * The old loop dropped a failed job on the floor, so a transient Drive error
 * silently cost the patient their documents.
 */
function retryOrBuryDocJob_(job, error) {
  job.attempts = (job.attempts || 0) + 1;

  if (job.attempts < DOC_JOB_MAX_ATTEMPTS) {
    console.error('Doc job %s failed (attempt %s): %s', job.id, job.attempts, error.message);
    storeDocJob_(DOC_JOB_PREFIX, job);
    return;
  }

  console.error(
    'Doc job %s failed %s times, setting it aside: %s', job.id, job.attempts, error.message
  );
  job.error = error.message;
  storeDocJob_(DOC_DEAD_PREFIX, job);
}

/**
 * Drains the old single-array queue into per-job properties.
 *
 * Cheap once the property is gone, and it means deploying this mid-queue does
 * not strand whatever was already in it.
 */
function migrateLegacyDocQueue_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(DOC_QUEUE_KEY)) return;

  var lock = LockService.getScriptLock();
  // Without the lock a second execution could re-add jobs this one has already
  // claimed and run.
  if (!lock.tryLock(10000)) return;

  try {
    var raw = props.getProperty(DOC_QUEUE_KEY);
    if (!raw) return;

    var queue;
    try {
      queue = JSON.parse(raw) || [];
    } catch (error) {
      console.error('Legacy doc queue is unreadable, leaving it in place: %s', error.message);
      return;
    }

    queue.forEach(function (job) {
      job.attempts = job.attempts || 0;
      storeDocJob_(DOC_JOB_PREFIX, job);
    });
    props.deleteProperty(DOC_QUEUE_KEY);
    console.log('Migrated %s job(s) out of the legacy queue.', queue.length);
  } finally {
    lock.releaseLock();
  }
}

// --- Inspection -------------------------------------------------------------

/** How many jobs are waiting. */
function getDocQueueLength_() {
  return pendingDocJobs_().length;
}

/**
 * Jobs that failed `DOC_JOB_MAX_ATTEMPTS` times, for the Executions log.
 *
 * Nothing clears these — a buried job is a real failure worth looking at, and
 * a spilled one keeps its Drive file so the payload can still be read.
 */
function listDeadDocJobs() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var dead = Object.keys(all)
    .filter(function (key) { return key.indexOf(DOC_DEAD_PREFIX) === 0; })
    .map(function (key) { return all[key]; });

  console.log(dead.length ? dead.join('\n') : 'No jobs have been set aside.');
  return dead;
}

/**
 * Converts the formResponses array into a simple object for easier lookups.
 * Input: [{questionId: 'pedvax25-1', answer: 'Yes'}, ...]
 * Output: {'pedvax25-1': 'Yes', ...}
 */
function createAnswerMap(formData) {
  var map = {};
  if (formData.formResponses && Array.isArray(formData.formResponses)) {
    formData.formResponses.forEach(r => {
      map[r.questionId] = r.answer;
    });
  }
  return map;
}