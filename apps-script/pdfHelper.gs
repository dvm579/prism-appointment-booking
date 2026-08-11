function hasVal(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

function spaces(n) { return new Array(n + 1).join(' '); }

function get(obj, path, dflt) {
  if (!obj || !path) return dflt;
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return dflt;
    cur = cur[parts[i]];
  }
  return (cur === undefined || cur === null) ? dflt : cur;
}

function fullName(d) {
  var f = get(d, 'demographics.firstName', '');
  var m = get(d, 'demographics.middleName', '');
  var l = get(d, 'demographics.lastName', '');
  return [f, m, l].filter(function(s){ return hasVal(s); }).join(' ');
}

function bestPhone(d) {
  var PHONE_FALLBACKS = ['demographics.cell', 'demographics.home', 'demographics.parentContact'];
  for (var i = 0; i < PHONE_FALLBACKS.length; i++) {
    var v = get(d, PHONE_FALLBACKS[i], '');
    if (hasVal(v)) return v;
  }
  return '';
}

function bestAddress(d) {
  var fa = get(d, 'fullAddress', '');
  if (hasVal(fa)) return fa;
  var street = get(d, 'demographics.street', '');
  var city   = get(d, 'demographics.city', '');
  var state  = get(d, 'demographics.state', '');
  var zip    = get(d, 'demographics.zip', '');
  var line1 = [street].filter(hasVal).join('');
  var line2 = [city, state].filter(hasVal).join(', ');
  var line = [line1, [line2, zip].filter(hasVal).join(' ')].filter(hasVal).join(', ');
  return line;
}

// --- Checkbox tokens --------------------------------------------------------

/**
 * The placeholder for one checkbox: `%prefix.slug%`.
 *
 * One token per option, rather than the older `spaces(n) + 'X'` trick. That
 * trick only lands the mark in the right column while the template's font,
 * size and column widths stay exactly as they were, and it fails silently —
 * the X just sits somewhere wrong on a form nobody re-reads. A token per box
 * is verbose in the template and impossible to misplace.
 */
function optionToken_(prefix, option) {
  var slug = String(option)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return '%' + prefix + '.' + slug + '%';
}

/**
 * One token per option, set to 'X' for the options the patient chose.
 *
 * Handles single_select (one value) and multi_select (values joined with ', ')
 * with the same code — the frontend trims every option, and Options may not
 * contain a comma, so splitting on comma is exact rather than best-effort.
 *
 * @param {string} prefix   Token namespace, e.g. 'wowsu.sex'.
 * @param {Array<string>} options  Must match the sheet's Options after trimming.
 * @param {string} answer   The raw answer from the response map.
 * @return {Object} token -> 'X' or ''.
 */
function checkboxTokens_(prefix, options, answer) {
  var chosen = {};
  String(answer == null ? '' : answer).split(',').forEach(function (part) {
    var value = part.trim().toLowerCase();
    if (value) chosen[value] = true;
  });

  var tokens = {};
  options.forEach(function (option) {
    tokens[optionToken_(prefix, option)] = chosen[String(option).trim().toLowerCase()] ? 'X' : '';
  });
  return tokens;
}

/** `checkboxTokens_` for a radio_yes_no question: `%prefix.yes%` / `%prefix.no%`. */
function yesNoTokens_(prefix, answer) {
  return checkboxTokens_(prefix, ['Yes', 'No'], answer);
}

/** A single 'X'/'' token, for a lone checkbox driven by a boolean. */
function flagToken_(token, on) {
  var tokens = {};
  tokens[token] = on ? 'X' : '';
  return tokens;
}

/** Merges token objects left to right into one replacement map. */
function mergeTokens_() {
  var merged = {};
  for (var i = 0; i < arguments.length; i++) {
    var group = arguments[i];
    if (!group) continue;
    Object.keys(group).forEach(function (key) { merged[key] = group[key]; });
  }
  return merged;
}

/**
 * Logs every placeholder a generator produces, so the Slides template can be
 * built from the real list instead of a hand-copied one.
 *
 * Each form file exposes a `listTokensFor…()` wrapper you can run straight from
 * the editor.
 */
function logTokenList_(map) {
  var tokens = Object.keys(map).sort();
  console.log('%s placeholders:\n%s', tokens.length, tokens.join('\n'));
  return tokens;
}

// --- Signatures -------------------------------------------------------------

/**
 * The image a `signature` question collected, as a Blob.
 *
 * Read from the submission payload rather than from Drive: `writeFormResponses_`
 * swaps the Drive URL into the *response row*, not into `data.formResponses`, so
 * the answer the generator sees is still a bare "Yes".
 *
 * @return {Blob|null} null when that question collected nothing.
 */
function answerSignatureBlob_(data, questionId) {
  var signatures = get(data, 'additionalSignatures', []) || [];
  for (var i = 0; i < signatures.length; i++) {
    if (String(signatures[i].questionId) !== String(questionId)) continue;

    var raw = String(signatures[i].data == null ? '' : signatures[i].data);
    var comma = raw.indexOf(',');
    if (comma === -1) return null;

    return Utilities.newBlob(
      Utilities.base64Decode(raw.slice(comma + 1)), 'image/png', questionId + '.png'
    );
  }
  return null;
}

// --- Slides rendering -------------------------------------------------------

function replaceInTextRange_(textRange, map) {
  if (!textRange) return;
  var text = textRange.asString();
  if (!text) return;

  // Only call through for tokens this range actually holds. Each
  // `replaceAllText` is a round trip, and a form of this size has well over a
  // hundred tokens.
  Object.keys(map).forEach(function (token) {
    if (text.indexOf(token) !== -1) textRange.replaceAllText(token, String(map[token]));
  });
}

function replaceInTable_(table, map) {
  for (var r = 0; r < table.getNumRows(); r++) {
    for (var c = 0; c < table.getNumColumns(); c++) {
      var cell = table.getCell(r, c);
      if (cell) replaceInTextRange_(cell.getText(), map);
    }
  }
}

/**
 * Shapes, tables and nested groups of one slide — or of one group.
 *
 * Slide and Group expose the same accessors, which is what lets this recurse.
 * The old per-shape `shape.getTable()` guard never fired: Shape has no such
 * method, so table cells were quietly never filled in.
 */
function replaceInContainer_(container, map) {
  container.getShapes().forEach(function (shape) {
    if (typeof shape.getText === 'function') replaceInTextRange_(shape.getText(), map);
  });
  container.getTables().forEach(function (table) { replaceInTable_(table, map); });
  container.getGroups().forEach(function (group) { replaceInContainer_(group, map); });
}

/**
 * Swaps image tokens for their image, sized and positioned to the shape they
 * replace.
 *
 * Top-level slide shapes only. A signature placeholder must therefore be a
 * plain text box, not a table cell or a grouped shape — grouped coordinates
 * would need unwinding for no benefit, and a signature inside a table cell
 * cannot be sized to the cell anyway.
 */
function replaceImageTokens_(slide, images) {
  var tokens = Object.keys(images);
  if (!tokens.length) return;

  slide.getShapes().forEach(function (shape) {
    if (typeof shape.getText !== 'function') return;
    var textRange = shape.getText();
    if (!textRange) return;
    var text = textRange.asString();

    for (var i = 0; i < tokens.length; i++) {
      if (text.indexOf(tokens[i]) === -1) continue;

      var blob = images[tokens[i]];
      if (blob) {
        slide.insertImage(blob, shape.getLeft(), shape.getTop(), shape.getWidth(), shape.getHeight());
        shape.remove();
        // The shape is gone; anything else it held is gone with it.
        return;
      }
      textRange.replaceAllText(tokens[i], '');
      text = textRange.asString();
    }
  });
}

/**
 * Fills a Slides template and exports it as a PDF.
 *
 * @param {Object} spec
 * @param {string} spec.templateId  Slides file to copy. Never modified.
 * @param {Object} spec.map         Placeholder -> replacement text.
 * @param {Object} [spec.images]    Placeholder -> Blob. A null value clears the
 *                                  token instead, which is what an unsigned
 *                                  form needs.
 * @param {string} spec.folderId    Destination folder for the PDF.
 * @param {string} spec.filename    Name for the PDF.
 * @return {File} the PDF in Drive.
 */
function renderTemplateToPdf_(spec) {
  var copy = DriveApp.getFileById(spec.templateId).makeCopy();

  try {
    var presentation = SlidesApp.openById(copy.getId());
    var images = spec.images || {};

    presentation.getSlides().forEach(function (slide) {
      // Images first: the pass below would otherwise blank the very token the
      // image pass is looking for.
      replaceImageTokens_(slide, images);
      replaceInContainer_(slide, spec.map);
    });
    presentation.saveAndClose();

    var pdf = DriveApp.getFolderById(spec.folderId).createFile(
      copy.getAs('application/pdf').setName(spec.filename)
    );
    return pdf;
  } finally {
    // Runs even if Slides throws, so a failed render does not leave a copy of
    // the blank template lying in My Drive.
    copy.setTrashed(true);
  }
}

/** `LastFirst_Label_MMddyyyy.pdf`, with anything Drive dislikes stripped out. */
function pdfFileName_(data, label, dateStr) {
  var name = [get(data, 'demographics.lastName', ''), get(data, 'demographics.firstName', '')]
    .filter(hasVal)
    .join('');
  var safe = (name || 'Patient').replace(/\s+/g, '').replace(/[\\/:*?"<>|]+/g, '');
  return safe + '_' + label + '_' + String(dateStr || '').replace(/-/g, '') + '.pdf';
}

// --- EMR logging ------------------------------------------------------------

/**
 * Every service rendered that requires the given form.
 *
 * A form shared by several services produces one PDF, but each of those services
 * needs its own Attachments row pointing at it — otherwise clicking into a service
 * in AppSheet shows none of its paperwork.
 *
 * @returns {Array<{serviceId: string, typeId: string, name: string}>}
 */
function servicesForForm_(info, formId) {
  var services = (info && info.services) || [];
  var matches = services.filter(function (service) {
    return (service.formIds || []).some(function (id) {
      return String(id).trim() === String(formId).trim();
    });
  });

  // Older jobs predate info.services and only carry the FormID -> ServiceID map.
  if (!matches.length) {
    var fallback = serviceIdFor_(info, formId);
    return [{ serviceId: fallback, typeId: '', name: '' }];
  }
  return matches;
}

/**
 * Appends the generated document to the EMR's Attachments sheet, once per service
 * that required it.
 *
 * Column order matches what the sheet already holds: the Drive path lands in
 * column 18 and the columns between the file marker and it stay blank.
 *
 * @param {Object} spec
 * @param {Object} spec.data          The submission payload.
 * @param {Object} spec.info          The job's info block.
 * @param {string} [spec.formId]      Form this document was built from. Preferred:
 *                                    one row is written per service using it.
 * @param {string} [spec.serviceId]   Single ServiceID, when there is no formId.
 * @param {string} spec.description   Human-readable document type.
 * @param {string} spec.path          Drive path recorded for the file.
 */
function logAttachment_(spec) {
  var data = spec.data;
  var serviceIds = spec.formId
    ? servicesForForm_(spec.info, spec.formId).map(function (s) { return s.serviceId; })
    : [spec.serviceId];

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Attachments');
  var rows = serviceIds.filter(String).map(function (serviceId) {
    return [
      spec.info.pid,
      spec.info.aid,
      serviceId,
      Utilities.getUuid(),
      new Date(),
      spec.info.fname,
      get(data, 'demographics.firstName', ''),
      get(data, 'demographics.lastName', ''),
      get(data, 'demographics.dob', ''),
      spec.info.ds,
      spec.description,
      'File',
      '', '', '', '', '',
      spec.path
    ];
  });

  if (!rows.length) return;
  // One batched write rather than an appendRow per service.
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

/** The ServiceID a form's answers were attributed to, for the log rows. */
function serviceIdFor_(info, formId) {
  return (info && info.serviceMap && info.serviceMap[formId]) || 'MANUAL_ENTRY';
}