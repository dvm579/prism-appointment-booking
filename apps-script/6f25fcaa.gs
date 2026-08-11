/**
 * Wellness on Wheels (WOW) Testing Consent — FormID `6f25fcaa`.
 *
 * Required by VITALCHK, HIV12HCV, ENMADULT and ENMMINOR. Page 2 of the printed
 * form is the office-use results sheet (vitals, CardioChek, rapid HIV/HCV); it
 * is rendered blank apart from the patient header, because those values are
 * recorded on the truck rather than at registration.
 *
 * Run `listTokensFor6f25fcaa()` from the editor to print every placeholder.
 */

const WOWTC_TEMPLATE_ID = 'REPLACE_WITH_SLIDES_TEMPLATE_ID';
const WOWTC_OUTPUT_FOLDER_ID = '1gdwPfu9kRXZi8Lht-yX3OkaSJhmsKDCD';
const WOWTC_DRIVE_PATH = 'Completed Forms/Wellness on Wheels/';

const WOWTC_LANGUAGES = ['English', 'Spanish', 'Polish', 'Mandarin', 'Arabic', 'Other'];
const WOWTC_TEST_RESULTS = ['Negative', 'Positive', "I don't know"];
const WOWTC_DECLINES = [
  'HIV Testing', 'HCV Testing', 'Sharing results with my PCP',
  'HPV Vaccination (if indicated)', 'COVID-19 Vaccination (if indicated)',
  'Flu Vaccination (if indicated)'
];

/**
 * Prior-test questions are Yes/No online but the printed form also has an
 * "Unsure" box. It is listed so the template has a token for every box it
 * prints; nothing sets it today.
 */
const WOWTC_PRIOR_TEST = ['Yes', 'No', 'Unsure'];

/**
 * The printed coverage list, and what the sign-up form's insurance answer maps
 * onto. `6f25fcaa-3` is an `insurance`-type row, so it writes no response of its
 * own — the structured details arrive in `data.insurance` and the coverage
 * category comes from `99be5397-5`, which every service requiring this consent
 * also collects.
 *
 * "VA / TriCare" and "Prefer not to say" have no online equivalent, so they stay
 * blank for staff to tick.
 */
const WOWTC_COVERAGE = [
  'Medicaid / CHIP', 'Medicare', 'Private insurance', 'VA / TriCare',
  'Uninsured or unknown', 'Prefer not to say'
];
const WOWTC_COVERAGE_FROM_SIGNUP = {
  'medicaid': 'Medicaid / CHIP',
  'medicare': 'Medicare',
  'private insurance': 'Private insurance',
  'none / uninsured': 'Uninsured or unknown'
};

/** The consent sections the patient initials, A through G. */
const WOWTC_CONSENT_SECTIONS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

/**
 * Initials stamped against each consent section.
 *
 * The web form replaces seven separate initial lines with one certification
 * checkbox covering the whole block, so either every section is initialled or
 * none is. An unticked box leaves them blank rather than guessing.
 */
function wowtcInitials_(data) {
  if (!get(data, 'vaxConsent', false)) return '';

  const first = String(get(data, 'demographics.firstName', '')).trim();
  const last = String(get(data, 'demographics.lastName', '')).trim();
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

function wowTestingConsentMap_(data, info) {
  const answers = createAnswerMap(data);
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM-dd-yyyy');
  const initials = wowtcInitials_(data);

  const initialTokens = {};
  WOWTC_CONSENT_SECTIONS.forEach(function (section) {
    initialTokens['%wowtc.initials.' + section + '%'] = initials;
  });

  const coverage = WOWTC_COVERAGE_FROM_SIGNUP[
    String(answers['99be5397-5'] || '').trim().toLowerCase()
  ] || '';

  return mergeTokens_(
    {
      // 1. About you
      '%wowtc.first_name%': get(data, 'demographics.firstName', ''),
      '%wowtc.last_name%': get(data, 'demographics.lastName', ''),
      '%wowtc.name%': fullName(data),
      '%wowtc.dob%': get(data, 'demographics.dob', ''),
      '%wowtc.street%': get(data, 'demographics.street', ''),
      '%wowtc.city%': get(data, 'demographics.city', ''),
      '%wowtc.state%': get(data, 'demographics.state', ''),
      '%wowtc.zip%': get(data, 'demographics.zip', ''),
      '%wowtc.address%': bestAddress(data),
      '%wowtc.cell%': bestPhone(data),
      '%wowtc.email%': get(data, 'demographics.email', ''),

      // 2. Coverage. Subscriber details are not collected online.
      '%wowtc.plan_name%': get(data, 'insurance.primaryIns', ''),
      '%wowtc.payer%': get(data, 'insurance.primaryPayer', ''),
      '%wowtc.member_id%': get(data, 'insurance.primaryId', ''),
      '%wowtc.group%': get(data, 'insurance.primaryGroup', ''),
      '%wowtc.subscriber_name%': '',
      '%wowtc.subscriber_dob%': '',
      '%wowtc.subscriber_relationship%': '',

      // 5. Signatures
      '%wowtc.patient_name_print%': fullName(data),
      '%wowtc.guardian_name_print%': get(data, 'demographics.parentName', ''),
      '%wowtc.guardian_relationship%': get(data, 'demographics.parentRel', ''),
      '%wowtc.date%': dateStr,

      // Office-use header on page 2.
      '%wowtc.dos%': get(info, 'ds', ''),
      '%wowtc.facility%': get(info, 'fname', ''),
      '%wowtc.patient_id%': get(info, 'pid', ''),
      '%wowtc.appointment_id%': get(info, 'aid', '')
    },
    checkboxTokens_('wowtc.language', WOWTC_LANGUAGES, answers['6f25fcaa-1']),
    yesNoTokens_('wowtc.interpreter', answers['6f25fcaa-2']),
    yesNoTokens_('wowtc.text_ok', get(data, 'consentTexts', false) ? 'Yes' : 'No'),
    checkboxTokens_('wowtc.coverage', WOWTC_COVERAGE, coverage),
    checkboxTokens_('wowtc.hiv_prior', WOWTC_PRIOR_TEST, answers['6f25fcaa-4']),
    checkboxTokens_('wowtc.hiv_result', WOWTC_TEST_RESULTS, answers['6f25fcaa-5']),
    checkboxTokens_('wowtc.hcv_prior', WOWTC_PRIOR_TEST, answers['6f25fcaa-6']),
    checkboxTokens_('wowtc.hcv_result', WOWTC_TEST_RESULTS, answers['6f25fcaa-7']),
    checkboxTokens_('wowtc.declines', WOWTC_DECLINES, answers['6f25fcaa-8']),
    initialTokens
  );
}

function generateWowTestingConsentPDF(data, sigBlob, info) {
  const map = wowTestingConsentMap_(data, info);

  // `6f25fcaa-9` collects a pad of its own. Fall back to the consent signature:
  // both attest to the same block, and a payload trimmed of its signature array
  // must still produce a signed form.
  const patientSignature = answerSignatureBlob_(data, '6f25fcaa-9') || sigBlob;

  const pdf = renderTemplateToPdf_({
    templateId: WOWTC_TEMPLATE_ID,
    map: map,
    images: {
      '%wowtc.signature.patient%': patientSignature,
      // No guardian pad exists online, so this token is always cleared. It
      // stays here so the printed guardian line renders empty rather than
      // showing the placeholder.
      '%wowtc.signature.guardian%': null
    },
    folderId: WOWTC_OUTPUT_FOLDER_ID,
    filename: pdfFileName_(data, 'WOWTestingConsent', info.ds)
  });

  logAttachment_({
    data: data,
    info: info,
    formId: '6f25fcaa',
    description: 'WOW Testing Consent',
    path: WOWTC_DRIVE_PATH + pdf.getName()
  });
}

/** Prints every placeholder this form needs. Run from the Apps Script editor. */
function listTokensFor6f25fcaa() {
  return logTokenList_(wowTestingConsentMap_({}, {}));
}
