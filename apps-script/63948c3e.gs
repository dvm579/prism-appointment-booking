/**
 * PRISM Mobile Health Screening Questionnaire — Adult. FormID `63948c3e`.
 *
 * Required by ENMADULT (18+). Sections 4 onwards are conditional on the reason
 * for the visit (`63948c3e-1`), so a check-up questionnaire simply leaves the
 * mental-health and pregnancy boxes empty — the hidden questions are never
 * submitted at all.
 *
 * Run `listTokensFor63948c3e()` from the editor to print every placeholder.
 */

const MHQA_TEMPLATE_ID = 'REPLACE_WITH_SLIDES_TEMPLATE_ID';
const MHQA_OUTPUT_FOLDER_ID = '1gdwPfu9kRXZi8Lht-yX3OkaSJhmsKDCD';
const MHQA_DRIVE_PATH = 'Completed Forms/Wellness on Wheels/';

// Option lists must match the sheet's `Options` exactly once trimmed.
const MHQA_REASON = [
  'A check-up / preventive care', 'Mental health or emotional support',
  'Pregnancy or after-baby care'
];
const MHQA_HISTORY = [
  'High blood pressure', 'Diabetes / high blood sugar', 'High cholesterol',
  'Heart disease', 'Stroke or mini-stroke', 'Asthma or COPD', 'Kidney disease',
  'Liver disease or hepatitis', 'Cancer', 'Thyroid problems', 'Seizures', 'HIV',
  'A mental health condition', 'A substance use problem',
  'Pregnancy now or recently', 'None of these'
];
const MHQA_FAMILY = [
  'Heart disease or heart attack', 'High blood pressure', 'Diabetes', 'Stroke',
  'Breast cancer', 'Colon cancer', 'Cervical cancer', 'Other cancer',
  'A mental health condition', 'A substance use problem', 'Kidney disease', 'HIV'
];
const MHQA_NO_YES_PREFER = ['No', 'Yes', 'Prefer not to say'];
const MHQA_NO_YES_SOMETIMES = ['No', 'Yes', 'Sometimes'];
const MHQA_NO_YES_NOT_SURE = ['No', 'Yes', 'Not sure'];
const MHQA_PREGNANCY_POSSIBLE = ['No', 'Yes', 'Not Sure', 'Does not apply'];
const MHQA_HOUSING = ['No', 'Yes', "I'm worried about it"];

/** Shared PHQ-2 / GAD-2 frequency scale. */
const MHQA_FREQUENCY = [
  'Not at all', 'Several days', 'More than half the days', 'Nearly every day'
];

const MHQA_AUDIT_FREQUENCY = [
  'Never', 'Monthly or less', '2-4 times a month', '2-3 times a week', '4+ times a week'
];
const MHQA_AUDIT_QUANTITY = ['1-2', '3-4', '5-6', '7-9', '10+'];
const MHQA_AUDIT_BINGE = ['Never', 'Less than monthly', 'Monthly', 'Weekly', 'Almost daily'];
const MHQA_TOBACCO = ['No', 'Yes', 'I recently quit (within the last year)'];

const MHQA_FALLS = ['No', 'Yes', "I'm under 65"];
const MHQA_COLON = ['No', 'Yes', 'N/A'];
const MHQA_MH_HOSPITAL = ['No', 'Yes - mental health', 'Yes - substance use'];
const MHQA_MH_TREATMENT = ['No', 'Yes', 'I recently stopped'];

const MHQA_PREGNANT_NOW = ['Yes', 'No - I recently had a baby', "Maybe / I'd like a test today"];
const MHQA_PRENATAL = ['Not yet', 'Yes', 'N/A - after baby'];
const MHQA_EPDS_MOOD = ['No / rarely', 'Some of the time', 'Most of the time'];

/** True when either self-harm question came back Yes. */
function mhqaSelfHarmFlagged_(answers) {
  return ['63948c3e-36', '63948c3e-46'].some(function (questionId) {
    return String(answers[questionId] || '').trim().toLowerCase() === 'yes';
  });
}

function mobileHealthAdultMap_(data, info) {
  const answers = createAnswerMap(data);
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM-dd-yyyy');

  return mergeTokens_(
    {
      // Header, repeated on all three pages of the printed form.
      '%mhqa.name%': fullName(data),
      '%mhqa.dob%': get(data, 'demographics.dob', ''),
      '%mhqa.date%': dateStr,
      '%mhqa.dos%': get(info, 'ds', ''),
      '%mhqa.facility%': get(info, 'fname', ''),
      '%mhqa.patient_id%': get(info, 'pid', ''),
      '%mhqa.appointment_id%': get(info, 'aid', ''),

      // 2. Your health history
      '%mhqa.history_detail%': answers['63948c3e-3'] || '',
      '%mhqa.allergies%': answers['63948c3e-4'] || '',
      '%mhqa.medications%': answers['63948c3e-5'] || '',
      '%mhqa.surgeries%': answers['63948c3e-6'] || '',
      '%mhqa.work%': answers['63948c3e-9'] || '',
      '%mhqa.household%': answers['63948c3e-10'] || '',

      // 3. Your family's health
      '%mhqa.family_detail%': answers['63948c3e-26'] || '',

      // 4. Check-up / preventive care
      '%mhqa.last_screening%': answers['63948c3e-29'] || '',
      '%mhqa.last_pap%': answers['63948c3e-30'] || '',
      '%mhqa.last_mammogram%': answers['63948c3e-31'] || '',

      // 4. Mental health or emotional support
      '%mhqa.mh_treatment_where%': answers['63948c3e-35'] || '',

      // 4. Pregnancy or after-baby care
      '%mhqa.due_date%': answers['63948c3e-38'] || '',
      '%mhqa.weeks_pregnant%': answers['63948c3e-39'] || '',
      '%mhqa.delivery_date%': answers['63948c3e-40'] || '',
      '%mhqa.pregnancies%': answers['63948c3e-41'] || '',
      '%mhqa.births%': answers['63948c3e-42'] || '',
      '%mhqa.prenatal_where%': answers['63948c3e-44'] || '',

      '%mhqa.other%': answers['63948c3e-47'] || ''
    },

    // 1. What brings you in today
    checkboxTokens_('mhqa.reason', MHQA_REASON, answers['63948c3e-1']),

    // 2. Your health history
    checkboxTokens_('mhqa.history', MHQA_HISTORY, answers['63948c3e-2']),
    checkboxTokens_('mhqa.nonrx_drugs', MHQA_NO_YES_PREFER, answers['63948c3e-7']),
    checkboxTokens_('mhqa.could_be_pregnant', MHQA_PREGNANCY_POSSIBLE, answers['63948c3e-8']),

    // Health-related social needs
    yesNoTokens_('mhqa.housing_worry', answers['63948c3e-11']),
    checkboxTokens_('mhqa.stable_housing', MHQA_HOUSING, answers['63948c3e-12']),
    checkboxTokens_('mhqa.feel_safe', MHQA_NO_YES_PREFER, answers['63948c3e-13']),
    checkboxTokens_('mhqa.food', MHQA_NO_YES_SOMETIMES, answers['63948c3e-14']),
    checkboxTokens_('mhqa.transport', MHQA_NO_YES_SOMETIMES, answers['63948c3e-15']),
    checkboxTokens_('mhqa.utilities', MHQA_NO_YES_SOMETIMES, answers['63948c3e-16']),

    // Mood, worry, alcohol, tobacco
    checkboxTokens_('mhqa.phq2_interest', MHQA_FREQUENCY, answers['63948c3e-17']),
    checkboxTokens_('mhqa.phq2_down', MHQA_FREQUENCY, answers['63948c3e-18']),
    checkboxTokens_('mhqa.gad2_nervous', MHQA_FREQUENCY, answers['63948c3e-19']),
    checkboxTokens_('mhqa.gad2_worry', MHQA_FREQUENCY, answers['63948c3e-20']),
    checkboxTokens_('mhqa.audit_frequency', MHQA_AUDIT_FREQUENCY, answers['63948c3e-21']),
    checkboxTokens_('mhqa.audit_quantity', MHQA_AUDIT_QUANTITY, answers['63948c3e-22']),
    checkboxTokens_('mhqa.audit_binge', MHQA_AUDIT_BINGE, answers['63948c3e-23']),
    checkboxTokens_('mhqa.tobacco', MHQA_TOBACCO, answers['63948c3e-24']),

    // 3. Your family's health
    checkboxTokens_('mhqa.family', MHQA_FAMILY, answers['63948c3e-25']),

    // 4. Check-up / preventive care
    checkboxTokens_('mhqa.falls', MHQA_FALLS, answers['63948c3e-27']),
    checkboxTokens_('mhqa.regular_doctor', MHQA_NO_YES_NOT_SURE, answers['63948c3e-28']),
    checkboxTokens_('mhqa.colon_screening', MHQA_COLON, answers['63948c3e-32']),

    // 4. Mental health or emotional support
    checkboxTokens_('mhqa.mh_hospital', MHQA_MH_HOSPITAL, answers['63948c3e-33']),
    checkboxTokens_('mhqa.mh_treatment', MHQA_MH_TREATMENT, answers['63948c3e-34']),
    yesNoTokens_('mhqa.self_harm', answers['63948c3e-36']),

    // 4. Pregnancy or after-baby care
    checkboxTokens_('mhqa.pregnant_now', MHQA_PREGNANT_NOW, answers['63948c3e-37']),
    checkboxTokens_('mhqa.prenatal_care', MHQA_PRENATAL, answers['63948c3e-43']),
    checkboxTokens_('mhqa.epds_mood', MHQA_EPDS_MOOD, answers['63948c3e-45']),
    yesNoTokens_('mhqa.epds_self_harm', answers['63948c3e-46']),

    // Either self-harm question answering Yes marks the form, so the reviewer
    // does not have to find it among three pages of boxes.
    flagToken_('%mhqa.self_harm_alert%', mhqaSelfHarmFlagged_(answers))
  );
}

function generateMobileHealthAdultPDF(data, sigBlob, info) {
  const map = mobileHealthAdultMap_(data, info);
  const serviceId = serviceIdFor_(info, '63948c3e');

  const pdf = renderTemplateToPdf_({
    templateId: MHQA_TEMPLATE_ID,
    map: map,
    // The questionnaire is not a consent document and has no signature line.
    // The token is honoured in case one is added to the template.
    images: { '%mhqa.signature%': sigBlob },
    folderId: MHQA_OUTPUT_FOLDER_ID,
    filename: pdfFileName_(data, 'MobileHealthScreeningAdult', info.ds)
  });

  logAttachment_({
    data: data,
    info: info,
    serviceId: serviceId,
    description: 'Mobile Health Screening Questionnaire - Adult',
    path: MHQA_DRIVE_PATH + pdf.getName()
  });
}

/** Prints every placeholder this form needs. Run from the Apps Script editor. */
function listTokensFor63948c3e() {
  return logTokenList_(mobileHealthAdultMap_({}, {}));
}
