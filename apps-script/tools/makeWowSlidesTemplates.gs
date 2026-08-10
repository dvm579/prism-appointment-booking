/**
 * One-off builder for the four Wellness on Wheels / mobile health Slides
 * templates.
 *
 * Run `buildWowSlidesTemplates()` from any Apps Script project. It creates one
 * presentation per form, sized to US Letter portrait, with a blank slide per
 * printed page and a text box at every placeholder position. Coordinates were
 * measured off the source PDFs: each checkbox box is centred on the printed
 * square, each line field starts just past its printed label.
 *
 * All you add afterwards is the artwork — see BACKGROUND_FOLDER_ID.
 *
 * The presentation URLs are printed to the log at the end.
 */

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * A blank Slides file already set to 8.5 x 11 inches, via
 * File -> Page setup -> Custom. Each template is a copy of it.
 *
 * Needed because neither SlidesApp nor the Slides API can change a
 * presentation's page size after the fact, and changing it in the UI *after*
 * the boxes exist rescales them — which would undo every measurement here.
 *
 * Leave blank to let the script try the advanced Slides service instead; it
 * checks the result and tells you if that did not work.
 */
var BLANK_TEMPLATE_ID = '';

/**
 * Optional: a Drive folder holding the page artwork, which the script will set
 * as each slide's background. Name the files `<key>-<page>.png` — so
 * `wowsu-1.png`, `wowtc-1.png`, `wowtc-2.png`, `mhqa-1.png` … `mhqp-3.png`.
 *
 * Leave blank to paste the images in yourself. If you do that, remember to
 * send each one to the back or it will cover the placeholders.
 */
var BACKGROUND_FOLDER_ID = '';

/** Where the finished templates are filed. Blank means My Drive. */
var OUTPUT_FOLDER_ID = '';

// US Letter portrait, in points. The PDFs measure exactly this.
var PAGE_W = 612;
var PAGE_H = 792;

/**
 * Global nudge, in points, if the text sits slightly off the printed line.
 *
 * Slides text boxes carry a small internal padding that is not exposed to the
 * API, so a uniform offset is the only way to trim it. Positive X moves right,
 * positive Y moves down. Change these and re-run rather than dragging 354
 * boxes by hand.
 */
var NUDGE_X = 0;
var NUDGE_Y = 0;

/** Font for every placeholder. Anything metric-compatible is fine. */
var FONT = 'Arial';

// ---------------------------------------------------------------------------
// Field table — generated from the PDFs, do not hand-edit
// ---------------------------------------------------------------------------
//
// [page, kind, left, top, width, height, fontSize, token]
//
//   c = checkbox mark, centred on the printed square
//   t = single-line value, sitting on the printed rule
//   a = multi-line write-in area, top-aligned under its prompt
//   i = signature image placeholder
//
// left/top are already in Slides space (points from the top-left of the page).

var DECKS = [
  {
    key: 'wowsu',
    formId: '99be5397',
    title: 'WOW Participant Sign-Up (99be5397) — template',
    pages: 1,
    // 32 placeholders
    fields: [
    [1,"t",90.0,116.0,362.0,18.7,11,"%wowsu.name%"],
    [1,"t",494.0,116.0,96.0,18.7,11,"%wowsu.dob%"],
    [1,"c",104.9,142.9,18.0,13.0,10,"%wowsu.sex.female%"],
    [1,"c",158.6,142.9,18.0,13.0,10,"%wowsu.sex.intersex%"],
    [1,"c",217.2,142.9,18.0,13.0,10,"%wowsu.sex.male%"],
    [1,"c",266.6,142.9,18.0,13.0,10,"%wowsu.sex.decline_to_answer%"],
    [1,"c",377.1,142.9,18.0,13.0,10,"%wowsu.sex.other%"],
    [1,"c",25.7,179.0,18.0,13.0,10,"%wowsu.orientation.straight_heterosexual%"],
    [1,"c",149.4,179.0,18.0,13.0,10,"%wowsu.orientation.gay%"],
    [1,"c",200.6,179.0,18.0,13.0,10,"%wowsu.orientation.lesbian%"],
    [1,"c",267.0,179.0,18.0,13.0,10,"%wowsu.orientation.queer%"],
    [1,"c",326.2,179.0,18.0,13.0,10,"%wowsu.orientation.bi_sexual%"],
    [1,"c",397.9,179.0,18.0,13.0,10,"%wowsu.orientation.questioning_and_or_unsure%"],
    [1,"c",25.7,195.2,18.0,13.0,10,"%wowsu.orientation.other%"],
    [1,"c",25.7,234.6,18.0,13.0,10,"%wowsu.gender.female%"],
    [1,"c",79.5,234.6,18.0,13.0,10,"%wowsu.gender.male%"],
    [1,"c",124.3,234.6,18.0,13.0,10,"%wowsu.gender.non_binary_gender_non_conforming%"],
    [1,"c",318.4,234.6,18.0,13.0,10,"%wowsu.gender.transgender_man%"],
    [1,"c",422.2,234.6,18.0,13.0,10,"%wowsu.gender.transgender_woman%"],
    [1,"c",25.7,250.4,18.0,13.0,10,"%wowsu.gender.two_spirit%"],
    [1,"c",92.5,250.4,18.0,13.0,10,"%wowsu.gender.decline_to_answer%"],
    [1,"c",201.6,250.4,18.0,13.0,10,"%wowsu.gender.other%"],
    [1,"c",25.7,289.5,18.0,13.0,10,"%wowsu.disability.blind_visually_impaired%"],
    [1,"c",162.8,289.5,18.0,13.0,10,"%wowsu.disability.deaf_hard_of_hearing%"],
    [1,"c",291.7,289.5,18.0,13.0,10,"%wowsu.disability.medical_disability%"],
    [1,"c",397.6,289.5,18.0,13.0,10,"%wowsu.disability.physical_disability%"],
    [1,"c",505.8,289.5,18.0,13.0,10,"%wowsu.disability.none%"],
    [1,"c",25.7,305.1,18.0,13.0,10,"%wowsu.disability.other%"],
    [1,"c",83.0,326.8,18.0,13.0,10,"%wowsu.insurance.medicare%"],
    [1,"c",149.9,326.8,18.0,13.0,10,"%wowsu.insurance.medicaid%"],
    [1,"c",217.7,326.8,18.0,13.0,10,"%wowsu.insurance.private_insurance%"],
    [1,"c",327.8,326.8,18.0,13.0,10,"%wowsu.insurance.none_uninsured%"],
    ]
  },
  {
    key: 'wowtc',
    formId: '6f25fcaa',
    title: 'WOW Testing Consent (6f25fcaa) — template',
    pages: 2,
    // 63 placeholders
    fields: [
    [1,"t",72.0,108.4,178.0,13.6,8,"%wowtc.last_name%"],
    [1,"t",300.0,108.4,156.0,13.6,8,"%wowtc.first_name%"],
    [1,"t",484.0,108.4,104.0,13.6,8,"%wowtc.dob%"],
    [1,"t",68.0,123.6,176.0,13.6,8,"%wowtc.street%"],
    [1,"t",300.0,123.6,152.0,13.6,8,"%wowtc.city%"],
    [1,"t",458.0,123.6,50.0,13.6,8,"%wowtc.state%"],
    [1,"t",524.0,123.6,64.0,13.6,8,"%wowtc.zip%"],
    [1,"t",78.0,138.7,162.0,13.6,8,"%wowtc.cell%"],
    [1,"t",404.0,139.0,184.0,13.6,8,"%wowtc.email%"],
    [1,"c",300.8,139.7,18.0,13.0,10,"%wowtc.text_ok.yes%"],
    [1,"c",333.9,139.7,18.0,13.0,10,"%wowtc.text_ok.no%"],
    [1,"c",105.9,155.1,18.0,13.0,10,"%wowtc.language.english%"],
    [1,"c",159.5,155.1,18.0,13.0,10,"%wowtc.language.spanish%"],
    [1,"c",212.4,155.1,18.0,13.0,10,"%wowtc.language.polish%"],
    [1,"c",262.4,155.1,18.0,13.0,10,"%wowtc.language.mandarin%"],
    [1,"c",329.7,155.1,18.0,13.0,10,"%wowtc.language.arabic%"],
    [1,"c",377.6,155.1,18.0,13.0,10,"%wowtc.language.other%"],
    [1,"c",148.9,170.0,18.0,13.0,10,"%wowtc.interpreter.no%"],
    [1,"c",183.3,170.0,18.0,13.0,10,"%wowtc.interpreter.yes%"],
    [1,"c",93.8,207.5,18.0,13.0,10,"%wowtc.coverage.medicaid_chip%"],
    [1,"c",351.9,207.5,18.0,13.0,10,"%wowtc.coverage.private_insurance%"],
    [1,"c",93.8,219.9,18.0,13.0,10,"%wowtc.coverage.medicare%"],
    [1,"c",233.5,219.9,18.0,13.0,10,"%wowtc.coverage.va_tricare%"],
    [1,"c",339.3,219.9,18.0,13.0,10,"%wowtc.coverage.uninsured_or_unknown%"],
    [1,"c",491.5,219.9,18.0,13.0,10,"%wowtc.coverage.prefer_not_to_say%"],
    [1,"t",116.0,235.8,124.0,13.6,8,"%wowtc.plan_name%"],
    [1,"t",336.0,235.8,112.0,13.6,8,"%wowtc.member_id%"],
    [1,"t",518.0,235.8,70.0,13.6,8,"%wowtc.subscriber_dob%"],
    [1,"t",98.0,251.5,260.0,13.6,8,"%wowtc.subscriber_name%"],
    [1,"t",464.0,251.5,124.0,13.6,8,"%wowtc.subscriber_relationship%"],
    [1,"c",182.7,288.3,18.0,13.0,10,"%wowtc.hiv_prior.no%"],
    [1,"c",229.4,288.3,18.0,13.0,10,"%wowtc.hiv_prior.yes%"],
    [1,"c",282.8,288.3,18.0,13.0,10,"%wowtc.hiv_prior.unsure%"],
    [1,"c",396.4,288.3,18.0,13.0,10,"%wowtc.hiv_result.positive%"],
    [1,"c",453.4,288.3,18.0,13.0,10,"%wowtc.hiv_result.negative%"],
    [1,"c",510.4,288.3,18.0,13.0,10,"%wowtc.hiv_result.i_don_t_know%"],
    [1,"c",206.2,303.8,18.0,13.0,10,"%wowtc.hcv_prior.no%"],
    [1,"c",242.3,303.8,18.0,13.0,10,"%wowtc.hcv_prior.yes%"],
    [1,"c",282.8,303.8,18.0,13.0,10,"%wowtc.hcv_prior.unsure%"],
    [1,"c",396.4,303.8,18.0,13.0,10,"%wowtc.hcv_result.positive%"],
    [1,"c",453.4,303.8,18.0,13.0,10,"%wowtc.hcv_result.negative%"],
    [1,"c",510.4,303.8,18.0,13.0,10,"%wowtc.hcv_result.i_don_t_know%"],
    [1,"t",6.0,370.4,19.0,11.9,7,"%wowtc.initials.a%"],
    [1,"t",6.0,407.1,19.0,11.9,7,"%wowtc.initials.b%"],
    [1,"t",6.0,437.3,19.0,11.9,7,"%wowtc.initials.c%"],
    [1,"t",6.0,454.8,19.0,11.9,7,"%wowtc.initials.d%"],
    [1,"t",6.0,498.5,19.0,11.9,7,"%wowtc.initials.e%"],
    [1,"t",6.0,530.1,19.0,11.9,7,"%wowtc.initials.f%"],
    [1,"t",6.0,562.6,19.0,11.9,7,"%wowtc.initials.g%"],
    [1,"c",62.7,614.8,18.0,13.0,10,"%wowtc.declines.hiv_testing%"],
    [1,"c",179.6,614.8,18.0,13.0,10,"%wowtc.declines.hcv_testing%"],
    [1,"c",308.9,614.8,18.0,13.0,10,"%wowtc.declines.sharing_results_with_my_pcp%"],
    [1,"t",116.0,673.5,298.0,13.6,8,"%wowtc.patient_name_print%"],
    [1,"t",474.0,673.5,114.0,13.6,8,"%wowtc.dob%"],
    [1,"i",106.0,687.6,312.0,15.0,8,"%wowtc.signature.patient%"],
    [1,"t",454.0,688.1,134.0,13.6,8,"%wowtc.date%"],
    [1,"t",152.0,722.4,236.0,13.6,8,"%wowtc.guardian_name_print%"],
    [1,"t",448.0,722.4,140.0,13.6,8,"%wowtc.guardian_relationship%"],
    [1,"i",142.0,736.2,276.0,15.0,8,"%wowtc.signature.guardian%"],
    [1,"t",454.0,736.7,134.0,13.6,8,"%wowtc.date%"],
    [2,"t",424.0,73.9,118.0,15.3,9,"%wowtc.dos%"],
    [2,"t",136.0,94.6,244.0,15.3,9,"%wowtc.name%"],
    [2,"t",416.0,94.6,126.0,15.3,9,"%wowtc.dob%"],
    ]
  },
  {
    key: 'mhqa',
    formId: '63948c3e',
    title: 'Mobile Health Screening - Adult (63948c3e) — template',
    pages: 3,
    // 137 placeholders
    fields: [
    [1,"t",90.0,87.4,362.0,13.6,8,"%mhqa.name%"],
    [1,"t",484.0,87.4,104.0,13.6,8,"%mhqa.dob%"],
    [1,"c",107.6,179.9,18.0,13.0,10,"%mhqa.reason.a_check_up_preventive_care%"],
    [1,"c",233.0,179.9,18.0,13.0,10,"%mhqa.reason.mental_health_or_emotional_support%"],
    [1,"c",382.5,179.9,18.0,13.0,10,"%mhqa.reason.pregnancy_or_after_baby_care%"],
    [1,"c",36.4,261.3,18.0,13.0,10,"%mhqa.history.high_blood_pressure%"],
    [1,"c",178.4,261.3,18.0,13.0,10,"%mhqa.history.diabetes_high_blood_sugar%"],
    [1,"c",319.3,261.3,18.0,13.0,10,"%mhqa.history.high_cholesterol%"],
    [1,"c",462.8,261.3,18.0,13.0,10,"%mhqa.history.heart_disease%"],
    [1,"c",36.4,278.1,18.0,13.0,10,"%mhqa.history.stroke_or_mini_stroke%"],
    [1,"c",178.4,278.1,18.0,13.0,10,"%mhqa.history.asthma_or_copd%"],
    [1,"c",319.3,278.1,18.0,13.0,10,"%mhqa.history.kidney_disease%"],
    [1,"c",462.8,278.1,18.0,13.0,10,"%mhqa.history.liver_disease_or_hepatitis%"],
    [1,"c",36.4,294.9,18.0,13.0,10,"%mhqa.history.cancer%"],
    [1,"c",178.4,294.9,18.0,13.0,10,"%mhqa.history.thyroid_problems%"],
    [1,"c",319.3,294.9,18.0,13.0,10,"%mhqa.history.seizures%"],
    [1,"c",462.8,294.9,18.0,13.0,10,"%mhqa.history.hiv%"],
    [1,"c",36.4,311.7,18.0,13.0,10,"%mhqa.history.a_mental_health_condition%"],
    [1,"c",178.4,311.7,18.0,13.0,10,"%mhqa.history.a_substance_use_problem%"],
    [1,"c",319.3,311.7,18.0,13.0,10,"%mhqa.history.pregnancy_now_or_recently%"],
    [1,"c",462.8,311.7,18.0,13.0,10,"%mhqa.history.none_of_these%"],
    [1,"c",219.4,340.7,18.0,13.0,10,"%mhqa.nonrx_drugs.no%"],
    [1,"c",266.2,340.7,18.0,13.0,10,"%mhqa.nonrx_drugs.yes%"],
    [1,"c",315.9,340.7,18.0,13.0,10,"%mhqa.nonrx_drugs.prefer_not_to_say%"],
    [1,"c",119.3,357.6,18.0,13.0,10,"%mhqa.could_be_pregnant.no%"],
    [1,"c",166.1,357.6,18.0,13.0,10,"%mhqa.could_be_pregnant.yes%"],
    [1,"c",215.8,357.6,18.0,13.0,10,"%mhqa.could_be_pregnant.not_sure%"],
    [1,"c",283.6,357.6,18.0,13.0,10,"%mhqa.could_be_pregnant.does_not_apply%"],
    [1,"t",156.0,373.8,432.0,13.6,8,"%mhqa.work%"],
    [1,"t",126.0,390.7,462.0,13.6,8,"%mhqa.household%"],
    [1,"a",28.0,427.0,560.0,40.0,8,"%mhqa.history_detail%"],
    [1,"a",28.0,476.0,560.0,32.0,8,"%mhqa.medications%"],
    [1,"t",146.0,509.0,442.0,13.6,8,"%mhqa.allergies%"],
    [1,"a",28.0,545.0,560.0,40.0,8,"%mhqa.surgeries%"],
    [1,"c",275.7,611.0,18.0,13.0,10,"%mhqa.housing_worry.no%"],
    [1,"c",311.2,611.0,18.0,13.0,10,"%mhqa.housing_worry.yes%"],
    [1,"c",192.4,627.0,18.0,13.0,10,"%mhqa.stable_housing.no%"],
    [1,"c",227.9,627.0,18.0,13.0,10,"%mhqa.stable_housing.yes%"],
    [1,"c",266.3,627.0,18.0,13.0,10,"%mhqa.stable_housing.i_m_worried_about_it%"],
    [1,"c",323.8,642.0,18.0,13.0,10,"%mhqa.food.no%"],
    [1,"c",359.3,642.0,18.0,13.0,10,"%mhqa.food.yes%"],
    [1,"c",397.8,642.0,18.0,13.0,10,"%mhqa.food.sometimes%"],
    [1,"c",266.2,657.1,18.0,13.0,10,"%mhqa.transport.no%"],
    [1,"c",301.7,657.1,18.0,13.0,10,"%mhqa.transport.yes%"],
    [1,"c",340.1,657.1,18.0,13.0,10,"%mhqa.transport.sometimes%"],
    [1,"c",294.8,672.1,18.0,13.0,10,"%mhqa.utilities.no%"],
    [1,"c",330.3,672.1,18.0,13.0,10,"%mhqa.utilities.yes%"],
    [1,"c",368.7,672.1,18.0,13.0,10,"%mhqa.utilities.sometimes%"],
    [1,"c",146.4,687.2,18.0,13.0,10,"%mhqa.feel_safe.no%"],
    [1,"c",181.9,687.2,18.0,13.0,10,"%mhqa.feel_safe.yes%"],
    [1,"c",220.3,687.2,18.0,13.0,10,"%mhqa.feel_safe.prefer_not_to_say%"],
    [2,"c",177.4,136.4,18.0,13.0,10,"%mhqa.phq2_interest.not_at_all%"],
    [2,"c",232.7,136.4,18.0,13.0,10,"%mhqa.phq2_interest.several_days%"],
    [2,"c",300.2,136.4,18.0,13.0,10,"%mhqa.phq2_interest.more_than_half_the_days%"],
    [2,"c",406.7,136.4,18.0,13.0,10,"%mhqa.phq2_interest.nearly_every_day%"],
    [2,"c",168.9,152.4,18.0,13.0,10,"%mhqa.phq2_down.not_at_all%"],
    [2,"c",224.3,152.4,18.0,13.0,10,"%mhqa.phq2_down.several_days%"],
    [2,"c",291.7,152.4,18.0,13.0,10,"%mhqa.phq2_down.more_than_half_the_days%"],
    [2,"c",398.3,152.4,18.0,13.0,10,"%mhqa.phq2_down.nearly_every_day%"],
    [2,"c",165.5,182.2,18.0,13.0,10,"%mhqa.gad2_nervous.not_at_all%"],
    [2,"c",220.9,182.2,18.0,13.0,10,"%mhqa.gad2_nervous.several_days%"],
    [2,"c",288.3,182.2,18.0,13.0,10,"%mhqa.gad2_nervous.more_than_half_the_days%"],
    [2,"c",394.9,182.2,18.0,13.0,10,"%mhqa.gad2_nervous.nearly_every_day%"],
    [2,"c",183.2,197.2,18.0,13.0,10,"%mhqa.gad2_worry.not_at_all%"],
    [2,"c",238.6,197.2,18.0,13.0,10,"%mhqa.gad2_worry.several_days%"],
    [2,"c",306.1,197.2,18.0,13.0,10,"%mhqa.gad2_worry.more_than_half_the_days%"],
    [2,"c",412.6,197.2,18.0,13.0,10,"%mhqa.gad2_worry.nearly_every_day%"],
    [2,"c",213.7,227.4,18.0,13.0,10,"%mhqa.audit_frequency.never%"],
    [2,"c",252.9,227.4,18.0,13.0,10,"%mhqa.audit_frequency.monthly_or_less%"],
    [2,"c",325.9,227.4,18.0,13.0,10,"%mhqa.audit_frequency.2_4_times_a_month%"],
    [2,"c",411.6,227.4,18.0,13.0,10,"%mhqa.audit_frequency.2_3_times_a_week%"],
    [2,"c",493.0,227.4,18.0,13.0,10,"%mhqa.audit_frequency.4_times_a_week%"],
    [2,"c",213.7,242.5,18.0,13.0,10,"%mhqa.audit_quantity.1_2%"],
    [2,"c",248.2,242.5,18.0,13.0,10,"%mhqa.audit_quantity.3_4%"],
    [2,"c",282.7,242.5,18.0,13.0,10,"%mhqa.audit_quantity.5_6%"],
    [2,"c",317.2,242.5,18.0,13.0,10,"%mhqa.audit_quantity.7_9%"],
    [2,"c",351.8,242.5,18.0,13.0,10,"%mhqa.audit_quantity.10%"],
    [2,"c",238.7,257.6,18.0,13.0,10,"%mhqa.audit_binge.never%"],
    [2,"c",281.9,257.6,18.0,13.0,10,"%mhqa.audit_binge.less_than_monthly%"],
    [2,"c",369.5,257.6,18.0,13.0,10,"%mhqa.audit_binge.monthly%"],
    [2,"c",420.7,257.6,18.0,13.0,10,"%mhqa.audit_binge.weekly%"],
    [2,"c",468.5,257.6,18.0,13.0,10,"%mhqa.audit_binge.almost_daily%"],
    [2,"c",183.2,286.1,18.0,13.0,10,"%mhqa.tobacco.no%"],
    [2,"c",216.2,286.1,18.0,13.0,10,"%mhqa.tobacco.yes%"],
    [2,"c",250.8,286.1,18.0,13.0,10,"%mhqa.tobacco.i_recently_quit_within_the_last_year%"],
    [2,"c",36.3,348.0,18.0,13.0,10,"%mhqa.family.heart_disease_or_heart_attack%"],
    [2,"c",178.3,348.0,18.0,13.0,10,"%mhqa.family.high_blood_pressure%"],
    [2,"c",319.2,348.0,18.0,13.0,10,"%mhqa.family.diabetes%"],
    [2,"c",462.7,348.0,18.0,13.0,10,"%mhqa.family.stroke%"],
    [2,"c",36.3,364.7,18.0,13.0,10,"%mhqa.family.breast_cancer%"],
    [2,"c",178.3,364.7,18.0,13.0,10,"%mhqa.family.colon_cancer%"],
    [2,"c",319.2,364.7,18.0,13.0,10,"%mhqa.family.cervical_cancer%"],
    [2,"c",462.7,364.7,18.0,13.0,10,"%mhqa.family.other_cancer%"],
    [2,"c",36.3,381.5,18.0,13.0,10,"%mhqa.family.a_mental_health_condition%"],
    [2,"c",178.3,381.5,18.0,13.0,10,"%mhqa.family.a_substance_use_problem%"],
    [2,"c",319.2,381.5,18.0,13.0,10,"%mhqa.family.kidney_disease%"],
    [2,"c",462.7,381.5,18.0,13.0,10,"%mhqa.family.hiv%"],
    [2,"a",28.0,418.0,560.0,34.0,8,"%mhqa.family_detail%"],
    [2,"c",238.7,518.2,18.0,13.0,10,"%mhqa.falls.no%"],
    [2,"c",281.9,518.2,18.0,13.0,10,"%mhqa.falls.yes%"],
    [2,"c",322.5,518.2,18.0,13.0,10,"%mhqa.falls.i_m_under_65%"],
    [2,"c",167.1,533.5,18.0,13.0,10,"%mhqa.regular_doctor.no%"],
    [2,"c",210.3,533.5,18.0,13.0,10,"%mhqa.regular_doctor.yes%"],
    [2,"c",250.9,533.5,18.0,13.0,10,"%mhqa.regular_doctor.not_sure%"],
    [2,"t",350.0,547.5,152.0,13.6,8,"%mhqa.last_screening%"],
    [2,"t",306.0,562.9,78.0,13.6,8,"%mhqa.last_pap%"],
    [2,"t",284.0,578.2,78.0,13.6,8,"%mhqa.last_mammogram%"],
    [2,"c",281.1,595.3,18.0,13.0,10,"%mhqa.colon_screening.no%"],
    [2,"c",314.4,595.3,18.0,13.0,10,"%mhqa.colon_screening.yes%"],
    [2,"c",351.0,595.3,18.0,13.0,10,"%mhqa.colon_screening.n_a%"],
    [2,"c",371.7,642.0,18.0,13.0,10,"%mhqa.mh_hospital.no%"],
    [2,"c",401.7,642.0,18.0,13.0,10,"%mhqa.mh_hospital.yes_mental_health%"],
    [2,"c",492.4,642.0,18.0,13.0,10,"%mhqa.mh_hospital.yes_substance_use%"],
    [2,"t",158.0,656.8,430.0,13.6,8,"%mhqa.mh_treatment_where%"],
    [2,"c",274.5,673.6,18.0,13.0,10,"%mhqa.mh_treatment.no%"],
    [2,"c",304.5,673.6,18.0,13.0,10,"%mhqa.mh_treatment.yes%"],
    [2,"c",337.4,673.6,18.0,13.0,10,"%mhqa.mh_treatment.i_recently_stopped%"],
    [2,"c",250.1,689.4,18.0,13.0,10,"%mhqa.self_harm.no%"],
    [2,"c",280.0,689.4,18.0,13.0,10,"%mhqa.self_harm.yes%"],
    [3,"c",117.2,121.7,18.0,13.0,10,"%mhqa.pregnant_now.yes%"],
    [3,"c",147.1,121.7,18.0,13.0,10,"%mhqa.pregnant_now.no_i_recently_had_a_baby%"],
    [3,"c",251.0,121.7,18.0,13.0,10,"%mhqa.pregnant_now.maybe_i_d_like_a_test_today%"],
    [3,"t",134.0,136.8,94.0,13.6,8,"%mhqa.due_date%"],
    [3,"t",401.0,136.8,187.0,13.6,8,"%mhqa.weeks_pregnant%"],
    [3,"t",266.0,151.8,118.0,13.6,8,"%mhqa.delivery_date%"],
    [3,"t",296.0,167.4,88.0,13.6,8,"%mhqa.pregnancies%"],
    [3,"t",436.0,167.4,92.0,13.6,8,"%mhqa.births%"],
    [3,"t",263.0,183.5,161.0,13.6,8,"%mhqa.prenatal_where%"],
    [3,"c",147.2,184.2,18.0,13.0,10,"%mhqa.prenatal_care.not_yet%"],
    [3,"c",193.7,184.2,18.0,13.0,10,"%mhqa.prenatal_care.yes%"],
    [3,"c",429.0,184.2,18.0,13.0,10,"%mhqa.prenatal_care.n_a_after_baby%"],
    [3,"c",236.8,225.0,18.0,13.0,10,"%mhqa.epds_mood.no_rarely%"],
    [3,"c",300.2,225.0,18.0,13.0,10,"%mhqa.epds_mood.some_of_the_time%"],
    [3,"c",388.6,225.0,18.0,13.0,10,"%mhqa.epds_mood.most_of_the_time%"],
    [3,"c",239.2,240.3,18.0,13.0,10,"%mhqa.epds_self_harm.no%"],
    [3,"c",272.5,240.3,18.0,13.0,10,"%mhqa.epds_self_harm.yes%"],
    [3,"a",28.0,367.0,560.0,45.0,8,"%mhqa.other%"],
    ]
  },
  {
    key: 'mhqp',
    formId: 'c2e4d150',
    title: 'Mobile Health Screening - Minor (c2e4d150) — template',
    pages: 3,
    // 122 placeholders
    fields: [
    [1,"t",90.0,87.4,362.0,13.6,8,"%mhqp.name%"],
    [1,"t",484.0,87.4,104.0,13.6,8,"%mhqp.dob%"],
    [1,"c",107.6,165.0,18.0,13.0,10,"%mhqp.reason.well_child_check_up%"],
    [1,"c",203.3,165.0,18.0,13.0,10,"%mhqp.reason.shots_immunizations%"],
    [1,"c",312.7,165.0,18.0,13.0,10,"%mhqp.reason.sick_or_a_specific_concern%"],
    [1,"c",431.2,165.0,18.0,13.0,10,"%mhqp.reason.school_sports_form%"],
    [1,"t",76.0,216.8,324.0,13.6,8,"%mhqp.parent_name%"],
    [1,"t",496.0,216.8,92.0,13.6,8,"%mhqp.parent_relationship%"],
    [1,"t",78.0,232.0,162.0,13.6,8,"%mhqp.parent_cell%"],
    [1,"t",404.0,232.3,184.0,13.6,8,"%mhqp.parent_email%"],
    [1,"c",300.9,233.0,18.0,13.0,10,"%mhqp.text_ok.yes%"],
    [1,"c",334.1,233.0,18.0,13.0,10,"%mhqp.text_ok.no%"],
    [1,"c",272.0,248.3,18.0,13.0,10,"%mhqp.is_guardian.yes%"],
    [1,"c",315.1,248.3,18.0,13.0,10,"%mhqp.is_guardian.no%"],
    [1,"t",208.0,262.8,380.0,13.6,8,"%mhqp.other_guardian%"],
    [1,"c",93.9,298.6,18.0,13.0,10,"%mhqp.coverage.medicaid%"],
    [1,"c",155.4,298.6,18.0,13.0,10,"%mhqp.coverage.medicaid_health_plan%"],
    [1,"c",264.5,298.6,18.0,13.0,10,"%mhqp.coverage.chip_all_kids%"],
    [1,"c",351.8,298.6,18.0,13.0,10,"%mhqp.coverage.no_insurance%"],
    [1,"c",436.3,298.6,18.0,13.0,10,"%mhqp.coverage.other%"],
    [1,"t",104.0,313.7,280.0,13.6,8,"%mhqp.plan_name%"],
    [1,"t",438.0,313.7,150.0,13.6,8,"%mhqp.member_id%"],
    [1,"t",148.0,329.4,236.0,13.6,8,"%mhqp.card_name%"],
    [1,"t",482.0,329.4,106.0,13.6,8,"%mhqp.card_relationship%"],
    [1,"c",35.9,381.5,18.0,13.0,10,"%mhqp.history.asthma_or_breathing_problems%"],
    [1,"c",177.9,381.5,18.0,13.0,10,"%mhqp.history.diabetes%"],
    [1,"c",318.8,381.5,18.0,13.0,10,"%mhqp.history.frequent_ear_infections%"],
    [1,"c",462.3,384.2,18.0,13.0,10,"%mhqp.history.a_developmental_or_learning_concern%"],
    [1,"c",35.9,398.3,18.0,13.0,10,"%mhqp.history.allergies_food_medicine_other%"],
    [1,"c",177.9,398.3,18.0,13.0,10,"%mhqp.history.vision_or_hearing_problem%"],
    [1,"c",318.8,398.3,18.0,13.0,10,"%mhqp.history.heart_condition%"],
    [1,"c",462.3,405.0,18.0,13.0,10,"%mhqp.history.none_of_these%"],
    [1,"c",35.9,415.1,18.0,13.0,10,"%mhqp.history.eczema_or_skin_conditions%"],
    [1,"c",177.9,415.1,18.0,13.0,10,"%mhqp.history.born_premature_nicu_stay%"],
    [1,"c",318.8,423.6,18.0,13.0,10,"%mhqp.history.a_mental_or_behavioral_health_condition%"],
    [1,"c",35.9,431.8,18.0,13.0,10,"%mhqp.history.seizures%"],
    [1,"c",177.9,431.8,18.0,13.0,10,"%mhqp.history.a_substance_use_problem%"],
    [1,"a",28.0,467.0,560.0,35.0,8,"%mhqp.history_detail%"],
    [1,"a",28.0,510.0,560.0,28.0,8,"%mhqp.medications%"],
    [1,"t",144.0,538.8,444.0,13.6,8,"%mhqp.allergies%"],
    [1,"a",28.0,568.0,560.0,29.0,8,"%mhqp.surgeries%"],
    [1,"c",200.7,598.5,18.0,13.0,10,"%mhqp.regular_doctor.no%"],
    [1,"c",230.7,598.5,18.0,13.0,10,"%mhqp.regular_doctor.yes%"],
    [1,"c",263.6,598.5,18.0,13.0,10,"%mhqp.regular_doctor.not_sure%"],
    [1,"c",200.7,634.6,18.0,13.0,10,"%mhqp.born_early.no%"],
    [1,"c",230.7,634.6,18.0,13.0,10,"%mhqp.born_early.yes%"],
    [1,"c",263.6,634.6,18.0,13.0,10,"%mhqp.born_early.not_sure%"],
    [1,"c",200.7,649.4,18.0,13.0,10,"%mhqp.birth_problems.no%"],
    [1,"c",230.7,649.4,18.0,13.0,10,"%mhqp.birth_problems.yes%"],
    [1,"c",320.9,649.4,18.0,13.0,10,"%mhqp.birth_problems.not_sure%"],
    [1,"a",28.0,678.0,560.0,24.0,8,"%mhqp.birth_problems_detail%"],
    [1,"c",24.3,703.5,18.0,13.0,10,"%mhqp.development.no_concerns%"],
    [1,"c",95.0,703.5,18.0,13.0,10,"%mhqp.development.a_few_concerns%"],
    [1,"c",175.7,703.5,18.0,13.0,10,"%mhqp.development.yes_i_d_like_to_talk_about_it%"],
    [1,"a",28.0,732.0,560.0,18.0,8,"%mhqp.development_detail%"],
    [2,"c",226.7,105.0,18.0,13.0,10,"%mhqp.shots_current.no%"],
    [2,"c",256.6,105.0,18.0,13.0,10,"%mhqp.shots_current.yes%"],
    [2,"c",289.5,105.0,18.0,13.0,10,"%mhqp.shots_current.not_sure%"],
    [2,"c",346.9,105.0,18.0,13.0,10,"%mhqp.shots_current.we_don_t_vaccinate%"],
    [2,"c",226.7,119.9,18.0,13.0,10,"%mhqp.shot_record.yes_on_paper%"],
    [2,"c",294.9,119.9,18.0,13.0,10,"%mhqp.shot_record.yes_on_phone_or_app%"],
    [2,"c",381.4,119.9,18.0,13.0,10,"%mhqp.shot_record.no%"],
    [2,"c",414.4,119.9,18.0,13.0,10,"%mhqp.shot_record.it_s_with_another_clinic%"],
    [2,"t",204.0,134.2,236.0,13.6,8,"%mhqp.shot_record_clinic%"],
    [2,"t",494.0,134.2,94.0,13.6,8,"%mhqp.shot_record_city_state%"],
    [2,"a",28.0,164.0,560.0,24.0,8,"%mhqp.shots_needed%"],
    [2,"c",203.5,188.8,18.0,13.0,10,"%mhqp.vaccine_reaction.no%"],
    [2,"c",234.5,188.8,18.0,13.0,10,"%mhqp.vaccine_reaction.yes%"],
    [2,"c",325.7,188.8,18.0,13.0,10,"%mhqp.vaccine_reaction.not_sure%"],
    [2,"a",28.0,217.0,560.0,30.0,8,"%mhqp.vaccine_reaction_detail%"],
    [2,"c",36.2,283.3,18.0,13.0,10,"%mhqp.family.asthma_or_allergies%"],
    [2,"c",178.2,283.3,18.0,13.0,10,"%mhqp.family.diabetes%"],
    [2,"c",319.1,283.3,18.0,13.0,10,"%mhqp.family.heart_disease%"],
    [2,"c",462.5,283.3,18.0,13.0,10,"%mhqp.family.high_blood_pressure%"],
    [2,"c",36.2,300.1,18.0,13.0,10,"%mhqp.family.a_mental_health_condition%"],
    [2,"c",178.2,300.1,18.0,13.0,10,"%mhqp.family.a_substance_use_problem%"],
    [2,"c",319.1,300.1,18.0,13.0,10,"%mhqp.family.sickle_cell_or_blood_disorder%"],
    [2,"c",462.5,300.1,18.0,13.0,10,"%mhqp.family.none_not_sure%"],
    [2,"a",28.0,335.0,560.0,28.0,8,"%mhqp.family_detail%"],
    [2,"c",200.4,363.8,18.0,13.0,10,"%mhqp.smoke_vape.no%"],
    [2,"c",230.4,363.8,18.0,13.0,10,"%mhqp.smoke_vape.yes%"],
    [2,"c",263.3,363.8,18.0,13.0,10,"%mhqp.smoke_vape.not_in_the_home_but_around_the_child%"],
    [2,"t",148.0,377.9,440.0,13.6,8,"%mhqp.household%"],
    [2,"c",305.4,450.0,18.0,13.0,10,"%mhqp.housing_worry.no%"],
    [2,"c",340.9,450.0,18.0,13.0,10,"%mhqp.housing_worry.yes%"],
    [2,"c",231.0,466.0,18.0,13.0,10,"%mhqp.stable_housing.no%"],
    [2,"c",266.5,466.0,18.0,13.0,10,"%mhqp.stable_housing.yes%"],
    [2,"c",305.0,466.0,18.0,13.0,10,"%mhqp.stable_housing.we_re_worried_about_it%"],
    [2,"c",305.0,482.0,18.0,13.0,10,"%mhqp.food.no%"],
    [2,"c",340.5,482.0,18.0,13.0,10,"%mhqp.food.yes%"],
    [2,"c",378.9,482.0,18.0,13.0,10,"%mhqp.food.sometimes%"],
    [2,"c",288.3,498.0,18.0,13.0,10,"%mhqp.transport.no%"],
    [2,"c",323.8,498.0,18.0,13.0,10,"%mhqp.transport.yes%"],
    [2,"c",245.0,514.0,18.0,13.0,10,"%mhqp.utilities.no%"],
    [2,"c",280.5,514.0,18.0,13.0,10,"%mhqp.utilities.yes%"],
    [2,"c",178.7,530.0,18.0,13.0,10,"%mhqp.feel_safe.no%"],
    [2,"c",214.2,530.0,18.0,13.0,10,"%mhqp.feel_safe.yes%"],
    [2,"c",252.7,530.0,18.0,13.0,10,"%mhqp.feel_safe.prefer_not_to_say%"],
    [2,"c",305.4,600.9,18.0,13.0,10,"%mhqp.emotional.doing_well%"],
    [2,"c",362.9,600.9,18.0,13.0,10,"%mhqp.emotional.some_ups_and_downs%"],
    [2,"c",460.1,600.9,18.0,13.0,10,"%mhqp.emotional.i_have_concerns%"],
    [2,"c",286.4,616.0,18.0,13.0,10,"%mhqp.home_changes.no%"],
    [2,"c",343.9,616.0,18.0,13.0,10,"%mhqp.home_changes.yes%"],
    [2,"c",178.6,631.0,18.0,13.0,10,"%mhqp.sleep_eating.fine%"],
    [2,"c",236.1,631.0,18.0,13.0,10,"%mhqp.sleep_eating.some_issues%"],
    [2,"c",324.0,631.0,18.0,13.0,10,"%mhqp.sleep_eating.i_have_concerns%"],
    [2,"a",28.0,659.0,560.0,33.0,8,"%mhqp.provider_note%"],
    [3,"c",168.8,151.9,18.0,13.0,10,"%mhqp.phq_down.not_at_all%"],
    [3,"c",224.2,151.9,18.0,13.0,10,"%mhqp.phq_down.several_days%"],
    [3,"c",291.6,151.9,18.0,13.0,10,"%mhqp.phq_down.more_than_half_the_days%"],
    [3,"c",398.2,151.9,18.0,13.0,10,"%mhqp.phq_down.nearly_every_day%"],
    [3,"c",180.1,167.3,18.0,13.0,10,"%mhqp.phq_interest.not_at_all%"],
    [3,"c",235.4,167.3,18.0,13.0,10,"%mhqp.phq_interest.several_days%"],
    [3,"c",302.9,167.3,18.0,13.0,10,"%mhqp.phq_interest.more_than_half_the_days%"],
    [3,"c",409.4,167.3,18.0,13.0,10,"%mhqp.phq_interest.nearly_every_day%"],
    [3,"c",166.1,182.4,18.0,13.0,10,"%mhqp.gad_nervous.not_at_all%"],
    [3,"c",221.5,182.4,18.0,13.0,10,"%mhqp.gad_nervous.several_days%"],
    [3,"c",289.0,182.4,18.0,13.0,10,"%mhqp.gad_nervous.more_than_half_the_days%"],
    [3,"c",395.5,182.4,18.0,13.0,10,"%mhqp.gad_nervous.nearly_every_day%"],
    [3,"c",242.4,197.4,18.0,13.0,10,"%mhqp.self_harm.no%"],
    [3,"c",299.9,197.4,18.0,13.0,10,"%mhqp.self_harm.yes%"],
    [3,"a",28.0,317.0,560.0,45.0,8,"%mhqp.other%"],
    ]
  }
];

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function buildWowSlidesTemplates() {
  var made = [];

  DECKS.forEach(function (deck) {
    var presentation = createDeck_(deck.title);
    assertLetterPortrait_(presentation);

    var slides = resetSlides_(presentation, deck.pages);
    applyBackgrounds_(deck, slides);

    deck.fields.forEach(function (field) {
      placeField_(slides[field[0] - 1], field);
    });

    presentation.saveAndClose();
    fileIt_(presentation.getId());
    made.push({ deck: deck, url: presentation.getUrl() });
  });

  report_(made);
  return made;
}

/**
 * A presentation of the right page size.
 *
 * Copying a correctly-sized blank is the reliable route. The advanced Slides
 * service is tried first only because it saves you making that blank; whether
 * it honours pageSize on create is not guaranteed, so the result is checked.
 */
function createDeck_(title) {
  if (BLANK_TEMPLATE_ID) {
    return SlidesApp.openById(DriveApp.getFileById(BLANK_TEMPLATE_ID).makeCopy(title).getId());
  }

  if (typeof Slides !== 'undefined') {
    try {
      var created = Slides.Presentations.create({
        title: title,
        pageSize: {
          width: { magnitude: PAGE_W, unit: 'PT' },
          height: { magnitude: PAGE_H, unit: 'PT' }
        }
      });
      return SlidesApp.openById(created.presentationId);
    } catch (error) {
      console.warn('Advanced Slides create failed (%s); falling back.', error.message);
    }
  }

  return SlidesApp.create(title);
}

function assertLetterPortrait_(presentation) {
  var w = Math.round(presentation.getPageWidth());
  var h = Math.round(presentation.getPageHeight());
  if (Math.abs(w - PAGE_W) <= 2 && Math.abs(h - PAGE_H) <= 2) return;

  throw new Error(
    'The new presentation is ' + w + 'x' + h + 'pt, not ' + PAGE_W + 'x' + PAGE_H + '. ' +
    'Page size cannot be set from a script, and changing it in the UI afterwards ' +
    'rescales everything on the slide. Make one blank presentation, set ' +
    'File > Page setup > Custom to 8.5 x 11 inches, put its id in ' +
    'BLANK_TEMPLATE_ID, then delete the presentation this run just made and ' +
    'run again.');
}

/** Replaces the starting slide with `count` blank ones. */
function resetSlides_(presentation, count) {
  var original = presentation.getSlides();
  for (var i = 0; i < count; i++) {
    presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  }
  // Removed after appending: a presentation cannot be left with no slides.
  original.forEach(function (slide) { slide.remove(); });
  return presentation.getSlides();
}

function applyBackgrounds_(deck, slides) {
  if (!BACKGROUND_FOLDER_ID) return;

  var folder = DriveApp.getFolderById(BACKGROUND_FOLDER_ID);
  for (var page = 1; page <= deck.pages; page++) {
    var name = deck.key + '-' + page + '.png';
    var found = folder.getFilesByName(name);
    if (!found.hasNext()) {
      console.log('No background named %s; leaving that slide blank.', name);
      continue;
    }
    slides[page - 1].getBackground().setPictureFill(found.next().getBlob());
  }
}

function placeField_(slide, field) {
  var kind = field[1];
  var left = field[2] + NUDGE_X;
  var top = field[3] + NUDGE_Y;
  var box = slide.insertTextBox(field[7], left, top, field[4], field[5]);

  var text = box.getText();
  text.getTextStyle()
    .setFontFamily(FONT)
    .setFontSize(field[6])
    .setBold(kind === 'c')
    .setForegroundColor('#000000');

  text.getParagraphStyle().setParagraphAlignment(
    kind === 'c' ? SlidesApp.ParagraphAlignment.CENTER : SlidesApp.ParagraphAlignment.START);

  box.setContentAlignment(
    kind === 'a' ? SlidesApp.ContentAlignment.TOP : SlidesApp.ContentAlignment.MIDDLE);

  // Without this a long answer shrinks itself and stops matching its neighbours.
  try {
    box.getAutofit().setAutofitType(SlidesApp.AutofitType.NONE);
  } catch (error) {
    // Older runtimes do not expose autofit; the default is close enough.
  }

  // Alt text, so a box can be found by token from the Slides UI.
  box.setTitle(field[7]);
  box.setDescription(kind === 'c' ? 'checkbox mark' : 'value');
}

function fileIt_(fileId) {
  if (!OUTPUT_FOLDER_ID) return;
  DriveApp.getFileById(fileId).moveTo(DriveApp.getFolderById(OUTPUT_FOLDER_ID));
}

function report_(made) {
  var lines = ['', 'Templates created — put these ids in the generator files:', ''];

  made.forEach(function (entry) {
    lines.push(entry.deck.title);
    lines.push('  FormID   ' + entry.deck.formId);
    lines.push('  id       ' + entry.url.replace(/^.*\/d\//, '').replace(/\/edit.*$/, ''));
    lines.push('  url      ' + entry.url);
    lines.push('  boxes    ' + entry.deck.fields.length + ' across ' + entry.deck.pages + ' page(s)');
    lines.push('');
  });

  lines.push('Placeholders with no home on the printed form:');
  lines.push("  wowsu: %wowsu.appointment_id%, %wowsu.date%, %wowsu.disability.other_text%, %wowsu.dos%, %wowsu.facility%, %wowsu.gender.other_text%, %wowsu.insurance.other_text%, %wowsu.orientation.other_text%, %wowsu.patient_id%");
  lines.push("  wowtc: %wowtc.address%, %wowtc.appointment_id%, %wowtc.declines.covid_19_vaccination_if_indicated%, %wowtc.declines.flu_vaccination_if_indicated%, %wowtc.declines.hpv_vaccination_if_indicated%, %wowtc.facility%, %wowtc.group%, %wowtc.patient_id%, %wowtc.payer%");
  lines.push("  mhqa: %mhqa.appointment_id%, %mhqa.date%, %mhqa.dos%, %mhqa.facility%, %mhqa.patient_id%, %mhqa.self_harm_alert%");
  lines.push("  mhqp: %mhqp.appointment_id%, %mhqp.date%, %mhqp.dos%, %mhqp.facility%, %mhqp.group%, %mhqp.patient_id%, %mhqp.payer%, %mhqp.self_harm_alert%");
  console.log(lines.join('\n'));
}
