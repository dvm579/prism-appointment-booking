/**
 * Keeps an event's Appointment Slots in step with its Events row.
 *
 * This is a STANDALONE Apps Script project called by AppSheet automations, not
 * part of the web app project endpoints.gs lives in. Two bots call it:
 *
 *   Events — Adds and updates  →  populateSlots([EventID], [Date], [Start Time], [End Time], [Duration])
 *   Events — Deletes           →  deleteSlots([EventID])
 *
 * populateSlots is idempotent: it computes the grid the event should have now
 * and reconciles the sheet against it, so running it on an unchanged event
 * writes nothing.
 *
 * What happens to people already in a slot when the grid changes:
 *
 *   Booked, time still exists   Stays put. If the date moved, the slot and the
 *                               EMR rows take the new date.
 *   Booked, time is gone        Moved to the nearest free new time (a tie goes
 *                               to the later one, so nobody is asked to arrive
 *                               earlier than planned). Earlier appointments
 *                               choose first. The Appointments row is updated.
 *   Booked, nowhere left to go  Left Booked at its old time and reported. The
 *                               slot still blocks that time on the page, and
 *                               staff decide whether to fit them in or cancel.
 *   Pending, time is gone       The hold is dropped. That patient's submit fails
 *                               with SLOT_EXPIRED and they pick again.
 *   Event deleted               Open and Pending rows are cleared, Booked rows
 *                               become 'Cancelled' and are reported.
 *
 * The return value is a one-paragraph summary, so an AppSheet step can email it
 * to staff. Patients are NOT notified of a moved time by this script.
 *
 * Rows are never deleted, only rewritten or cleared in place. The booking
 * endpoints read the sheet, then write to the row number they found, under a
 * lock this project cannot take. Deleting a row shifts every row below it, so a
 * booking confirmed during that window would stamp 'Booked' on someone else's
 * slot. A rewritten row is still matched by event, time and status, so a write
 * that lands on it after a change fails safely as SLOT_EXPIRED. Cleared rows are
 * reused by the next sync that needs space, so they do not pile up.
 */

const SYNC_SLOTS_BOOK_ID = '17226ud6cLY7gbLyv0IS_3k1mylHeWuoHHKyr96hoy1I'; // Events Management
const SYNC_EMR_BOOK_ID = '1CX9GiID58srjCcrB_QH2RNgzMYtYSKFbfTmxKPwYeLs';  // Main DB

/** Columns of 'Appointment Slots' (1-based), as in endpoints.gs. */
const SYNC_COL = { eventId: 1, date: 2, startTime: 3, endTime: 4, status: 5, updatedAt: 6, appointmentId: 7 };
const SYNC_WIDTH = 7;

/** Where a booked appointment's date and time are copied in Main DB (1-based). */
const SYNC_APPT_COL = { id: 1, date: 10, time: 13 };
const SYNC_SERVICE_COL = { appointmentId: 2, date: 9 };

/** A guard against a bad duration filling the sheet. */
const SYNC_MAX_SLOTS = 500;

// --- Entry points (called by AppSheet) ---------------------------------------

/**
 * Creates or reconciles an event's slots. Safe to run on every add and update.
 *
 * @param {string} id EventID
 * @param {string|Date} date '2025-08-02T00:00:00', '2025-08-02' or '8/2/2025'
 * @param {string|Date} start '09:00:00', '09:00' or '9:00 AM'
 * @param {string|Date} end
 * @param {number|string} durationMinutes 30, '30', or an AppSheet Duration '000:30:00'
 * @return {string} a summary of what changed
 */
function populateSlots(id, date, start, end, durationMinutes) {
  Logger.log([id, date, start, end, durationMinutes]);
  if (!id) throw new Error('populateSlots needs an EventID.');

  const day = syncDateKey_(date);
  if (!day) throw new Error('Event ' + id + ': cannot read the date "' + date + '".');
  const wanted = syncSlotGrid_(start, end, durationMinutes);

  return syncWithLock_(function () {
    const sheet = syncSlotSheet_();
    const rows = syncReadRows_(sheet);
    const plan = planSlotSync_(rows, id, date, wanted, new Date());

    syncApply_(sheet, plan);
    syncUpdateEmr_(plan.emrUpdates, day);

    const summary = syncSummary_(id, wanted.length, plan);
    Logger.log(summary);
    return summary;
  });
}

/**
 * Clears an event's open and held slots and cancels its booked ones.
 *
 * @param {string} id EventID
 * @return {string} a summary naming any cancelled appointments
 */
function deleteSlots(id) {
  Logger.log(['deleteSlots', id]);
  if (!id) throw new Error('deleteSlots needs an EventID.');

  return syncWithLock_(function () {
    const sheet = syncSlotSheet_();
    const rows = syncReadRows_(sheet);
    const now = new Date();
    const cancelled = [];
    let cleared = 0;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][SYNC_COL.eventId - 1]).trim() !== String(id)) continue;
      if (rows[i][SYNC_COL.status - 1] === 'Booked') {
        sheet.getRange(i + 1, SYNC_COL.status, 1, 2).setValues([['Cancelled', now]]);
        cancelled.push(rows[i][SYNC_COL.appointmentId - 1] + ' at ' + rows[i][SYNC_COL.startTime - 1]);
      } else {
        sheet.getRange(i + 1, 1, 1, SYNC_WIDTH).clearContent();
        cleared++;
      }
    }
    SpreadsheetApp.flush();

    const summary = 'Event ' + id + ' deleted: cleared ' + cleared + ' slot(s).' +
      (cancelled.length
        ? ' Cancelled ' + cancelled.length + ' booked appointment(s) that need contacting: ' +
          cancelled.join('; ') + '.'
        : '');
    Logger.log(summary);
    return summary;
  });
}

function test() {
  Logger.log(populateSlots('4c5df741', '2025-08-02T00:00:00', '09:00:00', '16:00:00', 30));
}

// --- Planning (pure: no Sheets calls, so it can be tested in Node) ----------

/**
 * Works out the writes that turn this event's rows into the wanted grid.
 *
 * @param {string[][]} rows display values of the whole sheet, header included
 * @param {string} eventId
 * @param {string|Date} date written to the Date column as given
 * @param {{start: string, end: string}[]} wanted sorted by start
 * @param {Date} now
 */
function planSlotSync_(rows, eventId, date, wanted, now) {
  const day = syncDateKey_(date);
  const mine = [];
  const blanks = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.slice(0, SYNC_WIDTH).every(function (cell) { return String(cell).trim() === ''; })) {
      blanks.push(i + 1);
      continue;
    }
    if (String(row[SYNC_COL.eventId - 1]).trim() !== String(eventId)) continue;
    mine.push({
      row: i + 1,
      start: syncNormalizeTime_(row[SYNC_COL.startTime - 1]),
      shownStart: row[SYNC_COL.startTime - 1],
      end: syncNormalizeTime_(row[SYNC_COL.endTime - 1]),
      day: syncDateKey_(row[SYNC_COL.date - 1]),
      status: row[SYNC_COL.status - 1],
      appointmentId: String(row[SYNC_COL.appointmentId - 1] || '').trim()
    });
  }

  const endOf = {};
  wanted.forEach(function (slot) { endOf[slot.start] = slot.end; });

  // Booked first, then held, then anything else, so a duplicate row at one time
  // never displaces the row someone is actually in.
  const rank = { Booked: 0, Pending: 1, Open: 3 };
  const byRank = mine.slice().sort(function (a, b) {
    const ra = a.status in rank ? rank[a.status] : 2;
    const rb = b.status in rank ? rank[b.status] : 2;
    return ra - rb || a.row - b.row;
  });

  const plan = {
    writes: [],      // { row, col, values }
    clears: [],      // row numbers
    appends: [],     // full rows
    moved: [],       // { appointmentId, from, to }
    unplaced: [],    // { appointmentId, start }
    droppedHolds: 0,
    added: 0,
    removed: 0,
    emrUpdates: []   // { appointmentId, time (or null), redate }
  };

  // A row that keeps its time gets only Date and End Time rewritten: the status
  // columns belong to the booking endpoints, and touching them here would race
  // a booking in flight.
  function keep(slot) {
    if (slot.day !== day || slot.end !== endOf[slot.start]) {
      plan.writes.push({ row: slot.row, col: SYNC_COL.date, values: [date, slot.start, endOf[slot.start]] });
    }
    if (slot.status === 'Booked' && slot.appointmentId && slot.day !== day) {
      plan.emrUpdates.push({ appointmentId: slot.appointmentId, time: null, redate: true });
    }
  }

  // Someone in a slot claims its time outright. An Open row only marks a time
  // as already having a row; a displaced booking may still take that time.
  const claimed = {};
  const openAt = {};
  const displacedBooked = [];
  const recyclable = [];

  byRank.forEach(function (slot) {
    const fits = Boolean(slot.start) && endOf.hasOwnProperty(slot.start) && !claimed[slot.start];
    if (fits && slot.status !== 'Open') {
      claimed[slot.start] = true;
      keep(slot);
    } else if (fits && !openAt[slot.start]) {
      openAt[slot.start] = slot;
    } else if (slot.status === 'Booked') {
      displacedBooked.push(slot);
    } else {
      if (slot.status === 'Pending') plan.droppedHolds++;
      recyclable.push(slot.row);
    }
  });

  const free = wanted
    .map(function (slot) { return slot.start; })
    .filter(function (start) { return !claimed[start]; });

  // Earlier appointments choose first; unreadable times go last.
  displacedBooked.sort(function (a, b) {
    return syncMinutes_(a.start, Infinity) - syncMinutes_(b.start, Infinity) || a.row - b.row;
  });
  displacedBooked.forEach(function (slot) {
    const pick = syncNearest_(free, slot.start);
    if (pick < 0) {
      plan.unplaced.push({ appointmentId: slot.appointmentId, start: slot.shownStart });
      if (slot.day !== day) {
        plan.writes.push({ row: slot.row, col: SYNC_COL.date, values: [date] });
        if (slot.appointmentId) {
          plan.emrUpdates.push({ appointmentId: slot.appointmentId, time: null, redate: true });
        }
      }
      return;
    }
    const to = free.splice(pick, 1)[0];
    if (openAt[to]) {
      recyclable.push(openAt[to].row);
      delete openAt[to];
    }
    plan.writes.push({
      row: slot.row,
      col: SYNC_COL.date,
      values: [date, to, endOf[to], 'Booked', now, slot.appointmentId]
    });
    plan.moved.push({ appointmentId: slot.appointmentId, from: slot.start || slot.shownStart, to: to });
    if (slot.appointmentId) {
      plan.emrUpdates.push({ appointmentId: slot.appointmentId, time: to, redate: slot.day !== day });
    }
  });

  // New times fill rows this event no longer needs, then blank rows, then the end.
  recyclable.sort(function (a, b) { return a - b; });
  free.forEach(function (start) {
    const fresh = [date, start, endOf[start], 'Open', now, ''];
    if (openAt[start]) {
      keep(openAt[start]);
    } else if (recyclable.length) {
      plan.writes.push({ row: recyclable.shift(), col: SYNC_COL.date, values: fresh });
    } else if (blanks.length) {
      plan.writes.push({ row: blanks.shift(), col: SYNC_COL.eventId, values: [eventId].concat(fresh) });
      plan.added++;
    } else {
      plan.appends.push([eventId].concat(fresh));
      plan.added++;
    }
  });

  plan.clears = recyclable;
  plan.removed = recyclable.length;
  return plan;
}

/** Index in `free` of the start nearest `start`, ties to the later; -1 if none. */
function syncNearest_(free, start) {
  if (!free.length) return -1;
  const target = syncMinutes_(start, null);
  if (target === null) return 0;
  let best = 0;
  for (let i = 1; i < free.length; i++) {
    const gap = Math.abs(syncMinutes_(free[i]) - target);
    const bestGap = Math.abs(syncMinutes_(free[best]) - target);
    if (gap < bestGap || (gap === bestGap && syncMinutes_(free[i]) > syncMinutes_(free[best]))) {
      best = i;
    }
  }
  return best;
}

/**
 * The slots an event should have: back to back from start, each starting
 * before the end. The last one may run past the end, as it always has.
 */
function syncSlotGrid_(start, end, durationMinutes) {
  const from = syncMinutes_(syncNormalizeTime_(start), null);
  const to = syncMinutes_(syncNormalizeTime_(end), null);
  const step = syncDuration_(durationMinutes);

  if (from === null || to === null) {
    throw new Error('Cannot read the event times "' + start + '" to "' + end + '".');
  }
  if (!(step > 0)) {
    throw new Error('The slot duration must be a positive number of minutes, not "' + durationMinutes + '".');
  }
  if (to <= from) throw new Error('The event ends (' + end + ') before it starts (' + start + ').');
  if ((to - from) / step > SYNC_MAX_SLOTS) {
    throw new Error('A ' + step + '-minute slot gives more than ' + SYNC_MAX_SLOTS + ' slots.');
  }

  const slots = [];
  for (let t = from; t < to; t += step) {
    slots.push({ start: syncClock_(t), end: syncClock_(t + step) });
  }
  return slots;
}

// --- Writing ----------------------------------------------------------------

function syncApply_(sheet, plan) {
  plan.writes.forEach(function (write) {
    sheet.getRange(write.row, write.col, 1, write.values.length).setValues([write.values]);
  });
  plan.clears.forEach(function (row) {
    sheet.getRange(row, 1, 1, SYNC_WIDTH).clearContent();
  });
  if (plan.appends.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, plan.appends.length, SYNC_WIDTH).setValues(plan.appends);
  }
  SpreadsheetApp.flush();
}

/**
 * Copies moved times and changed dates into Appointments and Services Rendered,
 * written the way registration writes them ('MM-dd-yyyy', 'HH:mm').
 */
function syncUpdateEmr_(updates, day) {
  if (!updates.length) return;

  const parts = day.split('-');
  const serviceDate = parts[1] + '-' + parts[2] + '-' + parts[0];
  const byId = {};
  updates.forEach(function (update) { byId[update.appointmentId] = update; });

  const book = SpreadsheetApp.openById(SYNC_EMR_BOOK_ID);
  const found = {};

  const appointments = book.getSheetByName('Appointments');
  syncColumn_(appointments, SYNC_APPT_COL.id).forEach(function (id, i) {
    const update = byId[id];
    if (!update) return;
    found[id] = true;
    if (update.redate) appointments.getRange(i + 2, SYNC_APPT_COL.date).setValue(serviceDate);
    if (update.time) appointments.getRange(i + 2, SYNC_APPT_COL.time).setValue(update.time);
  });

  const services = book.getSheetByName('Services Rendered');
  syncColumn_(services, SYNC_SERVICE_COL.appointmentId).forEach(function (id, i) {
    const update = byId[id];
    if (update && update.redate) services.getRange(i + 2, SYNC_SERVICE_COL.date).setValue(serviceDate);
  });

  Object.keys(byId).forEach(function (id) {
    if (!found[id]) console.warn('Appointment %s is not in Main DB Appointments; its slot moved anyway.', id);
  });
}

/** One column's values below the header, as trimmed strings. */
function syncColumn_(sheet, col) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, col, last - 1, 1).getValues().map(function (row) {
    return String(row[0]).trim();
  });
}

function syncSummary_(id, total, plan) {
  const parts = ['Event ' + id + ': ' + total + ' slot(s); ' + plan.added + ' added, ' + plan.removed + ' removed.'];
  if (plan.moved.length) {
    parts.push('Moved ' + plan.moved.length + ' appointment(s): ' + plan.moved.map(function (move) {
      return move.appointmentId + ' ' + move.from + ' → ' + move.to;
    }).join('; ') + '.');
  }
  if (plan.unplaced.length) {
    parts.push('No free time for ' + plan.unplaced.length + ' appointment(s), left at their old time: ' +
      plan.unplaced.map(function (slot) { return slot.appointmentId + ' at ' + slot.start; }).join('; ') + '.');
  }
  if (plan.droppedHolds) {
    parts.push('Dropped ' + plan.droppedHolds + ' in-progress hold(s); those patients will be asked to pick again.');
  }
  return parts.join(' ');
}

// --- Sheet access and locking -----------------------------------------------

function syncSlotSheet_() {
  const sheet = SpreadsheetApp.openById(SYNC_SLOTS_BOOK_ID).getSheetByName('Appointment Slots');
  if (!sheet) throw new Error('The "Appointment Slots" sheet could not be found.');
  return sheet;
}

/** Display values, padded to the slot columns so short rows index safely. */
function syncReadRows_(sheet) {
  return sheet.getDataRange().getDisplayValues().map(function (row) {
    while (row.length < SYNC_WIDTH) row.push('');
    return row;
  });
}

/** Serialises AppSheet calls to this project, e.g. a bulk edit of events. */
function syncWithLock_(work) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

// --- Values -----------------------------------------------------------------

/** 'HH:mm' from '9:00', '09:00:00', '9:00 AM' or a Date; '' if unreadable. */
function syncNormalizeTime_(value) {
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

/** 'yyyy-MM-dd' from '2025-08-02T00:00:00', '8/2/2025' or a Date; '' if unreadable. */
function syncDateKey_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const raw = String(value == null ? '' : value).trim();
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  return '';
}

/** Minutes after midnight of an 'HH:mm', or `fallback` if it is not one. */
function syncMinutes_(time, fallback) {
  const m = String(time || '').match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

/** 'HH:mm' of minutes after midnight, wrapping past midnight. */
function syncClock_(minutes) {
  const t = ((minutes % 1440) + 1440) % 1440;
  return ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + (t % 60)).slice(-2);
}

/** Minutes from a number, '30', or an AppSheet Duration such as '000:30:00'. */
function syncDuration_(value) {
  const m = String(value == null ? '' : value).trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0);
  return Number(value);
}
