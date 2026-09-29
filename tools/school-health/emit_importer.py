# -*- coding: utf-8 -*-
"""Emit the Apps Script that loads the School Health rows into the workbook."""
import io, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
here = lambda n: os.path.join(HERE, n)
# The importer is a tracked artefact; write it straight to where it lives.
TARGET = os.path.join(HERE, '..', '..', 'apps-script', 'tools',
                      'importSchoolHealthForms.gs')
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

q = json.load(open(here('questions_out.json'), encoding='utf-8'))
s = json.load(open(here('sheets_out.json'), encoding='utf-8'))
mapping = json.load(open(here('core_mapping.json'), encoding='utf-8'))

j = lambda v: json.dumps(v, ensure_ascii=False)


def rows(items):
    return ',\n'.join('  ' + j(list(r)) for r in items)


QUESTION_ROWS = [[r['FormID'], r['QuestionID'], r['DisplayOrder'], r['QuestionText'],
                  r['QuestionType'], r['Options'], r['IsRequired'],
                  r['TriggerID'], r['TriggerValue'], r['Section']] for r in q]

TEMPLATE = '''/**
 * One-off loader for the School Health Clinic Program forms.
 *
 * Writes Forms, Form Questions, Service Types, Consent Blocks and the new
 * Consent Items into the scheduling workbook, and restates the existing Age
 * Eligibility values in the four new age bands.
 *
 * Every write is an upsert keyed by the row's own id, so running this twice
 * updates in place rather than duplicating. Run `previewSchoolHealthImport()`
 * first: it reports exactly what would change and writes nothing.
 *
 * Generated from the Data Dictionary - do not hand-edit the tables below.
 */

/**
 * The "Events Management" workbook - the one the registration page reads.
 *
 * Not "Campaigns, Events, Facilities", which has its own unrelated Events
 * sheet from the LTC outbreak work and none of the booking sheets.
 */
var WORKBOOK_ID = '__WORKBOOK__';

/**
 * Sheets that must already exist for this to be the right workbook.
 *
 * Checked before anything is written. Two of the targets below create
 * themselves when absent, so without this check pointing at the wrong
 * spreadsheet does not fail cleanly - it leaves a Consent Items and a Core
 * Field Map behind in whatever book you opened while everything else reports
 * MISSING.
 */
var REQUIRED_SHEETS = ['Forms', 'Form Questions', 'Service Types', 'Consent Blocks'];

/** 1-based QuestionType column on Form Questions. */
var QUESTION_TYPE_COL = 5;

/**
 * Form Questions gained a tenth column, Section, which is what the page steps
 * through. It is appended rather than inserted, so every existing column keeps
 * its position and anything reading them by index is unaffected.
 */
var SECTION_COL = 10;
var QUESTION_WIDTH = 10;

/**
 * Age bands changed from {0-12, 12-18, 18+} to {0-3, 4-11, 12-17, 18+}.
 *
 * The mapping is exact - 0-12 is {0-3, 4-11} and 12-18 is 12-17 - so no
 * patient's eligibility changes. It must ship together with the matching
 * AGE_BANDS change in src/patient.js, or the page will compute a band the
 * sheet does not use and every gated service will disappear.
 */
var AGE_MIGRATION = [
__AGEMIG__
];

/**
 * `@age` triggers left behind by the old band vocabulary.
 *
 * The band change restated Age Eligibility on Service Types but not the `@age`
 * triggers inside Form Questions, so these eight rows on the WOW pediatric form
 * were left asking for bands `ageBand()` no longer returns - which hid them
 * outright, including the teen self-harm question.
 *
 * QuestionID, the value expected there, the value it should be.
 */
var TRIGGER_MIGRATION = [
  ['c2e4d150-34', '0-12', '0-3|4-11'],
  ['c2e4d150-35', '0-12', '0-3|4-11'],
  ['c2e4d150-36', '0-12', '0-3|4-11'],
  ['c2e4d150-37', '0-12', '0-3|4-11'],
  ['c2e4d150-38', '12-18', '12-17'],
  ['c2e4d150-39', '12-18', '12-17'],
  ['c2e4d150-40', '12-18', '12-17'],
  ['c2e4d150-41', '12-18', '12-17']
];

var FORMS = [
__FORMS__
];

var SERVICE_TYPES = [
__SERVICES__
];

var CONSENT_BLOCK = __CONSENTBLOCK__;

/** ConsentID, Section, Section Title, ItemID, Label, Note Label, DisplayOrder */
var CONSENT_ITEMS = [
__CONSENTITEMS__
];

/**
 * QuestionID, and the field id printed on each paper form.
 *
 * The shared core asks each question once, but the printed forms number them
 * differently (A3.1 on the 0-3 form is A2.1 on the 12-17 form). The document
 * generators need this to fill the right box on the right sheet.
 */
var CORE_FIELD_MAP = [
__MAPPING__
];

/** FormID, QuestionID, DisplayOrder, Text, Type, Options, Required, TriggerID, TriggerValue, Section */
var QUESTIONS = [
__QUESTIONS__
];

// ---------------------------------------------------------------------------

function previewSchoolHealthImport() {
  return runImport_(true);
}

function importSchoolHealthForms() {
  return runImport_(false);
}

function runImport_(dryRun) {
  var book = SpreadsheetApp.openById(WORKBOOK_ID);

  var present = book.getSheets().map(function (sheet) { return sheet.getName(); });
  var missing = REQUIRED_SHEETS.filter(function (name) { return present.indexOf(name) === -1; });
  if (missing.length) {
    var refusal = 'WRONG WORKBOOK - nothing written.\\n\\n' +
      '"' + book.getName() + '" is missing: ' + missing.join(', ') + '\\n' +
      'It contains: ' + present.join(', ') + '\\n\\n' +
      'Point WORKBOOK_ID at the spreadsheet the registration page reads.';
    console.error(refusal);
    return refusal;
  }

  var section = ensureSectionColumn_(book, dryRun);
  if (section.error) {
    console.error(section.error);
    return section.error;
  }

  var log = ['Workbook: ' + book.getName(), '', section.note];

  log.push(upsert_(book, 'Forms', FORMS, 0, 2, dryRun));
  log.push(allowQuestionTypes_(book, dryRun));
  log.push(upsert_(book, 'Form Questions', QUESTIONS, 1, QUESTION_WIDTH, dryRun));
  log.push(upsert_(book, 'Service Types', SERVICE_TYPES, 0, 8, dryRun));
  log.push(upsert_(book, 'Consent Blocks', [CONSENT_BLOCK], 0, 4, dryRun));
  log.push(upsertConsentItems_(book, dryRun));
  log.push(upsert_(book, 'Core Field Map', CORE_FIELD_MAP, 1, 3, dryRun,
                   ['QuestionID', 'FormID', 'Paper field ID']));
  log.push(migrateAgeBands_(book, dryRun));
  log.push(migrateQuestionAgeTriggers_(book, dryRun));

  var report = (dryRun ? 'PREVIEW - nothing written\\n\\n' : 'IMPORT COMPLETE\\n\\n') + log.join('\\n');
  console.log(report);
  return report;
}

/**
 * Makes sure Form Questions column 10 is the Section column.
 *
 * Writing a 10-wide row into a sheet whose tenth column already holds something
 * else would overwrite it silently, so an unexpected header stops the import
 * rather than being written over.
 */
function ensureSectionColumn_(book, dryRun) {
  var sheet = book.getSheetByName('Form Questions');
  var header = String(sheet.getRange(1, SECTION_COL).getValue() || '').trim();

  if (header === 'Section') return { note: 'Section column: already present.' };
  if (header) {
    return {
      error: 'UNEXPECTED COLUMN - nothing written. Form Questions column ' +
             SECTION_COL + ' is headed "' + header + '", not "Section". ' +
             'Move it before importing, or the rows would overwrite it.'
    };
  }

  if (dryRun) return { note: 'Section column: would add the header.' };
  sheet.getRange(1, SECTION_COL).setValue('Section');
  return { note: 'Section column: header added.' };
}

/**
 * Widens the QuestionType column's data validation to accept the types being
 * written.
 *
 * The column carries a value-in-list rule, and `scored` is new, so without this
 * the Form Questions write dies part way through on the first instrument item -
 * Sheets applies a setValues row by row and rejects the offending cell, which
 * leaves the sheet half-loaded.
 *
 * Only ever adds. The existing entries are kept exactly as they are, including
 * ones nothing uses yet.
 */
function allowQuestionTypes_(book, dryRun) {
  var sheet = book.getSheetByName('Form Questions');
  var label = 'QuestionType validation: ';

  var wanted = {};
  QUESTIONS.forEach(function (row) { wanted[row[4]] = true; });

  var rule = sheet.getRange(2, QUESTION_TYPE_COL).getDataValidation();
  if (!rule) return label + 'no rule set, nothing to widen.';
  if (rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    return label + 'not a value-in-list rule, left alone.';
  }

  var allowed = rule.getCriteriaValues()[0];
  var missing = Object.keys(wanted).filter(function (type) {
    return allowed.indexOf(type) === -1;
  });
  if (!missing.length) return label + 'already accepts every type used.';
  if (dryRun) return label + 'would add ' + missing.join(', ');

  var widened = SpreadsheetApp.newDataValidation()
    .requireValueInList(allowed.concat(missing), true)
    .setAllowInvalid(rule.getAllowInvalid())
    .build();
  sheet.getRange(2, QUESTION_TYPE_COL, Math.max(sheet.getMaxRows() - 1, 1))
    .setDataValidation(widened);
  return label + 'added ' + missing.join(', ');
}

/**
 * Writes rows into a sheet, matching on the column that holds the row's id.
 *
 * Existing rows are overwritten in place and new ones appended, so a re-run
 * after an edit to the generator corrects the sheet instead of doubling it.
 */
function upsert_(book, sheetName, rows, keyCol, width, dryRun, headerIfMissing) {
  var sheet = book.getSheetByName(sheetName);
  if (!sheet) {
    if (!headerIfMissing) {
      return sheetName + ': MISSING - create it first, nothing written.';
    }
    if (dryRun) return sheetName + ': would be created with ' + rows.length + ' row(s).';
    sheet = book.insertSheet(sheetName);
    sheet.appendRow(headerIfMissing);
  }

  var last = sheet.getLastRow();
  var existing = last > 1 ? sheet.getRange(2, 1, last - 1, width).getValues() : [];
  var rowOf = {};
  existing.forEach(function (r, i) {
    var k = String(r[keyCol]).trim();
    if (k) rowOf[k] = i + 2;
  });

  var updates = 0, inserts = 0, appended = [];
  rows.forEach(function (row) {
    var key = String(row[keyCol]).trim();
    if (rowOf[key]) {
      updates++;
      if (!dryRun) sheet.getRange(rowOf[key], 1, 1, width).setValues([pad_(row, width)]);
    } else {
      inserts++;
      appended.push(pad_(row, width));
    }
  });

  if (!dryRun && appended.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appended.length, width).setValues(appended);
  }
  return sheetName + ': ' + inserts + ' new, ' + updates + ' updated.';
}

function pad_(row, width) {
  var out = row.slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

/**
 * Consent Items is keyed by ConsentID + ItemID rather than one column, so it
 * cannot use `upsert_`.
 */
function upsertConsentItems_(book, dryRun) {
  var name = 'Consent Items';
  var header = ['ConsentID', 'Section', 'Section Title', 'ItemID', 'Item Label',
                'Note Label', 'DisplayOrder'];
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    if (dryRun) return name + ': would be created with ' + CONSENT_ITEMS.length + ' row(s).';
    sheet = book.insertSheet(name);
    sheet.appendRow(header);
  }

  var last = sheet.getLastRow();
  var existing = last > 1 ? sheet.getRange(2, 1, last - 1, header.length).getValues() : [];
  var rowOf = {};
  existing.forEach(function (r, i) {
    rowOf[String(r[0]).trim() + '\\u0000' + String(r[3]).trim()] = i + 2;
  });

  var updates = 0, appended = [];
  CONSENT_ITEMS.forEach(function (row) {
    var key = String(row[0]).trim() + '\\u0000' + String(row[3]).trim();
    if (rowOf[key]) {
      updates++;
      if (!dryRun) sheet.getRange(rowOf[key], 1, 1, header.length).setValues([row]);
    } else {
      appended.push(row);
    }
  });
  if (!dryRun && appended.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appended.length, header.length).setValues(appended);
  }
  return name + ': ' + appended.length + ' new, ' + updates + ' updated.';
}

/**
 * Restates the stale `@age` trigger values named in TRIGGER_MIGRATION.
 *
 * Guarded the same way as the Service Types migration: a value that is not the
 * one expected has been edited since, so it is named and left alone.
 */
function migrateQuestionAgeTriggers_(book, dryRun) {
  var sheet = book.getSheetByName('Form Questions');
  var last = sheet.getLastRow();
  if (last < 2) return 'Question @age triggers: no rows.';

  // Display values, not raw ones. Sheets reads "12-18" as December 18 and
  // stores a date behind a MM-DD format, so getValues() hands back a Date whose
  // string form matches nothing - which is why the 0-12 rows migrated and the
  // 12-18 rows did not. What the sheet shows is what the published CSV carries
  // and what this is comparing against.
  var shown = sheet.getRange(2, 1, last - 1, QUESTION_WIDTH).getDisplayValues();
  var index = {};
  shown.forEach(function (row, i) { index[String(row[1]).trim()] = i; });

  var notes = [];
  TRIGGER_MIGRATION.forEach(function (m) {
    var id = m[0], expected = m[1], replacement = m[2];
    if (!(id in index)) { notes.push(id + ' not found'); return; }

    var at = index[id];
    var current = String(shown[at][8]).trim();
    if (current === replacement) { notes.push(id + ' already done'); return; }
    if (current !== expected) {
      notes.push(id + ' SKIPPED (found "' + current + '")');
      return;
    }

    notes.push(id + ' "' + current + '" -> "' + replacement + '"');
    if (!dryRun) {
      // Plain text first, or "12-17" is read as December 17 and the cell ends
      // up holding another date rather than the range it is meant to hold.
      var cell = sheet.getRange(at + 2, 9);
      cell.setNumberFormat('@');
      cell.setValue(replacement);
    }
  });

  return 'Question @age triggers: ' + notes.join('; ');
}

/** Restates Age Eligibility on the existing services in the new bands. */
function migrateAgeBands_(book, dryRun) {
  var sheet = book.getSheetByName('Service Types');
  if (!sheet) return 'Age bands: Service Types missing, nothing written.';

  var last = sheet.getLastRow();
  if (last < 2) return 'Age bands: no rows.';
  // Display values, for the same reason as the @age triggers: SPRTPHYS's lone
  // "12-18" is stored as December 18, and its Date never matched "12-18".
  var values = sheet.getRange(2, 1, last - 1, 8).getDisplayValues();

  var notes = [];
  AGE_MIGRATION.forEach(function (m) {
    var id = m[0], expected = m[1], replacement = m[2];
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim() !== id) continue;

      var current = String(values[i][5]).trim();
      if (current === replacement) {
        notes.push('  ' + id + ': already migrated.');
      } else if (normalise_(current) !== normalise_(expected)) {
        // Someone edited it since this was generated; leave it alone and say so.
        notes.push('  ' + id + ': SKIPPED - expected "' + expected + '" but found "' +
                   current + '".');
      } else {
        notes.push('  ' + id + ': "' + current + '" -> "' + replacement + '"');
        if (!dryRun) {
          // Text first, or "12-17" goes in as December 17.
          var cell = sheet.getRange(i + 2, 6);
          cell.setNumberFormat('@');
          cell.setValue(replacement);
        }
      }
      return;
    }
    notes.push('  ' + id + ': not found.');
  });
  return 'Age bands:\\n' + notes.join('\\n');
}

function normalise_(value) {
  return String(value).split(',').map(function (s) { return s.trim(); })
    .filter(String).sort().join(',');
}
'''

out = (TEMPLATE
       .replace('__WORKBOOK__', '17226ud6cLY7gbLyv0IS_3k1mylHeWuoHHKyr96hoy1I')
       .replace('__AGEMIG__', rows(s['ageMigration']))
       .replace('__FORMS__', rows(s['forms']))
       .replace('__SERVICES__', rows(s['serviceTypes']))
       .replace('__CONSENTBLOCK__', j(list(s['consentBlock'])))
       .replace('__CONSENTITEMS__', rows(s['consentItems']))
       .replace('__MAPPING__', rows(mapping))
       .replace('__QUESTIONS__', rows(QUESTION_ROWS)))

io.open(TARGET, 'w', encoding='utf-8', newline='\n').write(out)
print('wrote', os.path.normpath(TARGET), '-', len(out), 'chars')
print('  questions   ', len(QUESTION_ROWS))
print('  forms       ', len(s['forms']))
print('  services    ', len(s['serviceTypes']))
print('  consentItems', len(s['consentItems']))
print('  field map   ', len(mapping))
