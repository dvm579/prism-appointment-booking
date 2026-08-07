/**
 * Wellness on Wheels (WOW) Participant Sign-Up — FormID `99be5397`.
 *
 * Required by VITALCHK, HIV12HCV, ENMADULT and ENMMINOR, so most WOW
 * registrations produce one of these. The "Items Dispensed" grid is office-use
 * and is deliberately left blank for staff to fill in on the truck.
 *
 * Run `listTokensFor99be5397()` from the editor to print every placeholder this
 * generator produces, then build the Slides template from that list.
 */

// Slides deck used as the template. Create it before enabling this generator.
const WOWSU_TEMPLATE_ID = 'REPLACE_WITH_SLIDES_TEMPLATE_ID';

// Where the finished PDF lands, and the path recorded on the Attachments row.
const WOWSU_OUTPUT_FOLDER_ID = '1gdwPfu9kRXZi8Lht-yX3OkaSJhmsKDCD';
const WOWSU_DRIVE_PATH = 'Completed Forms/Wellness on Wheels/';

// Option lists must match the sheet's `Options` exactly once trimmed — that is
// what the patient's answer is drawn from.
const WOWSU_SEX = ['Female', 'Male', 'Intersex', 'Decline to Answer', 'Other'];
const WOWSU_ORIENTATION = [
  'Straight / Heterosexual', 'Gay', 'Lesbian', 'Queer', 'Bi-Sexual',
  'Questioning and/or unsure', 'Other'
];
const WOWSU_GENDER = [
  'Female', 'Male', 'Non-binary / Gender non-conforming', 'Transgender Man',
  'Transgender Woman', 'Two-Spirit', 'Decline to Answer', 'Other'
];
const WOWSU_DISABILITIES = [
  'Blind / Visually Impaired', 'Deaf / Hard of Hearing', 'Medical Disability',
  'Physical Disability', 'None', 'Other'
];
const WOWSU_INSURANCE = ['Medicare', 'Medicaid', 'Private Insurance', 'None / Uninsured'];

/** Builds the placeholder map. Split out so the token list can be printed. */
function wowSignupMap_(data, info) {
  const answers = createAnswerMap(data);
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM-dd-yyyy');

  return mergeTokens_(
    {
      '%wowsu.name%': fullName(data),
      '%wowsu.dob%': get(data, 'demographics.dob', ''),
      '%wowsu.date%': dateStr,
      // Office-use header, handy when a printed form is filed loose.
      '%wowsu.patient_id%': get(info, 'pid', ''),
      '%wowsu.appointment_id%': get(info, 'aid', ''),
      '%wowsu.facility%': get(info, 'fname', ''),
      '%wowsu.dos%': get(info, 'ds', ''),
      // Free-text write-in lines next to each "Other" box. Nothing collects
      // these today; the tokens exist so the template does not print a stray
      // placeholder if one is added later.
      '%wowsu.orientation.other_text%': '',
      '%wowsu.gender.other_text%': '',
      '%wowsu.disability.other_text%': '',
      '%wowsu.insurance.other_text%': ''
    },
    checkboxTokens_('wowsu.sex', WOWSU_SEX, answers['99be5397-1']),
    checkboxTokens_('wowsu.orientation', WOWSU_ORIENTATION, answers['99be5397-2']),
    checkboxTokens_('wowsu.gender', WOWSU_GENDER, answers['99be5397-3']),
    checkboxTokens_('wowsu.disability', WOWSU_DISABILITIES, answers['99be5397-4']),
    checkboxTokens_('wowsu.insurance', WOWSU_INSURANCE, answers['99be5397-5'])
  );
}

function generateWowSignupPDF(data, sigBlob, info) {
  const map = wowSignupMap_(data, info);
  const serviceId = serviceIdFor_(info, '99be5397');

  const pdf = renderTemplateToPdf_({
    templateId: WOWSU_TEMPLATE_ID,
    map: map,
    // The printed sheet has no signature line. The token is honoured anyway so
    // adding one to the template is a template-only change.
    images: { '%wowsu.signature%': sigBlob },
    folderId: WOWSU_OUTPUT_FOLDER_ID,
    filename: pdfFileName_(data, 'WOWSignUp', info.ds)
  });

  logAttachment_({
    data: data,
    info: info,
    serviceId: serviceId,
    description: 'WOW Participant Sign-Up',
    path: WOWSU_DRIVE_PATH + pdf.getName()
  });
}

/** Prints every placeholder this form needs. Run from the Apps Script editor. */
function listTokensFor99be5397() {
  return logTokenList_(wowSignupMap_({}, {}));
}
