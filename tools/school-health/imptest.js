const fs = require('fs'), vm = require('vm');

// --- a tiny in-memory Sheets stand-in --------------------------------------
function makeSheet(name, header, rows) {
  // A brand-new sheet has no rows at all; getLastRow() is 0, not 1.
  const data = header.length ? [header.slice(), ...rows.map(r => r.slice())] : [];
  return {
    name,
    data,
    getLastRow: () => data.length,
    appendRow: r => data.push(r.slice()),
    deleteRow: r => { data.splice(r - 1, 1); },
    getMaxRows: () => Math.max(data.length, 1000),
    getRange(row, col, numRows, numCols) {
      const self = this;
      return {
        getDataValidation: () => self._dv || null,
        setDataValidation: rule => { self._dv = rule; },
        getValue: () => (data[row - 1] || [])[col - 1] ?? '',
        setValue: v => { while (data.length <= row - 1) data.push([]); data[row - 1][col - 1] = v; },
        getValues: () => Array.from({ length: numRows }, (_, i) =>
          Array.from({ length: numCols }, (_, jj) => {
            const src = data[row - 1 + i];
            return src && src[col - 1 + jj] !== undefined ? src[col - 1 + jj] : '';
          })),
        // What Sheets paints in the cell: a Date shows as its format, not as
        // its string form.
        getDisplayValues: () => Array.from({ length: numRows }, (_, i) =>
          Array.from({ length: numCols }, (_, jj) => {
            const src = data[row - 1 + i];
            const v = src && src[col - 1 + jj] !== undefined ? src[col - 1 + jj] : '';
            return v instanceof Date ? v.__shown : String(v);
          })),
        setNumberFormat: fmt => { self.__formats = self.__formats || {}; self.__formats[row + ':' + col] = fmt; },
        setValues: vals => vals.forEach((v, i) => {
          const at = row - 1 + i;
          while (data.length <= at) data.push([]);
          v.forEach((cell, jj) => { data[at][col - 1 + jj] = cell; });
        }),
        setValue: v => {
          while (data.length <= row - 1) data.push([]);
          data[row - 1][col - 1] = v;
        }
      };
    }
  };
}

/** A cell Sheets parsed as a date but paints as the text that was typed. */
function dateCell(shown) {
  const d = new Date('2026-12-18T00:00:00Z');
  d.__shown = shown;
  return d;
}

function makeBook(sheets, name = 'Events Management') {
  return {
    getName: () => name,
    getSheets: () => Object.keys(sheets).map(n => ({ getName: () => n })),
    sheets,
    getSheetByName: n => sheets[n] || null,
    insertSheet(n) { sheets[n] = makeSheet(n, [], []); return sheets[n]; }
  };
}

let book;
function makeRule(values, allowInvalid) {
  return {
    getCriteriaType: () => 'VALUE_IN_LIST',
    getCriteriaValues: () => [values],
    getAllowInvalid: () => allowInvalid
  };
}

const ctx = {
  console,
  SpreadsheetApp: {
    openById: () => book,
    DataValidationCriteria: { VALUE_IN_LIST: 'VALUE_IN_LIST' },
    newDataValidation() {
      let values = [], allowInvalid = true;
      const builder = {
        requireValueInList(v) { values = v; return builder; },
        setAllowInvalid(a) { allowInvalid = a; return builder; },
        build: () => makeRule(values, allowInvalid)
      };
      return builder;
    }
  }
};
vm.createContext(ctx);
const src = fs.readFileSync(require('path').join(__dirname, '..', '..', 'apps-script',
  'tools', 'importSchoolHealthForms.gs'), 'utf8');
vm.runInContext(src + `
this.previewSchoolHealthImport = previewSchoolHealthImport;
this.importSchoolHealthForms = importSchoolHealthForms;
this.QUESTIONS = QUESTIONS; this.SERVICE_TYPES = SERVICE_TYPES;
this.AGE_MIGRATION = AGE_MIGRATION; this.CONSENT_ITEMS = CONSENT_ITEMS;
this.CORE_FIELD_MAP = CORE_FIELD_MAP; this.RETIRED_QUESTIONS = RETIRED_QUESTIONS;
`, ctx, { filename: 'importer.gs' });

let pass = 0, fail = 0;
const check = (n, c, x) => c
  ? (pass++, console.log('  ok   ' + n))
  : (fail++, console.log('  FAIL ' + n + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')));

// Live-shaped starting workbook.
// Column E's real rule from the live sheet - note it has no `scored`.
const LIVE_TYPES = ['text', 'text_area', 'date', 'radio_yes_no', 'radio_custom', 'single_select', 'multi_select', 'signature', 'insurance'];

function freshBook() {
  const book = makeBook({
    'Forms': makeSheet('Forms', ['FormID', 'Form Name'],
      [['pedvax25', 'CPS Vaccination Screening 2025-26'], ['schlphys26', 'IL School Physical Screening']]),
    'Form Questions': makeSheet('Form Questions',
      ['FormID', 'QuestionID', 'DisplayOrder', 'QuestionText', 'QuestionType', 'Options', 'IsRequired', 'TriggerID', 'TriggerValue'],
      [['pedvax25', 'pedvax25-1', 1, 'Existing question', 'radio_yes_no', '', 'N', '', ''],
       ['c2e4d150', 'c2e4d150-37', 37, 'Anything to add?', 'text_area', '', 'N', '@age', '0-12'],
       ['c2e4d150', 'c2e4d150-41', 41, 'Thoughts of harming yourself?', 'radio_yes_no', 'Yes|No', 'N', '@age', dateCell('12-18')],
       ['c2e4d150', 'c2e4d150-40', 40, 'Edited since', 'single_select', '', 'N', '@age', '12-17']]),
    // Column E carries the live sheet's value-in-list rule, which has no
    // `scored` in it - the rule that stopped the real import part way.

    'Service Types': makeSheet('Service Types',
      ['ServiceTypeID', 'Service Name', 'Intake Form', 'AppSheet Form View', 'ConsentIDs', 'Age Eligibility', 'Gender Eligibility', 'Active'],
      [
        ['VAXADMIN', 'IL School Required and Recommended Vaccinations', 'pedvax25', 'x', 'init0002', '0-12, 12-18', '', 'TRUE'],
        ['PHYSICAL', 'IL State School Physical', 'schlphys26', 'x', 'init0002', '0-12, 12-18', '', 'TRUE'],
        // Held as a date, as on the live sheet: Sheets parsed the lone "12-18".
        ['SPRTPHYS', 'IHSA Sports Physical', 'sprtphys26', 'x', 'init0002', dateCell('12-18'), '', 'TRUE'],
        ['LEADTEST', 'Lead Testing ONLY (no school physical)', '', '', '', '0-12', '', 'TRUE'],
        ['HIV12HCV', 'HIV and Hepatitis C Testing', '99be5397 , 6f25fcaa', '', 'init0002', '12-18, 18+', '', 'TRUE'],
        ['ENMMINOR', 'Health Check-Up (Minor)', '99be5397', '', 'init0002', '0-12, 12-18', '', 'TRUE'],
        ['ENMADULT', 'Health Check-Up (Adult)', '99be5397', '', 'init0002', '18+', '', 'TRUE'],
      ]),
    'Consent Blocks': makeSheet('Consent Blocks',
      ['ConsentID', 'Consent Name', 'ConsentHTML', 'DisplayOrder'],
      [['init0002', 'Standard consent', '<p>old</p>', 10]]),
  });
  book.sheets['Form Questions']._dv = makeRule(LIVE_TYPES, false);
  return book;
}

console.log('\n1. preview writes nothing');
book = freshBook();
const before = JSON.stringify(book.sheets);
ctx.previewSchoolHealthImport();
check('workbook untouched by preview', JSON.stringify(book.sheets) === before);
check('preview does not create Consent Items', !book.sheets['Consent Items']);

console.log('\n2. import loads every row');
book = freshBook();
ctx.importSchoolHealthForms();
const fq = book.sheets['Form Questions'].data;
check('326 new question rows appended (4 seeded)', fq.length === 1 + 4 + 326, fq.length);
check('pre-existing question untouched', fq[1][1] === 'pedvax25-1');
check('Consent Items created with 19 rows', book.sheets['Consent Items'].data.length === 20,
  book.sheets['Consent Items'] && book.sheets['Consent Items'].data.length);
check('Core Field Map created with 167 rows', book.sheets['Core Field Map'].data.length === 168,
  book.sheets['Core Field Map'] && book.sheets['Core Field Map'].data.length);
check('5 new services appended', book.sheets['Service Types'].data.length === 1 + 7 + 5,
  book.sheets['Service Types'].data.length);

console.log('\n3. age bands migrated exactly');
const st = book.sheets['Service Types'].data;
const ageOf = id => (st.find(r => r[0] === id) || [])[5];
check('VAXADMIN -> 0-3,4-11,12-17', ageOf('VAXADMIN') === '0-3,4-11,12-17', ageOf('VAXADMIN'));
check('SPRTPHYS -> 12-17 though the cell held a date', ageOf('SPRTPHYS') === '12-17', String(ageOf('SPRTPHYS')));
check('LEADTEST -> 0-3,4-11', ageOf('LEADTEST') === '0-3,4-11', ageOf('LEADTEST'));
check('Age Eligibility forced to text before writing',
  Object.keys(book.sheets['Service Types'].__formats || {}).some(k => /:6$/.test(k)));
check('HIV12HCV -> 12-17,18+', ageOf('HIV12HCV') === '12-17,18+', ageOf('HIV12HCV'));
check('ENMADULT 18+ left alone', ageOf('ENMADULT') === '18+', ageOf('ENMADULT'));

console.log('\n4. re-running updates in place, never duplicates');
ctx.importSchoolHealthForms();
check('still 326 question rows', book.sheets['Form Questions'].data.length === 1 + 4 + 326,
  book.sheets['Form Questions'].data.length);
check('still 19 consent items', book.sheets['Consent Items'].data.length === 20);
check('still 12 services', book.sheets['Service Types'].data.length === 13);
check('age band stays migrated', ageOf('VAXADMIN') === '0-3,4-11,12-17');

console.log('\n5. a hand-edited age value is refused, not clobbered');
book = freshBook();
book.sheets['Service Types'].data[1][5] = '0-12';   // someone narrowed VAXADMIN
const report = ctx.importSchoolHealthForms();
check('VAXADMIN left as the human set it',
  book.sheets['Service Types'].data[1][5] === '0-12', book.sheets['Service Types'].data[1][5]);
check('report says SKIPPED', /VAXADMIN: SKIPPED/.test(report));
check('the other services still migrated',
  book.sheets['Service Types'].data[3][5] === '12-17');

console.log('\n6. the wrong workbook is refused before anything is written');
// Exactly what happened live: a book with none of the booking sheets. Two of
// the targets create themselves when absent, so the refusal has to come first.
book = makeBook({
  'Campaigns': makeSheet('Campaigns', ['CampaignID', 'Campaign Name'], [[1, 'Outbreak']]),
  'Events': makeSheet('Events', ['CampaignID', 'Type'], [[1, 'LTC Outbreak Testing']]),
  'Facilities': makeSheet('Facilities', ['Facility Name'], [['PHL Office']]),
}, 'Campaigns, Events, Facilities');
const r6 = ctx.importSchoolHealthForms();
check('refuses and says so', /WRONG WORKBOOK - nothing written/.test(r6), r6.slice(0, 60));
check('names what is missing', /Forms, Form Questions, Service Types, Consent Blocks/.test(r6));
check('names the book it opened', /Campaigns, Events, Facilities/.test(r6));
check('did NOT create Consent Items', !book.sheets['Consent Items']);
check('did NOT create Core Field Map', !book.sheets['Core Field Map']);
check('touched nothing at all', Object.keys(book.sheets).length === 3);

console.log('\n6b. one missing sheet in an otherwise right workbook also refuses');
book = freshBook();
delete book.sheets['Form Questions'];
const r6b = ctx.importSchoolHealthForms();
check('refuses on a partial workbook', /WRONG WORKBOOK/.test(r6b));
check('did not invent a Form Questions sheet', !book.sheets['Form Questions']);

console.log('\n6c. the QuestionType rule is widened before the rows land');
book = freshBook();
const dvPreview = ctx.previewSchoolHealthImport();
check('preview says it would add scored', /would add scored/.test(dvPreview));
check('preview did not change the rule',
  book.sheets['Form Questions']._dv.getCriteriaValues()[0].indexOf('scored') === -1);
ctx.importSchoolHealthForms();
const dvNow = book.sheets['Form Questions']._dv.getCriteriaValues()[0];
check('scored added to the rule', dvNow.indexOf('scored') !== -1, dvNow);
check('every existing type kept', LIVE_TYPES.every(t => dvNow.indexOf(t) !== -1));
check('radio_custom survives untouched', dvNow.indexOf('radio_custom') !== -1);
check('all 326 rows landed', book.sheets['Form Questions'].data.length === 1 + 4 + 326,
  book.sheets['Form Questions'].data.length);
const dvAgain = ctx.importSchoolHealthForms();
check('re-run finds nothing to widen', /already accepts every type used/.test(dvAgain));

console.log('\n6d. the Section column is added, and a clash refuses');
book = freshBook();
const secPreview = ctx.previewSchoolHealthImport();
check('preview says it would add the header', /would add the header/.test(secPreview));
check('preview left column 10 empty',
  !(book.sheets['Form Questions'].data[0][9]));
ctx.importSchoolHealthForms();
check('Section header written', book.sheets['Form Questions'].data[0][9] === 'Section',
  book.sheets['Form Questions'].data[0][9]);
const anyRow = book.sheets['Form Questions'].data.find(r => r[1] === 'shccore-1');
check('rows carry a section', typeof anyRow[9] === 'string' && anyRow[9].length > 0, anyRow[9]);
check('the 9 original columns are unmoved',
  book.sheets['Form Questions'].data[0].slice(0, 9).join(',') ===
  'FormID,QuestionID,DisplayOrder,QuestionText,QuestionType,Options,IsRequired,TriggerID,TriggerValue');

book = freshBook();
book.sheets['Form Questions'].data[0][9] = 'Notes';
const clash = ctx.importSchoolHealthForms();
check('a foreign column 10 refuses', /UNEXPECTED COLUMN - nothing written/.test(clash));
check('and did not overwrite it', book.sheets['Form Questions'].data[0][9] === 'Notes');
check('and wrote no rows', book.sheets['Form Questions'].data.length === 5,
  book.sheets['Form Questions'].data.length);

console.log('\n6e. stale @age triggers are restated, edited ones left alone');
book = freshBook();
const trigPreview = ctx.previewSchoolHealthImport();
check('preview names the change', /c2e4d150-41 "12-18" -> "12-17"/.test(trigPreview),
  (trigPreview.match(/Question @age triggers:.*/) || [''])[0].slice(0, 120));
const untouched = book.sheets['Form Questions'].data.find(r => r[1] === 'c2e4d150-41')[8];
check('preview changed nothing', untouched instanceof Date,
  'expected the date cell to be left as it was');
ctx.importSchoolHealthForms();
const triggerRows = book.sheets['Form Questions'].data;
const at = id => triggerRows.find(r => r[1] === id);
check('0-12 restated', at('c2e4d150-37')[8] === '0-3|4-11', at('c2e4d150-37')[8]);
check('12-18 restated on the self-harm row even though the cell held a date',
  at('c2e4d150-41')[8] === '12-17', String(at('c2e4d150-41')[8]));
check('and the cell was forced to text first',
  Object.values(book.sheets['Form Questions'].__formats || {}).includes('@'));
check('an already-current value is left alone', at('c2e4d150-40')[8] === '12-17');
check('the row text was not touched', at('c2e4d150-41')[3] === 'Thoughts of harming yourself?');

book = freshBook();
book.sheets['Form Questions'].data.find(r => r[1] === 'c2e4d150-37')[8] = '0-3';
const edited = ctx.importSchoolHealthForms();
check('a hand-edited trigger is skipped and named', /c2e4d150-37 SKIPPED/.test(edited));
check('and left as the human set it',
  book.sheets['Form Questions'].data.find(r => r[1] === 'c2e4d150-37')[8] === '0-3');

console.log('\n7. edits to the generator correct the sheet');
book = freshBook();
ctx.importSchoolHealthForms();
const row = book.sheets['Form Questions'].data.find(r => r[1] === 'shccore-1');
row[3] = 'STALE TEXT';
ctx.importSchoolHealthForms();
const fixed = book.sheets['Form Questions'].data.find(r => r[1] === 'shccore-1');
check('stale text overwritten', fixed[3] !== 'STALE TEXT', fixed[3]);

console.log('\n8. retired staff-only questions are deleted, not just left behind');
check('generator no longer emits them',
  !ctx.QUESTIONS.some(r => ctx.RETIRED_QUESTIONS.includes(r[1])) &&
  !ctx.CORE_FIELD_MAP.some(r => ctx.RETIRED_QUESTIONS.includes(r[0])));
book = freshBook();
book.sheets['Form Questions'].data.push(
  ['shccore', 'shccore-48', 480, 'Phone interview: Prism staff name', 'text', '', 'N', '@age', '0-3|4-11|12-17', 'x'],
  ['shccore', 'shccore-49', 490, 'Parent read-back confirmed (staff initials)', 'text', '', 'N', '', '', 'x']);
book.sheets['Core Field Map'] = makeSheet('Core Field Map', ['QuestionID', 'FormID', 'Paper field ID'],
  [['shccore-48', 'shc0411', '9.3'], ['shccore-49', 'shc0411', '9.4']]);
const r8 = ctx.previewSchoolHealthImport();
check('preview names what it would remove',
  /Form Questions would remove 2; Core Field Map would remove 2/.test(r8));
check('preview removed nothing',
  book.sheets['Form Questions'].data.some(r => r[1] === 'shccore-48'));
ctx.importSchoolHealthForms();
check('gone from Form Questions',
  !book.sheets['Form Questions'].data.some(r => ctx.RETIRED_QUESTIONS.includes(r[1])));
check('gone from Core Field Map',
  !book.sheets['Core Field Map'].data.some(r => ctx.RETIRED_QUESTIONS.includes(r[0])));
check('nothing else lost', book.sheets['Form Questions'].data.length === 1 + 4 + 326,
  book.sheets['Form Questions'].data.length);

console.log('\n9. Core Field Map upserts on QuestionID and FormID together');
book = freshBook();
ctx.importSchoolHealthForms();
const cfm = book.sheets['Core Field Map'].data;
const [q0, f0, p0] = ctx.CORE_FIELD_MAP[0];
const sibling = ctx.CORE_FIELD_MAP.find(r => r[0] === q0 && r[1] !== f0);
cfm.find(r => r[0] === q0 && r[1] === f0)[2] = 'STALE';
ctx.importSchoolHealthForms();
check('a stale printed id is corrected', cfm.find(r => r[0] === q0 && r[1] === f0)[2] === p0,
  cfm.find(r => r[0] === q0 && r[1] === f0));
check('its sibling on another form untouched',
  !sibling || cfm.find(r => r[0] === q0 && r[1] === sibling[1])[2] === sibling[2]);
check('every mapping present exactly once',
  ctx.CORE_FIELD_MAP.every(m => cfm.filter(r => r[0] === m[0] && r[1] === m[1]).length === 1));
check('no rows added', cfm.length === 1 + ctx.CORE_FIELD_MAP.length, cfm.length);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
