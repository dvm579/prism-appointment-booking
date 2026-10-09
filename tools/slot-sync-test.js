// Runs apps-script/slotSync.gs against in-memory sheets.
//   node tools/slot-sync-test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

const HEADER = ['EventID', 'Date', 'Start Time', 'End Time', 'Status', 'UpdatedAt', 'AppointmentID'];

function makeSheet(rows) {
  const data = rows.map(r => r.slice());
  const cell = (r, c) => (data[r] && data[r][c] !== undefined ? data[r][c] : '');
  const shown = v => (v instanceof Date ? 'stamp' : String(v));
  return {
    data,
    getLastRow: () => data.length,
    getDataRange: () => ({
      getDisplayValues: () => data.map(r => r.map(shown))
    }),
    getRange(row, col, numRows = 1, numCols = 1) {
      const write = vals => vals.forEach((v, i) => {
        while (data.length < row + i) data.push([]);
        v.forEach((x, j) => { data[row - 1 + i][col - 1 + j] = x; });
      });
      return {
        getValues: () => Array.from({ length: numRows }, (_, i) =>
          Array.from({ length: numCols }, (_, j) => cell(row - 1 + i, col - 1 + j))),
        setValues: write,
        setValue: v => write([[v]]),
        clearContent: () => write([Array(numCols).fill('')])
      };
    }
  };
}

function load(sheets) {
  const ctx = {
    console, Logger: { log() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: {
      flush() {},
      openById: id => ({ getSheetByName: name => sheets[id + '/' + name] || sheets[name] })
    },
    Utilities: { formatDate: () => { throw new Error('no Dates expected in these fixtures'); } },
    Session: { getScriptTimeZone: () => 'America/Chicago' }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/slotSync.gs'), 'utf8'), ctx);
  return ctx;
}

function world(slotRows, appts = [], services = []) {
  const sheets = {
    'Appointment Slots': makeSheet([HEADER, ...slotRows]),
    Appointments: makeSheet([Array(13).fill('h'), ...appts]),
    'Services Rendered': makeSheet([Array(11).fill('h'), ...services])
  };
  return { sheets, gs: load(sheets) };
}

const slotsOf = (w, id) => w.sheets['Appointment Slots'].data
  .slice(1).filter(r => r[0] === id).map(r => `${r[2]} ${r[4]}${r[6] ? ' ' + r[6] : ''}`).sort();

const appt = (id, date, time) => {
  const r = Array(13).fill('');
  r[0] = id; r[9] = date; r[11] = 'E1'; r[12] = time;
  return r;
};

const D = '2025-08-02T00:00:00';
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok -', name); }

test('a new event gets its full grid', () => {
  const w = world([['OTHER', D, '09:00', '09:30', 'Open', '', '']]);
  const out = w.gs.populateSlots('E1', D, '09:00:00', '11:00:00', 30);
  assert.deepStrictEqual(slotsOf(w, 'E1'), ['09:00 Open', '09:30 Open', '10:00 Open', '10:30 Open']);
  assert.match(out, /4 slot\(s\); 4 added, 0 removed/);
  assert.deepStrictEqual(w.sheets['Appointment Slots'].data[1].slice(0, 3), ['OTHER', D, '09:00']);
});

test('running again on an unchanged event writes nothing', () => {
  const w = world([]);
  w.gs.populateSlots('E1', D, '09:00', '11:00', 30);
  const before = JSON.stringify(w.sheets['Appointment Slots'].data);
  const out = w.gs.populateSlots('E1', D, '9:00 AM', '11:00 AM', '000:30:00');
  assert.strictEqual(JSON.stringify(w.sheets['Appointment Slots'].data), before);
  assert.match(out, /0 added, 0 removed/);
});

test('a shorter duration keeps exact matches and moves the rest to the nearest time, later on a tie', () => {
  const w = world([
    ['E1', D, '9:00', '9:30', 'Open', '', ''],
    ['E1', D, '9:30', '10:00', 'Booked', 's', 'A930'],
    ['E1', D, '10:00', '10:30', 'Booked', 's', 'A1000'],
    ['E1', D, '10:30', '11:00', 'Pending', 's', '']
  ], [appt('A930', '08-02-2025', '09:30'), appt('A1000', '08-02-2025', '10:00')]);
  const out = w.gs.populateSlots('E1', D, '09:00', '11:00', 20);
  assert.deepStrictEqual(slotsOf(w, 'E1'), [
    '09:00 Open', '09:20 Open', '09:40 Booked A930', '10:00 Booked A1000', '10:20 Open', '10:40 Open'
  ]);
  const a = w.sheets.Appointments.data;
  assert.strictEqual(a[1][12], '09:40');
  assert.strictEqual(a[2][12], '10:00');
  assert.match(out, /A930 09:30 → 09:40/);
  assert.match(out, /Dropped 1 in-progress hold/);
});

test('a status-only row the booking endpoints hold is never rewritten when its time survives', () => {
  const w = world([['E1', D, '09:00', '09:30', 'Pending', 's', '']]);
  w.gs.populateSlots('E1', D, '09:00', '10:00', 30);
  assert.deepStrictEqual(w.sheets['Appointment Slots'].data[1], ['E1', D, '09:00', '09:30', 'Pending', 's', '']);
});

test('a shrunk event seats who it can, earliest first, and reports the rest', () => {
  const w = world([
    ['E1', D, '09:00', '09:30', 'Booked', 's', 'A900'],
    ['E1', D, '09:30', '10:00', 'Open', '', ''],
    ['E1', D, '14:00', '14:30', 'Booked', 's', 'A1400'],
    ['E1', D, '15:00', '15:30', 'Booked', 's', 'A1500'],
    ['E1', D, '15:30', '16:00', 'Open', '', '']
  ], [appt('A1400', '08-02-2025', '14:00'), appt('A1500', '08-02-2025', '15:00')]);
  const out = w.gs.populateSlots('E1', D, '09:00', '10:00', 30);
  assert.deepStrictEqual(slotsOf(w, 'E1'), ['09:00 Booked A900', '09:30 Booked A1400', '15:00 Booked A1500']);
  assert.match(out, /No free time for 1 appointment\(s\).*A1500 at 15:00/);
  // The surplus Open rows are cleared, not deleted: no row below moves.
  assert.strictEqual(w.sheets['Appointment Slots'].data.length, 6);
});

test('a new date follows every booking into Appointments and Services Rendered', () => {
  const w = world(
    [['E1', '2025-08-02', '09:00', '09:30', 'Booked', 's', 'A900'], ['E1', '2025-08-02', '09:30', '10:00', 'Open', '', '']],
    [appt('A900', '08-02-2025', '09:00')],
    [['S1', 'A900', '', '', '', '', '', '', '08-02-2025', 'T', 'Svc'], ['S2', 'OTHER', '', '', '', '', '', '', '08-02-2025', 'T', 'Svc']]
  );
  w.gs.populateSlots('E1', '2025-08-09T00:00:00', '09:00', '10:00', 30);
  const s = w.sheets['Appointment Slots'].data;
  assert.strictEqual(s[1][1], '2025-08-09T00:00:00');
  assert.strictEqual(s[1][4], 'Booked');
  assert.strictEqual(w.sheets.Appointments.data[1][9], '08-09-2025');
  assert.strictEqual(w.sheets.Appointments.data[1][12], '09:00');
  assert.strictEqual(w.sheets['Services Rendered'].data[1][8], '08-09-2025');
  assert.strictEqual(w.sheets['Services Rendered'].data[2][8], '08-02-2025');
});

test('a double-booked time keeps one booking and moves the other', () => {
  const w = world([
    ['E1', D, '09:00', '09:30', 'Booked', 's', 'FIRST'],
    ['E1', D, '09:00', '09:30', 'Booked', 's', 'SECOND']
  ], [appt('SECOND', '08-02-2025', '09:00')]);
  w.gs.populateSlots('E1', D, '09:00', '10:00', 30);
  assert.deepStrictEqual(slotsOf(w, 'E1'), ['09:00 Booked FIRST', '09:30 Booked SECOND']);
});

test('new times reuse blank rows before growing the sheet', () => {
  const w = world([
    ['OTHER', D, '09:00', '09:30', 'Open', '', ''],
    ['', '', '', '', '', '', ''],
    ['OTHER', D, '09:30', '10:00', 'Open', '', '']
  ]);
  w.gs.populateSlots('E1', D, '09:00', '10:00', 30);
  const s = w.sheets['Appointment Slots'].data;
  assert.strictEqual(s[2][0], 'E1');
  assert.strictEqual(s.length, 5);
  assert.strictEqual(s[3][0], 'OTHER');
});

test('bad input is refused before anything is written', () => {
  const w = world([]);
  assert.throws(() => w.gs.populateSlots('E1', D, '09:00', '16:00'), /duration/);
  assert.throws(() => w.gs.populateSlots('E1', D, '16:00', '09:00', 30), /before it starts/);
  assert.throws(() => w.gs.populateSlots('E1', 'soon', '09:00', '10:00', 30), /date/);
  assert.strictEqual(w.sheets['Appointment Slots'].data.length, 1);
});

test('deleting an event clears open and held slots and cancels bookings', () => {
  const w = world([
    ['E1', D, '09:00', '09:30', 'Booked', 's', 'A900'],
    ['OTHER', D, '09:00', '09:30', 'Open', '', ''],
    ['E1', D, '09:30', '10:00', 'Open', '', ''],
    ['E1', D, '10:00', '10:30', 'Pending', 's', '']
  ]);
  const out = w.gs.deleteSlots('E1');
  const s = w.sheets['Appointment Slots'].data;
  assert.strictEqual(s[1][4], 'Cancelled');
  assert.strictEqual(s[1][6], 'A900');
  assert.deepStrictEqual(s[3], ['', '', '', '', '', '', '']);
  assert.deepStrictEqual(s[4], ['', '', '', '', '', '', '']);
  assert.strictEqual(s[2][0], 'OTHER');
  assert.match(out, /cleared 2 slot\(s\).*Cancelled 1 .*A900 at 09:00/);
});

console.log(`\n${passed} passed`);
