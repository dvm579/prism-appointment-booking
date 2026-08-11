/**
 * PRISM Mobile Health Screening Questionnaire — Pediatric. FormID `c2e4d150`.
 *
 * Required by ENMMINOR (under 18). Section 8 splits on age: `c2e4d150-34`
 * through `-37` are gated on the `0-12` band and `-38` through `-41` on
 * `12-18`, so exactly one of the two blocks is ever answered. The other stays
 * blank, which matches the printed form's "Y" and "T" sections.
 *
 * Run `listTokensForC2e4d150()` from the editor to print every placeholder.
 */

const MHQP_TEMPLATE_ID = 'REPLACE_WITH_SLIDES_TEMPLATE_ID';
const MHQP_OUTPUT_FOLDER_ID = '1gdwPfu9kRXZi8Lht-yX3OkaSJhmsKDCD';
const MHQP_DRIVE_PATH = 'Completed Forms/Wellness on Wheels/';

// Option lists must match the sheet's `Options` exactly once trimmed.
const MHQP_REASON = [
  'Well-child check-up', 'Shots / immunizations', 'Sick or a specific concern',
  'School / sports form'
];
const MHQP_HISTORY = [
  'Asthma or breathing problems', 'Diabetes', 'Frequent ear infections',
  'A developmental or learning concern', 'Allergies (food / medicine / other)',
  'Vision or hearing problem', 'Heart condition', 'Eczema or skin conditions',
  'Born premature / NICU stay', 'A mental or behavioral health condition',
  'Seizures', 'A substance use problem', 'None of these'
];
const MHQP_FAMILY = [
  'Asthma or allergies', 'Diabetes', 'Heart disease', 'High blood pressure',
  'A mental health condition', 'A substance use problem',
  'Sickle cell or blood disorder', 'None / not sure'
];
const MHQP_NO_YES_NOT_SURE = ['No', 'Yes', 'Not sure'];
const MHQP_NO_YES_SOMETIMES = ['No', 'Yes', 'Sometimes'];
const MHQP_NO_YES_PREFER = ['No', 'Yes', 'Prefer not to say'];
const MHQP_DEVELOPMENT = ['No concerns', 'A few concerns', "Yes - I'd like to talk about it"];
const MHQP_SHOTS_CURRENT = ['No', 'Yes', 'Not sure', "We don't vaccinate"];
const MHQP_SHOT_RECORD = [
  'Yes - on paper', 'Yes - on phone or app', 'No', "It's with another clinic"
];
const MHQP_SMOKE_VAPE = ['No', 'Yes', 'Not in the home but around the child'];
const MHQP_HOUSING = ['No', 'Yes', "We're worried about it"];
const MHQP_EMOTIONAL = ['Doing well', 'Some ups and downs', 'I have concerns'];
const MHQP_SLEEP_EATING = ['Fine', 'Some issues', 'I have concerns'];

/** Shared PHQ-2 / GAD-2 frequency scale used by the teen block. */
const MHQP_FREQUENCY = [
  'Not at all', 'Several days', 'More than half the days', 'Nearly every day'
];

/**
 * The printed coverage list, and what the sign-up form's insurance answer maps
 * onto. `c2e4d150-4` is an `insurance`-type row and writes no response of its
 * own, so the category comes from `99be5397-5` — ENMMINOR requires both forms.
 *
 * "Medicaid health plan" and "CHIP / All Kids" are finer-grained than anything
 * collected online and stay blank for staff to tick.
 */
const MHQP_COVERAGE = [
  'Medicaid', 'Medicaid health plan', 'CHIP / All Kids', 'No insurance', 'Other'
];
const MHQP_COVERAGE_FROM_SIGNUP = {
  'medicaid': 'Medicaid',
  'none / uninsured': 'No insurance',
  'private insurance': 'Other',
  'medicare': 'Other'
};

function mobileHealthPediatricMap_(data, info) {
  const answers = createAnswerMap(data);
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM-dd-yyyy');

  const coverage = MHQP_COVERAGE_FROM_SIGNUP[
    String(answers['99be5397-5'] || '').trim().toLowerCase()
  ] || '';

  return mergeTokens_(
    {
      // Header, repeated on all three pages of the printed form.
      '%mhqp.name%': fullName(data),
      '%mhqp.dob%': get(data, 'demographics.dob', ''),
      '%mhqp.date%': dateStr,
      '%mhqp.dos%': get(info, 'ds', ''),
      '%mhqp.facility%': get(info, 'fname', ''),
      '%mhqp.patient_id%': get(info, 'pid', ''),
      '%mhqp.appointment_id%': get(info, 'aid', ''),

      // 2. Parent / guardian completing this form
      '%mhqp.parent_name%': get(data, 'demographics.parentName', ''),
      '%mhqp.parent_relationship%': get(data, 'demographics.parentRel', ''),
      '%mhqp.parent_cell%': get(data, 'demographics.parentContact', '') || bestPhone(data),
      '%mhqp.parent_email%': get(data, 'demographics.email', ''),
      '%mhqp.other_guardian%': answers['c2e4d150-3'] || '',

      // 3. Your child's coverage
      '%mhqp.plan_name%': get(data, 'insurance.primaryIns', ''),
      '%mhqp.payer%': get(data, 'insurance.primaryPayer', ''),
      '%mhqp.member_id%': get(data, 'insurance.primaryId', ''),
      '%mhqp.group%': get(data, 'insurance.primaryGroup', ''),
      // Not collected online; the card holder is assumed to be the guardian.
      '%mhqp.card_name%': '',
      '%mhqp.card_relationship%': '',

      // 4. Your child's health history
      '%mhqp.history_detail%': answers['c2e4d150-6'] || '',
      '%mhqp.medications%': answers['c2e4d150-7'] || '',
      '%mhqp.allergies%': answers['c2e4d150-8'] || '',
      '%mhqp.surgeries%': answers['c2e4d150-9'] || '',

      // 5. Birth & development
      '%mhqp.birth_problems_detail%': answers['c2e4d150-13'] || '',
      '%mhqp.development_detail%': answers['c2e4d150-15'] || '',

      // 6. Shots / immunizations
      '%mhqp.shot_record_clinic%': answers['c2e4d150-18'] || '',
      '%mhqp.shot_record_city_state%': answers['c2e4d150-19'] || '',
      '%mhqp.shots_needed%': answers['c2e4d150-20'] || '',
      '%mhqp.vaccine_reaction_detail%': answers['c2e4d150-22'] || '',

      // 7. Family health history
      '%mhqp.family_detail%': answers['c2e4d150-24'] || '',
      '%mhqp.household%': answers['c2e4d150-26'] || '',

      // 8. Questions about your visit — under 12
      '%mhqp.provider_note%': answers['c2e4d150-37'] || '',

      '%mhqp.other%': answers['c2e4d150-42'] || ''
    },

    // 1. What brings your child in today
    checkboxTokens_('mhqp.reason', MHQP_REASON, answers['c2e4d150-1']),

    // 2. Parent / guardian
    yesNoTokens_('mhqp.is_guardian', answers['c2e4d150-2']),
    yesNoTokens_('mhqp.text_ok', get(data, 'consentTexts', false) ? 'Yes' : 'No'),

    // 3. Coverage
    checkboxTokens_('mhqp.coverage', MHQP_COVERAGE, coverage),

    // 4. Health history
    checkboxTokens_('mhqp.history', MHQP_HISTORY, answers['c2e4d150-5']),
    checkboxTokens_('mhqp.regular_doctor', MHQP_NO_YES_NOT_SURE, answers['c2e4d150-10']),

    // 5. Birth & development
    checkboxTokens_('mhqp.born_early', MHQP_NO_YES_NOT_SURE, answers['c2e4d150-11']),
    checkboxTokens_('mhqp.birth_problems', MHQP_NO_YES_NOT_SURE, answers['c2e4d150-12']),
    checkboxTokens_('mhqp.development', MHQP_DEVELOPMENT, answers['c2e4d150-14']),

    // 6. Shots / immunizations
    checkboxTokens_('mhqp.shots_current', MHQP_SHOTS_CURRENT, answers['c2e4d150-16']),
    checkboxTokens_('mhqp.shot_record', MHQP_SHOT_RECORD, answers['c2e4d150-17']),
    checkboxTokens_('mhqp.vaccine_reaction', MHQP_NO_YES_NOT_SURE, answers['c2e4d150-21']),

    // 7. Family health history
    checkboxTokens_('mhqp.family', MHQP_FAMILY, answers['c2e4d150-23']),

    // Health-related social needs
    checkboxTokens_('mhqp.smoke_vape', MHQP_SMOKE_VAPE, answers['c2e4d150-25']),
    yesNoTokens_('mhqp.housing_worry', answers['c2e4d150-27']),
    checkboxTokens_('mhqp.stable_housing', MHQP_HOUSING, answers['c2e4d150-28']),
    checkboxTokens_('mhqp.food', MHQP_NO_YES_SOMETIMES, answers['c2e4d150-29']),
    yesNoTokens_('mhqp.transport', answers['c2e4d150-30']),
    yesNoTokens_('mhqp.utilities', answers['c2e4d150-31']),
    checkboxTokens_('mhqp.feel_safe', MHQP_NO_YES_PREFER, answers['c2e4d150-32']),

    // 8. Under 12 — the parent answers
    checkboxTokens_('mhqp.emotional', MHQP_EMOTIONAL, answers['c2e4d150-34']),
    yesNoTokens_('mhqp.home_changes', answers['c2e4d150-35']),
    checkboxTokens_('mhqp.sleep_eating', MHQP_SLEEP_EATING, answers['c2e4d150-36']),

    // 8. Teens 12-17 — the patient answers
    checkboxTokens_('mhqp.phq_down', MHQP_FREQUENCY, answers['c2e4d150-38']),
    checkboxTokens_('mhqp.phq_interest', MHQP_FREQUENCY, answers['c2e4d150-39']),
    checkboxTokens_('mhqp.gad_nervous', MHQP_FREQUENCY, answers['c2e4d150-40']),
    yesNoTokens_('mhqp.self_harm', answers['c2e4d150-41']),

    // Marks the form so the reviewer does not have to find it among three pages
    // of boxes.
    flagToken_(
      '%mhqp.self_harm_alert%',
      String(answers['c2e4d150-41'] || '').trim().toLowerCase() === 'yes'
    )
  );
}

function generateMobileHealthPediatricPDF(data, sigBlob, info) {
  const map = mobileHealthPediatricMap_(data, info);

  const pdf = renderTemplateToPdf_({
    templateId: MHQP_TEMPLATE_ID,
    map: map,
    // The questionnaire is not a consent document and has no signature line.
    // The token is honoured in case one is added to the template.
    images: { '%mhqp.signature%': sigBlob },
    folderId: MHQP_OUTPUT_FOLDER_ID,
    filename: pdfFileName_(data, 'MobileHealthScreeningPediatric', info.ds)
  });

  logAttachment_({
    data: data,
    info: info,
    formId: 'c2e4d150',
    description: 'Mobile Health Screening Questionnaire - Minor',
    path: MHQP_DRIVE_PATH + pdf.getName()
  });
}

/** Prints every placeholder this form needs. Run from the Apps Script editor. */
function listTokensForC2e4d150() {
  return logTokenList_(mobileHealthPediatricMap_({}, {}));
}
