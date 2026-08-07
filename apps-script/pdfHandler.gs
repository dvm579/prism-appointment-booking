// MAP YOUR FORM IDs TO FUNCTION NAMES HERE
const PDF_GENERATORS = {
  'pedvax25': generatePedVax25PDF,
  'adultvax25': generateAdultVax25PDF,
  'schlphys26': generateSchoolPhys26PDF,
  // Add new forms here as you create them
};

var DOC_QUEUE_KEY = 'docQueueV1';
var DOC_OVERFLOW_PREFIX = 'docJob:'; // per-job props to avoid blocking

function enqueueDocJob_(data, patientID, appointmentID, facilityID, facilityName, dos, sigFile, formsUsed, serviceMap) {
  // sigFile is null when none of the selected services required consent, so a
  // signature was never collected. The job still runs; generators just get no image.
  var job = {
    id: Utilities.getUuid(),
    created: Date.now(),
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
        serviceMap: serviceMap    // FormID -> ServiceID, for column logging
    }
  };

  var lock = LockService.getScriptLock();
  if (lock.tryLock(300)) { // << short cap so the web request doesn't stall
    try {
      var props = PropertiesService.getScriptProperties();
      var queue = JSON.parse(props.getProperty(DOC_QUEUE_KEY) || '[]');
      queue.push(job);
      props.setProperty(DOC_QUEUE_KEY, JSON.stringify(queue));
      return true; // enqueued in main queue
    } finally {
      lock.releaseLock();
    }
  } else {
    // No lock? No wait. Drop into overflow so we don't block the user.
    PropertiesService.getScriptProperties()
      .setProperty(DOC_OVERFLOW_PREFIX + job.id, JSON.stringify(job));
    return false; // enqueued in overflow
  }
}

function processDocQueue() {
  var props = PropertiesService.getScriptProperties();

  // 1) Sweep overflow without any locks
  var all = props.getProperties();
  var overflow = [];
  Object.keys(all).forEach(function(k){
    if (k.indexOf(DOC_OVERFLOW_PREFIX) === 0) {
      overflow.push(JSON.parse(all[k]));
      props.deleteProperty(k);
    }
  });

  // 2) Merge overflow into the main queue under a short lock
  var lock = LockService.getScriptLock();
  if (lock.tryLock(1000)) {
    try {
      var queue = JSON.parse(props.getProperty(DOC_QUEUE_KEY) || '[]');
      // put overflow at the front so oldest jobs run first
      queue = overflow.concat(queue);
      props.setProperty(DOC_QUEUE_KEY, JSON.stringify(queue));
    } finally {
      lock.releaseLock();
    }
  } else {
    // couldn't merge now; re-stash overflow back to props so it's not lost
    overflow.forEach(function(job){ props.setProperty(DOC_OVERFLOW_PREFIX + job.id, JSON.stringify(job)); });
    return;
  }

  // // 3) Process with your existing loop/budget
  // var start = Date.now(), budget = 5*60*1000, safety = 20000;
  // var queue = JSON.parse(props.getProperty(DOC_QUEUE_KEY) || '[]');
  // while (queue.length && (Date.now() - start) < (budget - safety)) {
  //   var job = queue.shift();
  //   try {
  //     var sigBlob = DriveApp.getFileById(job.sigFileId).getBlob();
  //     generateVaccinationPDF(job.data, sigBlob, job.info);
  //   } catch (e) {
  //     // optional retry policy
  //   }
  // }
  // props.setProperty(DOC_QUEUE_KEY, JSON.stringify(queue));

  // 3) Process Queue
  var start = Date.now(), budget = 5*60*1000, safety = 20000;
  var queue = JSON.parse(props.getProperty(DOC_QUEUE_KEY) || '[]');

  while (queue.length && (Date.now() - start) < (budget - safety)) {
    var job = queue.shift();
    try {
      var sigBlob = job.sigFileId ? DriveApp.getFileById(job.sigFileId).getBlob() : null;

      // --- DYNAMIC DISPATCHER LOGIC ---
      // 1. Forms actually used by this registration, as FormIDs (e.g. "pedvax25,schlphys26")
      var formsList = (job.info.forms || "").split(',').map(s => s.trim()).filter(String);

      // 2. Run the generator for each one. A form with no generator is normal -
      //    plenty of intake forms have no clinical sheet behind them.
      formsList.forEach(formId => {
         var generatorFunc = PDF_GENERATORS[formId];

         if (generatorFunc) {
             console.log(`Generating PDF for form: ${formId}`);
             try {
               generatorFunc(job.data, sigBlob, job.info);
             } catch (genError) {
               // One bad generator must not take down the rest of the job.
               console.error(`Generator for ${formId} failed: ${genError.message}`);
             }
         } else {
             console.log(`No PDF generator found for FormID: ${formId}`);
         }
      });

    } catch (e) {
      console.error("Job failed:", e);
      // Optional: Add retry logic or dead-letter queue here
    }
  }
  props.setProperty(DOC_QUEUE_KEY, JSON.stringify(queue));
}


// Optional helper if you want to see how many are waiting
function getDocQueueLength_() {
  var raw = PropertiesService.getScriptProperties().getProperty(DOC_QUEUE_KEY) || '[]';
  return JSON.parse(raw).length;
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