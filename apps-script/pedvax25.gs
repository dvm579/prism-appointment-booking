function generatePedVax25PDF(data, sigBlob, info) {
  // 1. TEMPLATE ID: Change this for each new form type
  const TEMPLATE_ID = "1iH0I4E4z8a_HSwqKPONudh7duSEHTIhTv9_2i2IshBQ";


  // 2. PREPARE ANSWERS
  // This creates a clean map so you can just do answers['pedvax25-1']
  const answers = createAnswerMap(data);

  var presFile = DriveApp.getFileById(TEMPLATE_ID).makeCopy();
  var pres = SlidesApp.openById(presFile.getId());
  var slides = pres.getSlides();


  // 3. DEFINE CUSTOM CHECKBOX RULES
  var SPACES_YN_NO   = 10;  // Yes: "X", No: 10 spaces + "X" for formResponses
  var SPACES_GENDER_F = 11; // Female: 11 spaces + "X"
  var SPACES_GENDER_O = 22; // Other : 22 spaces + "X"
  var SPACES_INS_NO   = 23; // yn_insurance "no": 23 spaces + "X"

  // yn_insurance: primaryIns exists & not blank -> "X", else 23 spaces + "X"
  function ynInsurance(d) {
    var v = get(d, 'insurance.primaryIns', '');
    return hasVal(v) ? 'X' : spaces(SPACES_INS_NO) + 'X';
  }

  // gender: Male -> "X"; Female -> 11 sp + "X"; Other -> 22 sp + "X"
  function genderValue(d) {
    var g = String(get(d, 'demographics.gender', '') || '').toLowerCase();
    if (g === 'male' || g === 'm') return 'X';
    if (g === 'female' || g === 'f') return spaces(SPACES_GENDER_F) + 'X';
    return spaces(SPACES_GENDER_O) + 'X';
  }

  // s1..s13: Yes -> "X"; No -> 10 sp + "X"; else ''
  function screeningMark(val) {
    var s = (val == null) ? '' : String(val).toLowerCase();
    if (s === 'yes' || s === 'y' || s === 'true') return 'X';
    if (s === 'no'  || s === 'n' || s === 'false') return spaces(SPACES_YN_NO) + 'X';
    return '';
  }

  function vaxSelection(selection) {
    var selectedList = selection.split(', ');
    var row1 = "x" + spaces(28) + "x";
    var row2 = "x";
    var row3 = "x";
    var row4 = "x" + spaces(28) + "x";
    var row5 = "x";
    var row6 = "x";
    var row7 = "x";
    if (!selectedList.includes("School Required Immunizations")) {
      rowList.forEach(r => r.replace("x", "  "));
    }
    if (selectedList.includes("HPV Vaccine")) {
      row2 += spaces(28) + "x"
    }
    if (selectedList.includes("COVID-19 Vaccine")) {
      row6 += spaces(28) + "x"
    }
    if (selectedList.includes("Influenza Vaccine")) {
      row5 += spaces(28) + "x"
    }
    return [row1, row2, row3, row4, row5, row6, row7].join("\n")
  }


  // 4. DEFINE REPLACEMENTS
  // Map your Slide Placeholders (Keys) to your Data (Values).
  // Use general helper functions and specific ones from above to transform form submission values into PDF field values.
  var map = {
    // --- Standard Demographics ---
    '%name%':             fullName(data),
    '%dob%':              get(data, 'demographics.dob', ''),
    '%address%':          bestAddress(data),
    '%phone%':            bestPhone(data),
    '%city%':             get(data, 'demographics.city', ''),
    '%state%':            get(data, 'demographics.state', ''),
    '%zip%':              get(data, 'demographics.zip', ''),
    '%gender%':           genderValue(data),
    '%parent_phone%':     get(data, 'demographics.parentContact', ''),
    '%parent_email%':     get(data, 'demographics.email', ''),
    '%yn_insurance%':     ynInsurance(data),
    '%insurance_type%':   get(data, 'insurance.primaryIns', ''),
    '%insurance_id%':     get(data, 'insurance.primaryId', ''),
    '%insurance_group%':  get(data, 'insurance.primaryGroup', ''),

    // --- Signature & Date---
    '%signature_name%':   get(data, 'demographics.parentName', '') || fullName(data),
    '%date%':             Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM-dd-yyyy"),

    // --- Dynamic Form Questions (Using the ID from your CSV) ---
    '%pedvax25-1%':       screeningMark(answers['pedvax25-1']) || '',
    '%pedvax25-2%':       screeningMark(answers['pedvax25-2']) || '',
    '%pedvax25-3%':       screeningMark(answers['pedvax25-3']) || '',
    '%pedvax25-4%':       screeningMark(answers['pedvax25-4']) || '',
    '%pedvax25-5%':       screeningMark(answers['pedvax25-5']) || '',
    '%pedvax25-6%':       screeningMark(answers['pedvax25-6']) || '',
    '%pedvax25-7%':       screeningMark(answers['pedvax25-7']) || '',
    '%pedvax25-8%':       screeningMark(answers['pedvax25-8']) || '',
    '%pedvax25-9%':       screeningMark(answers['pedvax25-9']) || '',
    '%pedvax25-10%':      answers['pedvax25-10'] || '',
    '%pedvax25-11%':      screeningMark(answers['pedvax25-11']) || '',
    '%pedvax25-12%':      screeningMark(answers['pedvax25-12']) || '',
    '%pedvax25-13%':      screeningMark(answers['pedvax25-13']) || '',
    '%pedvax25-14%':      screeningMark(answers['pedvax25-14']) || '',
    '%pedvax25-15%':      vaxSelection(answers['pedvax25-15'])
  }


  // 5. MAKE REPLACEMENTS ON TEMPLATE
  // ------------------ Pass 1: replace %signature% SHAPES with image ------------------
  // We only replace TEXT BOX shapes that contain %signature%.
  slides.forEach(function(slide) {
    slide.getShapes().forEach(function(shape) {
      try {
        if (typeof shape.getText === 'function') {
          var tr = shape.getText();
          if (tr && tr.asString().indexOf('%signature%') !== -1) {
            if (sigBlob) {
              var left = shape.getLeft();
              var top = shape.getTop();
              var width = shape.getWidth();
              var height = shape.getHeight();
              slide.insertImage(sigBlob, left, top, width, height);
              shape.remove();
            } else {
              // If no blob provided, just clear the token
              tr.replaceAllText('%signature%', '');
            }
          }
        }
      } catch (e) {
        // ignore odd shapes; per your preference no verbose error handling
      }
    });
  });

  // ------------------ Pass 2: replace all text placeholders everywhere ------------------
  slides.forEach(function(slide) {
    // Replace inside text box/placeholder shapes
    slide.getShapes().forEach(function(shape) {
      try {
        if (typeof shape.getText === 'function') {
          var tr = shape.getText();
          if (!tr) return;
          var s = tr.asString();
          Object.keys(map).forEach(function(ph) {
            if (s.indexOf(ph) !== -1) {
              tr.replaceAllText(ph, String(map[ph]));
            }
          });
        }

        // Replace inside tables (cell-by-cell)
        if (typeof shape.getTable === 'function') {
          var tbl = shape.getTable();
          if (tbl) {
            for (var r = 0; r < tbl.getNumRows(); r++) {
              for (var c = 0; c < tbl.getNumColumns(); c++) {
                var cell = tbl.getCell(r, c);
                if (!cell) continue;
                var ctr = cell.getText();
                if (!ctr) continue;
                var cs = ctr.asString();
                Object.keys(map).forEach(function(ph) {
                  if (cs.indexOf(ph) !== -1) {
                    ctr.replaceAllText(ph, String(map[ph]));
                  }
                });
              }
            }
          }
        }
      } catch (e) {
        console.log(e.message) // ignore and continue
      }
    });
  });


  // 6. SAVE, EXPORT TO PDF, AND UPLOAD TO EMR
  pres.saveAndClose();
  const outputFolder = DriveApp.getFolderById("1gdwPfu9kRXZi8Lht-yX3OkaSJhmsKDCD");
  const safeName = (map['%name%'] || 'Patient').replace(/\s+/g,'').replace(/[\\/:*?"<>|]+/g,'');
  const filename = safeName + '_VaccinationConsent_' + map['%date%'].replace("-", "") + '.pdf';
  const pdfBlob = presFile.getAs('application/pdf').setName(filename);
  const pdf = outputFolder.createFile(pdfBlob);
  presFile.setTrashed(true);

  // 7. NEW: LOG TO VACCINE ADMINISTRATIONS (Moved from Code.gs)
  const vaxAdminSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Vaccine Administrations");

  // We need to find the specific ServiceID created for this form
  // info.serviceMap was passed through the job object in the refactored Code.gs
  const currentServiceID = info.serviceMap ? info.serviceMap['pedvax25'] : "MANUAL_ENTRY";

  vaxAdminSheet.appendRow([
      currentServiceID,
      info.aid,
      info.fid,
      "",
      info.fname,
      info.pid,
      data.demographics.firstName,
      data.demographics.lastName,
      data.demographics.dob,
      info.ds,,
      info.sigUrl // Link to signature image
  ]);

  // 8. LOG TO ATTACHMENTS
  SpreadsheetApp.openById("1CX9GiID58srjCcrB_QH2RNgzMYtYSKFbfTmxKPwYeLs").getSheetByName('Attachments').appendRow([
    info.pid, info.aid, currentServiceID, Utilities.getUuid(), new Date(), info.fname,
    data.firstName, data.lastName, data.dob, info.ds,
    "Vaccination Consent", "File",,,,,,('Completed Forms/Vaccination 2025/' + pdf.getName()),
  ]);
}
