// Placeholder maps for the four WOW / mobile health forms: patient answers in,
// `%token%` -> text out. Lifted unchanged from the Apps Script generators
// (apps-script/99be5397.gs, 6f25fcaa.gs, 63948c3e.gs, c2e4d150.gs and the pure
// helpers of pdfHelper.gs), which are retired once this service documents these
// forms. Only the two Apps Script date calls are shimmed, below.
//
// `info` is the job's { pid, aid, fname, ds } block, as the generators expect.
/* eslint-disable */

import { TIME_ZONE } from '../../config.js';

const Session = { getScriptTimeZone: () => TIME_ZONE };
const Utilities = {
    /** The only pattern the generators use is 'MM-dd-yyyy'. */
    formatDate(date, zone, pattern) {
        if (pattern !== 'MM-dd-yyyy') throw new Error('unsupported date pattern ' + pattern);
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
            timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(date).map(x => [x.type, x.value]));
        return p.month + '-' + p.day + '-' + p.year;
    }
};

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
 * Converts the formResponses array into a simple object for easier lookups.
 * Input: [{questionId: 'pedvax25-1', answer: 'Yes'}, ...]
 * Output: {'pedvax25-1': 'Yes', ...}
 */
function createAnswerMap(formData) {
  var map = {};
  if (formData.formResponses && Array.isArray(formData.formResponses)) {
    formData.formResponses.forEach(r => {
      map[r.questionId] = r.answer;
    });
  }
  return map;
}

// --- 99be5397 ------------------------------------------------------------

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

// --- 6f25fcaa ------------------------------------------------------------

const WOWTC_LANGUAGES = ['English', 'Spanish', 'Polish', 'Mandarin', 'Arabic', 'Other'];

const WOWTC_TEST_RESULTS = ['Negative', 'Positive', "I don't know"];

const WOWTC_DECLINES = [
  'HIV Testing', 'HCV Testing', 'Sharing results with my PCP',
  'HPV Vaccination (if indicated)', 'COVID-19 Vaccination (if indicated)',
  'Flu Vaccination (if indicated)'
];

const WOWTC_PRIOR_TEST = ['Yes', 'No', 'Unsure'];

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

// --- 63948c3e ------------------------------------------------------------

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

// --- c2e4d150 ------------------------------------------------------------

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

const MHQP_FREQUENCY = [
  'Not at all', 'Several days', 'More than half the days', 'Nearly every day'
];

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

export const MAPS = {
    '99be5397': wowSignupMap_,
    '6f25fcaa': wowTestingConsentMap_,
    '63948c3e': mobileHealthAdultMap_,
    'c2e4d150': mobileHealthPediatricMap_
};
