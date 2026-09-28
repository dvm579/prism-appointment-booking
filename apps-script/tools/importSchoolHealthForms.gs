/**
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
var WORKBOOK_ID = '17226ud6cLY7gbLyv0IS_3k1mylHeWuoHHKyr96hoy1I';

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
  ["VAXADMIN", "0-12, 12-18", "0-3,4-11,12-17"],
  ["PHYSICAL", "0-12, 12-18", "0-3,4-11,12-17"],
  ["SPRTPHYS", "12-18", "12-17"],
  ["HIV12HCV", "12-18, 18+", "12-17,18+"],
  ["ENMMINOR", "0-12, 12-18", "0-3,4-11,12-17"]
];

var FORMS = [
  ["shccore", "School Health - shared core"],
  ["shc0003", "School Health Parent Form (ages 0-3)"],
  ["shc0411", "School Health Parent Form (ages 4-11)"],
  ["shc1217", "School Health Parent Form (ages 12-17)"],
  ["shcadult", "School Health Patient Form (18+)"],
  ["shcvax26", "School Health Vaccine Consent"]
];

var SERVICE_TYPES = [
  ["SHCV0003", "School Health Visit (ages 0-3)", "shccore,shc0003", "", "cfs20267", "0-3", "", "TRUE"],
  ["SHCV0411", "School Health Visit (ages 4-11)", "shccore,shc0411", "", "cfs20267", "4-11", "", "TRUE"],
  ["SHCV1217", "School Health Visit (ages 12-17)", "shccore,shc1217", "", "cfs20267", "12-17", "", "TRUE"],
  ["SHCVADLT", "School Health Visit (18+)", "shccore,shcadult", "", "cfs20267", "18+", "", "TRUE"],
  ["SHCVAXIM", "Immunizations at this visit", "shcvax26", "", "cfs20267", "0-3,4-11,12-17", "", "TRUE"]
];

var CONSENT_BLOCK = ["cfs20267", "Consent for Services v2026.7", "<p class=\"text-muted small\">Read each section. Use the <strong>I decline</strong> controls to opt out of anything you do not want; declining one item does not affect any other care. Signing consents to every section you did not decline.</p>\n<h5 class=\"mt-3\">1. Consent For Services</h5>\n<p>A. Treatment. I consent to examination, vital signs, point-of-care screening, health education, and referrals by Prism clinicians. Trained volunteers, supervised students, and host-site staff may assist or observe, unless I affirmatively decline. If I am pregnant, this consent includes my unborn child. Prism may photograph a rash, wound, or similar finding for my medical record; images are not used for advertising without a separate signed release. No health care service can guarantee a result, and none has been promised. B. Laboratory testing, including HIV and hepatitis C screening. I consent to specimen collection by urine, finger stick, blood draw, or swab; a blood draw may cause bruising or fainting. Some specimens are sent to an outside laboratory. Rapid tests are screening tests, not diagnoses; a reactive or abnormal result requires a confirmatory laboratory test, and follow-up care is my choice. The following HIV pre-test information has been provided to me (pursuant to 410 ILCS 305): the purpose of the test and how the result may be used; what the test can and cannot tell me; that testing is voluntary and how it is performed; that staff are available to answer questions; that I may withdraw at any time; that anonymous testing is available and my name and result are confidential as far as the law allows; and that counseling is available. C. Immunizations and registry reporting. I consent to age-appropriate vaccines recommended by the Centers for Disease Control and Prevention, with a Vaccine Information Statement provided before each vaccine. Illinois requires reporting of COVID-19 and publicly funded vaccines to the I-CARE registry; other vaccines are reported unless declined, which locks my record but does not remove existing entries. D. Telehealth follow-up. If laboratory testing is ordered, Prism may contact me for a follow-up visit by telephone or video, usually within 3 to 5 business days, with an Illinois-licensed clinician. No physical examination is possible by telehealth, and I may be asked to come in. I will be located in Illinois in a private setting and will state my location at the start of the visit so that emergency services can be directed to me (call 911 in an emergency). Others may join to help, such as an interpreter, a student, or a supervising clinician, and I may ask anyone not involved in my care to leave. You understand that there are potential risks to telehealth technology, including interruptions, unauthorized access, and technical difficulties. In addition, Prism is not responsible nor has control over the devices, computers, or internet over which you may choose to enter confidential or personal information and cannot, therefore, prevent interceptions or compromises to you information while in transit. Best way to reach me for follow-up phone / text / video Best days and times</p>\n<h5 class=\"mt-3\">2. Communications And Patient Portal Access</h5>\n<p>Prism, or a company acting on Prism&#x27;s behalf, may contact me by telephone, text message, or email about appointments, results, and my care, including by automated or prerecorded message. Message frequency varies and message and data rates may apply. I may stop text messages at any time by replying STOP, or reply HELP for help. Text and email are not secure; Prism does not send results or diagnoses by those means unless I ask, and does not send a positive HIV result by those means. If a patient portal account is created for me, results and messages will appear there; a parent or guardian may view a minor&#x27;s portal except for care the minor may receive on their own under Illinois law.</p>\n<h5 class=\"mt-3\">3. Disclosure Of Results To Primary Care Provider</h5>\n<p>Prism sends my test results and follow-up recommendations, including routine laboratory results, to the primary care provider named below so that provider can care for me. I may stop this at any time through the decline panel or by telling a team member. Mental health and substance use records are not included and require a separate signed release. Primary care provider name and practice Practice phone or fax</p>\n<h5 class=\"mt-3\">4. De-Identified Research And Quality Use</h5>\n<p>Prism analyzes its own results to improve care and publish findings, with my name and all identifiers removed, and may retain leftover specimens in de-identified form. Illinois law prohibits any recipient from attempting to re-identify me. Information that identifies me is not used for research without a separate signed authorization or approval by an institutional review board as permitted by law.</p>\n<h5 class=\"mt-3\">5. Audio Recording For Clinical Documentation</h5>\n<p>initial the box to decline By signing this form I consent to the recording of my visits today, in person, by telephone, or by video, by a documentation tool that drafts the clinical note for the clinician&#x27;s review and signature. The tool makes no clinical decisions. Everyone present is asked before recording begins, and anyone may decline or ask the clinician to stop at any time. How recordings and transcripts are kept and used is described in the Notice of Privacy Practices. For care a minor may receive on their own under Illinois law, the minor makes this choice.</p>\n<h5 class=\"mt-3\">6. Technology Use In Prism Operations</h5>\n<p>Prism operates with software that uses artificial intelligence for scheduling, reminders, drafting of notes and correspondence, billing and claim review, planning of mobile clinic locations, and translation of written materials. These tools are part of Prism&#x27;s standard operations for every patient, in the same way as the electronic health record. A licensed clinician makes every decision about my care, and a person signs every clinical note and every claim. The tools in use and the rules Prism applies to them are described in the Notice of Privacy Practices.</p>\n<h5 class=\"mt-3\">7. Assignment Of Benefits And Financial Responsibility</h5>\n<p>I authorize Prism Foundation NFP, Prism Holistic Care Ltd, and Prism Health Lab USA Inc to verify my insurance coverage and Medicaid eligibility, using the information I provide and coverage information available through their billing systems, and to bill any coverage identified for today&#x27;s services, including coverage I did not list. I assign my benefits to whichever of them bills for the service. If I have Medicare, I certify that the information provided is correct and request payment to that organization. I agree to personally pay for any charges that are not covered by or collected from any applicable insurance program, including any copays, deductibles, and coinsurance amounts. • Medicaid and Medicaid managed care: Medicaid&#x27;s payment is payment in full. Members are not billed for covered services, and Illinois Medicaid has no copayments. • Medicare QMB: no deductible, coinsurance, or copayment is charged. • Private insurance: my plan may apply cost sharing. Prism makes reasonable efforts to tell me before a service if I am likely to owe, including when a preventive visit becomes a preventive plus problem visit. • Uninsured or self-pay: I may request a written Good Faith Estimate, and I may qualify for the Sliding Fee Discount Program. No one is refused care for inability to pay. • Outside laboratory: some specimens go to an outside laboratory that may bill separately. • Restricting disclosure to my insurer: available for a service I pay for in full myself; not available for services provided at no charge. • No charge services: Vaccines for Children Program vaccines are free; the administration fee does not exceed the amount the program allows, and no child is refused a vaccine for inability to pay. HIV and hepatitis C screening are always free. • Telehealth Visits: Telehealth visits are documented and billed as clinical visits.</p>\n<h5 class=\"mt-3\">8. Notice Of Privacy Practices And Patient Rights</h5>\n<p>I received Prism&#x27;s Notice of Privacy Practices, a separate document that describes how my information is used and shared, my rights, and how to file a complaint. The law requires Prism to report certain results, such as a positive HIV or hepatitis C test or an elevated blood lead level, to public health authorities, and to report danger to any person or suspected abuse or neglect of a child or vulnerable adult. I may complain to Prism, the U.S. Department of Health and Human Services Office for Civil Rights, or the Illinois Department of Public Health without retaliation; Privacy Officer: compliance@prism.org, 800-325-1812. I may change any answer on this form at any time by telling a team member. This consent covers today&#x27;s visit and is renewed at each visit. Photography and recording by patients or visitors at Prism events is not permitted, to protect other patients.</p>", 10];

/** ConsentID, Section, Section Title, ItemID, Label, Note Label, DisplayOrder */
var CONSENT_ITEMS = [
  ["cfs20267", "1A", "Treatment", "treatment", "Treatment", "", 10],
  ["cfs20267", "1A", "Treatment", "trainees", "Trainees or observers", "", 20],
  ["cfs20267", "1B", "Laboratory testing", "hiv", "HIV screening", "", 30],
  ["cfs20267", "1B", "Laboratory testing", "hcv", "Hepatitis C screening", "", 40],
  ["cfs20267", "1B", "Laboratory testing", "holdresult", "Hold results for clinician review", "", 50],
  ["cfs20267", "1B", "Laboratory testing", "othertest", "Another test", "Which test?", 60],
  ["cfs20267", "1C", "Immunizations and registry", "hpv", "HPV vaccine", "", 70],
  ["cfs20267", "1C", "Immunizations and registry", "flu", "Flu vaccine", "", 80],
  ["cfs20267", "1C", "Immunizations and registry", "covid", "COVID-19 vaccine", "", 90],
  ["cfs20267", "1C", "Immunizations and registry", "othervax", "Another vaccine", "Which vaccine?", 100],
  ["cfs20267", "1C", "Immunizations and registry", "icare", "I-CARE reporting (non-mandatory)", "", 110],
  ["cfs20267", "1C", "Immunizations and registry", "icarelock", "Lock my existing I-CARE record", "", 120],
  ["cfs20267", "1D", "Telehealth follow-up", "telehealth", "Telehealth follow-up", "", 130],
  ["cfs20267", "2", "Communications and portal", "sms", "Text messages", "", 140],
  ["cfs20267", "2", "Communications and portal", "email", "Email", "", 150],
  ["cfs20267", "2", "Communications and portal", "autocalls", "Automated calls", "", 160],
  ["cfs20267", "2", "Communications and portal", "allcontact", "All contact (except an urgent result)", "", 170],
  ["cfs20267", "3", "Results to my doctor", "pcp", "Sending results to my doctor", "", 180],
  ["cfs20267", "4", "De-identified research", "research", "Contact about research", "", 190]
];

/**
 * QuestionID, and the field id printed on each paper form.
 *
 * The shared core asks each question once, but the printed forms number them
 * differently (A3.1 on the 0-3 form is A2.1 on the 12-17 form). The document
 * generators need this to fill the right box on the right sheet.
 */
var CORE_FIELD_MAP = [
  ["shccore-1", "shc0003", "A2.1"],
  ["shccore-1", "shc0411", "A2.1"],
  ["shccore-1", "shc1217", "A1.1"],
  ["shccore-2", "shcadult", "A1.1"],
  ["shccore-3", "shc0003", "A2.2"],
  ["shccore-3", "shc0411", "A2.2"],
  ["shccore-3", "shc1217", "A1.2"],
  ["shccore-4", "shc0003", "A2.3"],
  ["shccore-4", "shc0411", "A2.3"],
  ["shccore-4", "shc1217", "A1.3"],
  ["shccore-4", "shcadult", "A1.3"],
  ["shccore-5", "shc0003", "A3.1"],
  ["shccore-5", "shc0411", "A3.1"],
  ["shccore-5", "shc1217", "A2.1"],
  ["shccore-6", "shc0003", "A3.10"],
  ["shccore-6", "shc0411", "A3.10"],
  ["shccore-6", "shc1217", "A2.10"],
  ["shccore-6", "shcadult", "A2.8"],
  ["shccore-7", "shc0003", "A3.11"],
  ["shccore-7", "shc0411", "A3.11"],
  ["shccore-7", "shc1217", "A2.11"],
  ["shccore-7", "shcadult", "A2.9"],
  ["shccore-8", "shc0003", "A3.12"],
  ["shccore-8", "shc0411", "A3.12"],
  ["shccore-8", "shc1217", "A2.12"],
  ["shccore-9", "shcadult", "A2.10"],
  ["shccore-10", "shc0003", "A3.2"],
  ["shccore-10", "shc0411", "A3.2"],
  ["shccore-10", "shc1217", "A2.2"],
  ["shccore-11", "shc0003", "A3.3"],
  ["shccore-11", "shc0411", "A3.3"],
  ["shccore-11", "shc1217", "A2.3"],
  ["shccore-12", "shc0003", "A3.4"],
  ["shccore-12", "shc0411", "A3.4"],
  ["shccore-12", "shc1217", "A2.4"],
  ["shccore-13", "shc0003", "A3.5"],
  ["shccore-13", "shc0411", "A3.5"],
  ["shccore-13", "shc1217", "A2.5"],
  ["shccore-14", "shc0003", "A3.6"],
  ["shccore-14", "shc0411", "A3.6"],
  ["shccore-14", "shc1217", "A2.6"],
  ["shccore-15", "shc0003", "A3.7"],
  ["shccore-15", "shc0411", "A3.7"],
  ["shccore-15", "shc1217", "A2.7"],
  ["shccore-16", "shc0003", "A3.8"],
  ["shccore-16", "shc0411", "A3.8"],
  ["shccore-16", "shc1217", "A2.8"],
  ["shccore-17", "shc0003", "A3.9"],
  ["shccore-17", "shc0411", "A3.9"],
  ["shccore-17", "shc1217", "A2.9"],
  ["shccore-18", "shcadult", "A3.1"],
  ["shccore-19", "shc0003", "A4.1"],
  ["shccore-19", "shc0411", "A4.1"],
  ["shccore-19", "shc1217", "A3.1"],
  ["shccore-19", "shcadult", "A15.4"],
  ["shccore-20", "shc0003", "A4.2"],
  ["shccore-20", "shc0411", "A4.2"],
  ["shccore-20", "shc1217", "A3.2"],
  ["shccore-21", "shc0003", "A4.3"],
  ["shccore-21", "shc0411", "A4.3"],
  ["shccore-21", "shc1217", "A3.3"],
  ["shccore-22", "shc0003", "A4.4"],
  ["shccore-22", "shc0411", "A4.4"],
  ["shccore-22", "shc1217", "A3.4"],
  ["shccore-22", "shcadult", "A2.5"],
  ["shccore-23", "shc0003", "A4.5"],
  ["shccore-23", "shc0411", "A4.5"],
  ["shccore-23", "shc1217", "A3.5"],
  ["shccore-23", "shcadult", "A2.6"],
  ["shccore-24", "shc0003", "A4.6"],
  ["shccore-24", "shc0411", "A4.6"],
  ["shccore-24", "shc1217", "A3.6"],
  ["shccore-25", "shc0003", "A4.7"],
  ["shccore-25", "shc0411", "A4.7"],
  ["shccore-25", "shc1217", "A3.7"],
  ["shccore-26", "shc0003", "A5.1"],
  ["shccore-26", "shc0411", "A5.1"],
  ["shccore-26", "shc1217", "A4.1"],
  ["shccore-27", "shcadult", "A4.1"],
  ["shccore-28", "shc0003", "A5.2"],
  ["shccore-28", "shc0411", "A5.2"],
  ["shccore-28", "shc1217", "A4.2"],
  ["shccore-28", "shcadult", "A4.2"],
  ["shccore-29", "shc0003", "A5.3"],
  ["shccore-29", "shc0411", "A5.3"],
  ["shccore-29", "shc1217", "A4.3"],
  ["shccore-29", "shcadult", "A4.3"],
  ["shccore-30", "shc0003", "A5.4"],
  ["shccore-30", "shc0411", "A5.4"],
  ["shccore-30", "shc1217", "A4.4"],
  ["shccore-30", "shcadult", "A4.4"],
  ["shccore-31", "shc0003", "A5.5"],
  ["shccore-31", "shc0411", "A5.5"],
  ["shccore-31", "shc1217", "A4.5"],
  ["shccore-31", "shcadult", "A4.5"],
  ["shccore-32", "shc0003", "A5.6"],
  ["shccore-32", "shc0411", "A5.6"],
  ["shccore-32", "shc1217", "A4.6"],
  ["shccore-32", "shcadult", "A4.6"],
  ["shccore-33", "shc0003", "A5.7"],
  ["shccore-33", "shc0411", "A5.7"],
  ["shccore-33", "shc1217", "A4.7"],
  ["shccore-33", "shcadult", "A4.7"],
  ["shccore-34", "shc0003", "A5.8"],
  ["shccore-34", "shc0411", "A5.8"],
  ["shccore-34", "shc1217", "A4.8"],
  ["shccore-34", "shcadult", "A4.8"],
  ["shccore-35", "shc0003", "A5.9"],
  ["shccore-35", "shc0411", "A5.9"],
  ["shccore-35", "shc1217", "A4.9"],
  ["shccore-36", "shc0003", "A6.1"],
  ["shccore-36", "shc0411", "A6.1"],
  ["shccore-36", "shc1217", "A5.1"],
  ["shccore-37", "shc0003", "A6.2"],
  ["shccore-37", "shc0411", "A6.2"],
  ["shccore-37", "shc1217", "A5.2"],
  ["shccore-37", "shcadult", "A5.2"],
  ["shccore-38", "shc0003", "A6.3"],
  ["shccore-38", "shc0411", "A6.3"],
  ["shccore-38", "shc1217", "A5.3"],
  ["shccore-38", "shcadult", "A5.3"],
  ["shccore-39", "shc0003", "A6.4"],
  ["shccore-39", "shc0411", "A6.4"],
  ["shccore-39", "shc1217", "A5.4"],
  ["shccore-39", "shcadult", "A5.4"],
  ["shccore-40", "shc0003", "A6.5"],
  ["shccore-40", "shc0411", "A6.5"],
  ["shccore-40", "shc1217", "A5.5"],
  ["shccore-41", "shc0003", "A6.6"],
  ["shccore-41", "shc0411", "A6.6"],
  ["shccore-41", "shc1217", "A5.6"],
  ["shccore-41", "shcadult", "A5.6"],
  ["shccore-42", "shc0003", "A6.7"],
  ["shccore-42", "shc0411", "A6.7"],
  ["shccore-42", "shc1217", "A5.7"],
  ["shccore-42", "shcadult", "A5.7"],
  ["shccore-43", "shc0003", "A6.8"],
  ["shccore-43", "shc0411", "A6.8"],
  ["shccore-43", "shc1217", "A5.8"],
  ["shccore-43", "shcadult", "A5.8"],
  ["shccore-44", "shc0003", "A15.1"],
  ["shccore-44", "shc0411", "A16.1"],
  ["shccore-44", "shc1217", "A14.1"],
  ["shccore-45", "shc0003", "A15.2"],
  ["shccore-45", "shc0411", "A16.2"],
  ["shccore-45", "shc1217", "A14.2"],
  ["shccore-45", "shcadult", "A15.3"],
  ["shccore-46", "shc0003", "A15.3"],
  ["shccore-46", "shc0411", "A16.3"],
  ["shccore-46", "shc1217", "A14.3"],
  ["shccore-47", "shc0003", "A15.4"],
  ["shccore-47", "shc0411", "A16.4"],
  ["shccore-47", "shc1217", "A14.4"],
  ["shccore-47", "shcadult", "A15.5"],
  ["shccore-48", "shc0003", "A15.5"],
  ["shccore-48", "shc0411", "A16.5"],
  ["shccore-48", "shc1217", "A14.5"],
  ["shccore-49", "shc0003", "A15.6"],
  ["shccore-49", "shc0411", "A16.6"],
  ["shccore-49", "shc1217", "A14.6"],
  ["shccore-50", "shcadult", "A1.2"],
  ["shccore-51", "shcadult", "A2.1"],
  ["shccore-52", "shcadult", "A2.2"],
  ["shccore-53", "shcadult", "A2.3"],
  ["shccore-54", "shcadult", "A2.4"],
  ["shccore-55", "shcadult", "A2.7"],
  ["shccore-56", "shcadult", "A3.2"],
  ["shccore-57", "shcadult", "A3.3"],
  ["shccore-58", "shcadult", "A3.4"],
  ["shccore-59", "shcadult", "A5.1"],
  ["shccore-60", "shcadult", "A5.5"],
  ["shccore-61", "shcadult", "A15.1"],
  ["shccore-62", "shcadult", "A15.2"]
];

/** FormID, QuestionID, DisplayOrder, Text, Type, Options, Required, TriggerID, TriggerValue, Section */
var QUESTIONS = [
  ["shccore", "shccore-1", 10, "Filled out:", "multi_select", "At home by parent or guardian|By phone with a Prism team member|Online (e-sign link)|On paper at the visit", "N", "@age", "0-3|4-11|12-17", "How this form was filled out"],
  ["shccore", "shccore-2", 20, "Filled out:", "multi_select", "At home by me|By phone with a Prism team member|Online (e-sign link)|On paper at the visit", "N", "@age", "18+", "How this form was filled out"],
  ["shccore", "shccore-3", 30, "Best number to reach the parent on the visit day:", "text", "", "N", "@age", "0-3|4-11|12-17", "How this form was filled out"],
  ["shccore", "shccore-4", 40, "Returned by:", "multi_select", "Photo or upload (text link)|E-sign|Paper in the child's backpack|Handed in at the visit", "N", "", "", "How this form was filled out"],
  ["shccore", "shccore-50", 50, "Best number to reach you on the visit day:", "text", "", "N", "@age", "18+", "How this form was filled out"],
  ["shccore", "shccore-5", 60, "Child's middle name:", "text", "", "N", "@age", "0-3|4-11|12-17", "Today's visit"],
  ["shccore", "shccore-6", 70, "Race (optional):", "multi_select", "American Indian or Alaska Native|Asian|Black or African American|Native Hawaiian or Pacific Islander|White|More than one race|Prefer not to say", "N", "", "", "Today's visit"],
  ["shccore", "shccore-7", 80, "Ethnicity (optional):", "single_select", "Hispanic or Latino|Not Hispanic or Latino|Prefer not to say", "N", "", "", "Today's visit"],
  ["shccore", "shccore-8", 90, "Reason for visit:", "multi_select", "Check-up|Shots|Sick or a problem|School / sports form|Blood lead test|After hospital / ER / crisis", "N", "@age", "0-3|4-11|12-17", "Today's visit"],
  ["shccore", "shccore-9", 100, "Reason for visit:", "multi_select", "Check-up|School / sports / college form|Sick or a problem|Testing only (HIV, hep C, STI)|Mental health support|Pregnancy or after-baby care|After hospital / ER / crisis|BP, sugar, or cholesterol check", "N", "@age", "18+", "Today's visit"],
  ["shccore", "shccore-10", 110, "Name your child goes by:", "text", "", "N", "@age", "0-3|4-11|12-17", "Today's visit"],
  ["shccore", "shccore-11", 120, "Child's school and grade:", "text", "", "N", "@age", "0-3|4-11|12-17", "Today's visit"],
  ["shccore", "shccore-12", 130, "Student ID number:", "text", "", "N", "@age", "0-3|4-11|12-17", "Today's visit"],
  ["shccore", "shccore-13", 140, "School nurse name and fax or phone:", "text", "", "N", "@age", "0-3|4-11|12-17", "Today's visit"],
  ["shccore", "shccore-14", 150, "Child's regular doctor or clinic (name, phone or fax):", "text", "", "N", "@age", "0-3|4-11|12-17", "Today's visit"],
  ["shccore", "shccore-15", 160, "Mother's name (or second parent or guardian):", "text", "", "N", "@age", "0-3|4-11|12-17", "Today's visit"],
  ["shccore", "shccore-16", 170, "Child's birth state and country:", "text", "", "N", "@age", "0-3|4-11|12-17", "Today's visit"],
  ["shccore", "shccore-17", 180, "Sex at birth:", "single_select", "Girl|Boy", "N", "@age", "0-3|4-11|12-17", "Today's visit"],
  ["shccore", "shccore-18", 190, "Sex at birth:", "single_select", "Female|Male|Intersex|Decline to answer", "N", "@age", "18+", "Today's visit"],
  ["shccore", "shccore-51", 200, "Middle name:", "text", "", "N", "@age", "18+", "Today's visit"],
  ["shccore", "shccore-52", 210, "Name you go by:", "text", "", "N", "@age", "18+", "Today's visit"],
  ["shccore", "shccore-53", 220, "Regular doctor or clinic (name, phone or fax):", "text", "", "N", "@age", "18+", "Today's visit"],
  ["shccore", "shccore-54", 230, "School or employer, if this visit is for a school or work form:", "text", "", "N", "@age", "18+", "Today's visit"],
  ["shccore", "shccore-55", 240, "Is this visit related to a work injury or an accident?", "single_select", "No|Yes, work|Yes, auto|Yes, other", "N", "@age", "18+", "Today's visit"],
  ["shccore", "shccore-56", 250, "Gender identity:", "single_select", "Woman|Man|Non-binary|Trans man|Trans woman|Two Spirit", "N", "@age", "18+", "About you"],
  ["shccore", "shccore-57", 260, "Sexual orientation:", "single_select", "Straight|Gay|Lesbian|Queer|Bisexual|Questioning", "N", "@age", "18+", "About you"],
  ["shccore", "shccore-58", 270, "Disabilities:", "multi_select", "None|Blind or low vision|Deaf or hard of hearing|Medical|Physical", "N", "@age", "18+", "About you"],
  ["shccore", "shccore-19", 280, "Your name (print):", "text", "", "N", "", "", "Parent or guardian filling this out"],
  ["shccore", "shccore-20", 290, "Relationship to child:", "text", "", "N", "@age", "0-3|4-11|12-17", "Parent or guardian filling this out"],
  ["shccore", "shccore-21", 300, "Second household contact (name, phone):", "text", "", "N", "@age", "0-3|4-11|12-17", "Parent or guardian filling this out"],
  ["shccore", "shccore-22", 310, "Emergency contact (name, phone):", "text", "", "N", "", "", "Parent or guardian filling this out"],
  ["shccore", "shccore-23", 320, "Preferred pharmacy (name, location):", "text", "", "N", "", "", "Parent or guardian filling this out"],
  ["shccore", "shccore-24", 330, "Are you the child's legal guardian?", "single_select", "Yes|No. Guardian name and phone: ________", "N", "@age", "0-3|4-11|12-17", "Parent or guardian filling this out"],
  ["shccore", "shccore-25", 340, "Patient portal:", "single_select", "Sign me up; email: ______________|Already have it|No thank you", "N", "@age", "0-3|4-11|12-17", "Parent or guardian filling this out"],
  ["shccore", "shccore-26", 350, "Type:", "single_select", "Medicaid / All Kids|Private|None or not sure|Prefer not to say", "Y", "@age", "0-3|4-11|12-17", "Insurance"],
  ["shccore", "shccore-27", 360, "Type:", "single_select", "Medicare|Medicaid|CHIP / All Kids|VA / TriCare|Private|None or not sure|Prefer not to say", "Y", "@age", "18+", "Insurance"],
  ["shccore", "shccore-28", 370, "If Medicaid, which plan?", "single_select", "CountyCare|Meridian|Molina|Aetna Better Health|BCBS Community|YouthCare|Not sure", "N", "", "", "Insurance"],
  ["shccore", "shccore-29", 380, "Plan name:", "text", "", "N", "", "", "Insurance"],
  ["shccore", "shccore-30", 390, "Member ID:", "text", "", "N", "", "", "Insurance"],
  ["shccore", "shccore-31", 400, "Medicaid recipient ID (RIN), if different:", "text", "", "N", "", "", "Insurance"],
  ["shccore", "shccore-32", 410, "Name on the card:", "text", "", "N", "", "", "Insurance"],
  ["shccore", "shccore-33", 420, "Cardholder date of birth:", "text", "", "N", "", "", "Insurance"],
  ["shccore", "shccore-34", 430, "Any other health insurance?", "single_select", "No|Yes: plan ______________  policyholder ______________", "N", "", "", "Insurance"],
  ["shccore", "shccore-35", 440, "For free vaccines (Vaccines for Children), the child:", "single_select", "Has Medicaid or All Kids|Has no insurance|Is American Indian or Alaska Native|Has insurance that does not cover vaccines|None of these", "N", "@age", "0-3|4-11|12-17", "Insurance"],
  ["shccore", "shccore-36", 450, "Child's Medicaid renewal due:", "single_select", "Don't know|Date: ______|Child has no Medicaid", "N", "@age", "0-3|4-11|12-17", "Keeping Medicaid coverage"],
  ["shccore", "shccore-37", 460, "Last renewal letter said:", "single_select", "Nothing to do (Form A)|I must respond (Form B)|Asking me for proof of work or an exemption (answer within 30 days)|Not opened yet|Not sure", "N", "", "", "Keeping Medicaid coverage"],
  ["shccore", "shccore-38", 470, "Moved or new phone this year?", "single_select", "No|Yes, please help me update the State", "N", "", "", "Keeping Medicaid coverage"],
  ["shccore", "shccore-39", 480, "ABE Manage My Case account?", "single_select", "No|Yes|Not sure", "N", "", "", "Keeping Medicaid coverage"],
  ["shccore", "shccore-40", 490, "Parent's Medicaid letter says the group is:", "single_select", "FamilyCare|ACA Adult|Other group or none|Not sure", "N", "@age", "0-3|4-11|12-17", "Keeping Medicaid coverage"],
  ["shccore", "shccore-41", 500, "If ACA Adult: in any one month since your last renewal, did you:", "single_select", "Earn $580 or more|Work, volunteer, or school 80 hours|Attend school at least half time|None of these", "N", "", "", "Keeping Medicaid coverage"],
  ["shccore", "shccore-42", 510, "If none, check any that fit:", "multi_select", "Caring for a child or a disabled person|Pregnant, or had a baby (or lost a pregnancy) in last 12 months|Medical condition, disability, or serious mental illness limits work|In drug or alcohol treatment|Veteran with 100% disability|Former foster youth under 26|Turned 19, or left jail, in last 3 months|Hospital or nursing home stay recently", "N", "", "", "Keeping Medicaid coverage"],
  ["shccore", "shccore-43", 520, "If Medicaid ends, help you would like:", "multi_select", "HFS Family Planning Program (STI and HIV tests, birth control, vaccines, Paps, mammograms)|Community health center with a sliding fee|Hospital charity care|Marketplace plan|Not needed", "N", "", "", "Keeping Medicaid coverage"],
  ["shccore", "shccore-59", 530, "Your Medicaid renewal due:", "single_select", "Don't know|Date: ______|No Medicaid", "N", "@age", "18+", "Keeping Medicaid coverage"],
  ["shccore", "shccore-60", 540, "Your Medicaid letter says the group is:", "single_select", "ACA Adult|FamilyCare, AABD, Moms & Babies, or other|Not sure", "N", "@age", "18+", "Keeping Medicaid coverage"],
  ["shccore", "shccore-63", 550, "Best way to reach you for follow-up:", "single_select", "Phone|Text|Video", "N", "", "", "Reaching you about results"],
  ["shccore", "shccore-64", 560, "Best days and times to reach you:", "text", "", "N", "", "", "Reaching you about results"],
  ["shccore", "shccore-44", 570, "May Prism send the school health form and shot record to the school?", "single_select", "Yes|No, I will deliver it myself", "N", "@age", "0-3|4-11|12-17", "Sharing and your signature"],
  ["shccore", "shccore-45", 580, "Anything else you'd like us to know?", "text_area", "", "N", "", "", "Sharing and your signature"],
  ["shccore", "shccore-46", 590, "Parent or guardian (print):", "text", "", "N", "@age", "0-3|4-11|12-17", "Sharing and your signature"],
  ["shccore", "shccore-47", 600, "Signature and date:", "text", "", "N", "", "", "Sharing and your signature"],
  ["shccore", "shccore-48", 610, "Phone interview: Prism staff name, date, time (if by phone):", "text", "", "N", "@age", "0-3|4-11|12-17", "Sharing and your signature"],
  ["shccore", "shccore-49", 620, "Parent read-back confirmed (staff initials):", "text", "", "N", "@age", "0-3|4-11|12-17", "Sharing and your signature"],
  ["shccore", "shccore-61", 630, "Right now, are you having any thoughts of hurting yourself?", "single_select", "No|Yes", "N", "@age", "18+", "Sharing and your signature"],
  ["shccore", "shccore-62", 640, "May Prism send the physical or shot record to your school or college?", "single_select", "Yes|No, I will deliver it myself|Does not apply", "N", "@age", "18+", "Sharing and your signature"],
  ["shc0003", "shc0003-1", 101, "Is your child under 3 and did they miss the 9 to 12 month or 24 month test? OR is your child 3 to 6 and never tested?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-2", 102, "Since the last check, moved to, or often visits, a building built before 1978?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-3", 103, "Been around repairs, repainting, or remodeling of a building built before 1978?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-4", 104, "Often around anyone whose job or hobby involves lead (construction, painting, plumbing, batteries, guns, fishing weights)?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-5", 105, "Often around traditional medicines, spices, candy, toys, pottery, powders, or cosmetics (Kohl, Kajal, Surma, Sindoor, KumKum) from other countries?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-6", 106, "Spent a lot of time outside the U.S.?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-7", 107, "In a home, school, or child care where water tested at or above 5 ppb for lead?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-8", 108, "Lives near a smelter, battery plant, other lead industry, or a very busy road?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-9", 109, "Does your child live in Chicago?", "radio_yes_no", "Yes|No", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-10", 110, "Date of your child's last lead test, if known:", "text", "", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-11", 111, "Do you agree to a blood lead test at the visit if one is needed?", "single_select", "Yes|No, I'd like to talk to the provider first", "N", "", "", "Illinois lead risk questions"],
  ["shc0003", "shc0003-12", 712, "Takes any of these:", "multi_select", "None|Asthma inhaler or nebulizer|Other daily medicine", "N", "", "", "Your child's health"],
  ["shc0003", "shc0003-13", 713, "Allergies to medicines?", "single_select", "No|Yes: ______________", "N", "", "", "Your child's health"],
  ["shc0003", "shc0003-14", 714, "Medicines your child takes now (name and how often), or write \"none\":", "text_area", "", "N", "", "", "Your child's health"],
  ["shc0003", "shc0003-15", 715, "Past surgeries or hospital stays (what, and about what year), and details for anything you checked above:", "text_area", "", "N", "", "", "Your child's health"],
  ["shc0003", "shc0003-16", 816, "Born before 37 weeks?", "single_select", "No|Yes, at ____ weeks|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0003", "shc0003-17", 817, "Problems during pregnancy or birth?", "single_select", "No|Yes: ______________|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0003", "shc0003-18", 818, "Feeding now:", "single_select", "Breast|Formula|Both|Table food", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0003", "shc0003-19", 819, "Any worries about how your child talks, walks, plays, learns, or behaves?", "single_select", "No|A few|Yes, I'd like to talk", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0003", "shc0003-20", 820, "In Early Intervention, an IEP, or a 504 plan?", "single_select", "No|Yes: ________|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0003", "shc0003-21", 821, "How many check-ups since birth?", "text", "________    ☐ Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0003", "shc0003-22", 822, "Had a check-up or a school or sports physical this year?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0003", "shc0003-23", 823, "Who did that visit?", "single_select", "Regular doctor|Somewhere else: ________|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0003", "shc0003-24", 924, "Has a dentist, or a dentist visit planned by age 1?", "single_select", "No|Yes|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0003", "shc0003-25", 925, "Ever had a blood lead test?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0003", "shc0003-26", 926, "Lives in or often visits a home built before 1978?", "single_select", "No|Yes|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0003", "shc0003-27", 927, "Born outside the U.S., or hepatitis B in the home?", "single_select", "No|Yes|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0003", "shc0003-28", 928, "Any worry about how your child sees or hears?", "single_select", "No|Yes: ______________", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0003", "shc0003-29", 1029, "Are your child's shots up to date, as far as you know?", "single_select", "Yes|No|Not sure|We don't vaccinate", "N", "", "", "Shots (vaccines)"],
  ["shc0003", "shc0003-30", 1030, "Shot record with you today?", "single_select", "Paper|On my phone|No|With another clinic", "N", "", "", "Shots (vaccines)"],
  ["shc0003", "shc0003-31", 1031, "Ever a reaction to a shot?", "single_select", "No|Yes: ________|Not sure", "N", "", "", "Shots (vaccines)"],
  ["shc0003", "shc0003-32", 1032, "Clinic that has the shot record:", "text", "", "N", "", "", "Shots (vaccines)"],
  ["shc0003", "shc0003-33", 1033, "City and state:", "text", "", "N", "", "", "Shots (vaccines)"],
  ["shc0003", "shc0003-34", 1034, "Shots you know your child still needs, or would like today:", "text", "", "N", "", "", "Shots (vaccines)"],
  ["shc0003", "shc0003-35", 1135, "Does anyone smoke or vape in the home?", "single_select", "No|Yes|Around the child, not at home", "N", "", "", "Family health history"],
  ["shc0003", "shc0003-36", 1136, "Who lives with the child?", "text", "", "N", "", "", "Family health history"],
  ["shc0003", "shc0003-37", 1237, "Feelings and behavior lately:", "single_select", "Doing well|Some ups and downs|I have concerns", "N", "", "", "How your child is doing"],
  ["shc0003", "shc0003-38", 1238, "Any big changes at home?", "single_select", "No|Yes", "N", "", "", "How your child is doing"],
  ["shc0003", "shc0003-39", 1239, "Sleeping and eating:", "single_select", "Fine|Some issues|I have concerns", "N", "", "", "How your child is doing"],
  ["shc0003", "shc0003-40", 1240, "Anything you'd like the provider to know?", "text", "", "N", "", "", "How your child is doing"],
  ["shc0003", "shc0003-41", 1341, "Any of these in the last 30 days?", "multi_select", "No|Hospital stay: mental health|ER visit: mental health|Hospital or ER: alcohol or drugs|Detox or live-in program|Mobile crisis team came|Hospital or ER: medical or surgical", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc0003", "shc0003-42", 1342, "Date left, or date of the visit:", "text", "", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc0003", "shc0003-43", 1343, "Hospital name and city:", "text", "", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc0003", "shc0003-44", 1344, "Seen anyone for follow-up since then?", "single_select", "No|Yes, who and when: ______________", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc0003", "shc0003-45", 1345, "Does your child have a mental health provider now?", "single_select", "No|Yes, who: ______________", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc0003", "shc0003-46", 1446, "In the past 12 months, has the electric, gas, oil, or water company threatened to shut off services in your home?", "single_select", "No|Yes|Already shut off", "N", "", "", "Home safety"],
  ["shc0003", "shc0003-47", 1447, "How hard is it to pay for basics like food, housing, and heat?", "single_select", "Not hard|A little|Somewhat|Hard|Very hard", "N", "", "", "Home safety"],
  ["shc0003", "shc0003-48", 1448, "Want help with school, GED, or job training, for you or your child?", "single_select", "No|Yes|Not now", "N", "", "", "Home safety"],
  ["shc0003", "shc0003-49", 1449, "Do you feel safe at home?", "single_select", "Yes|No|I'd like to talk in private|Prefer not to say", "N", "", "", "Home safety"],
  ["shc0003", "shc0003-50", 1450, "Do you have people you can turn to for help?", "single_select", "Plenty|A few|Almost no one", "N", "", "", "Home safety"],
  ["shc0003", "shc0003-51", 1451, "Any guns in the home?", "single_select", "No|Yes, locked and unloaded|Yes, other|Prefer not to say", "N", "", "", "Home safety"],
  ["shc0003", "shc0003-52", 1452, "Does the baby sleep on their back in their own crib or bassinet?", "single_select", "Yes|No|N/A", "N", "", "", "Home safety"],
  ["shc0003", "shc0003-53", 1453, "Car seat used every ride?", "single_select", "No|Yes", "N", "", "", "Home safety"],
  ["shc0411", "shc0411-1", 101, "Is your child under 3 and did they miss the 9 to 12 month or 24 month test? OR is your child 3 to 6 and never tested?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-2", 102, "Since the last check, moved to, or often visits, a building built before 1978?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-3", 103, "Been around repairs, repainting, or remodeling of a building built before 1978?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-4", 104, "Often around anyone whose job or hobby involves lead (construction, painting, plumbing, batteries, guns, fishing weights)?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-5", 105, "Often around traditional medicines, spices, candy, toys, pottery, powders, or cosmetics (Kohl, Kajal, Surma, Sindoor, KumKum) from other countries?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-6", 106, "Spent a lot of time outside the U.S.?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-7", 107, "In a home, school, or child care where water tested at or above 5 ppb for lead?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-8", 108, "Lives near a smelter, battery plant, other lead industry, or a very busy road?", "scored", "Yes|No|Don't know", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-9", 109, "Does your child live in Chicago?", "radio_yes_no", "Yes|No", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-10", 110, "Date of your child's last lead test, if known:", "text", "", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-11", 111, "Do you agree to a blood lead test at the visit if one is needed?", "single_select", "Yes|No, I'd like to talk to the provider first", "N", "", "", "Illinois lead risk questions"],
  ["shc0411", "shc0411-12", 712, "ADHD medicine (Adderall, Ritalin, Concerta, Vyvanse, Focalin, Strattera, guanfacine, clonidine):", "single_select", "No|Yes, started: ______|Check-up since starting: ☐ No ☐ Yes", "N", "", "", "Your child's health"],
  ["shc0411", "shc0411-13", 713, "Mood, anxiety, or behavior medicine (Risperdal, Abilify, Seroquel, Zyprexa, other):", "single_select", "No|Yes: ______|Ever had counseling or therapy for this: ☐ No ☐ Yes ☐ Not sure", "N", "", "", "Your child's health"],
  ["shc0411", "shc0411-14", 714, "Asthma inhaler:", "single_select", "None|Every day (controller)|As needed (rescue)|Both|Not sure which", "N", "", "", "Your child's health"],
  ["shc0411", "shc0411-15", 715, "Allergies to medicines?", "single_select", "No|Yes: ______________", "N", "", "", "Your child's health"],
  ["shc0411", "shc0411-16", 716, "Medicines your child takes now (name and how often), or write \"none\":", "text_area", "", "N", "", "", "Your child's health"],
  ["shc0411", "shc0411-17", 717, "Past surgeries or hospital stays (what, and about what year), and details for anything you checked above:", "text_area", "", "N", "", "", "Your child's health"],
  ["shc0411", "shc0411-18", 818, "Any worries about how your child talks, walks, plays, learns, or behaves?", "single_select", "No|A few|Yes, I'd like to talk", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0411", "shc0411-19", 819, "In Early Intervention, an IEP, or a 504 plan?", "single_select", "No|Yes: ________|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0411", "shc0411-20", 820, "Had a check-up or a school or sports physical this year?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0411", "shc0411-21", 821, "Who did that visit?", "single_select", "Regular doctor|Somewhere else: ________|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc0411", "shc0411-22", 922, "Dentist in the last 12 months?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0411", "shc0411-23", 923, "Tooth pain now?", "single_select", "No|Yes", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0411", "shc0411-24", 924, "Ever had a blood lead test?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0411", "shc0411-25", 925, "Lives in or often visits a home built before 1978?", "single_select", "No|Yes|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0411", "shc0411-26", 926, "Born outside the U.S., or hepatitis B in the home?", "single_select", "No|Yes|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0411", "shc0411-27", 927, "Glasses or contacts?", "single_select", "No|Yes", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0411", "shc0411-28", 928, "Any concern about seeing or hearing?", "single_select", "No|Yes: ______________", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0411", "shc0411-29", 929, "Ages 4 to 5: lazy eye or crossed eye?", "single_select", "No|Yes|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc0411", "shc0411-30", 1030, "Are your child's shots up to date, as far as you know?", "single_select", "Yes|No|Not sure|We don't vaccinate", "N", "", "", "Shots (vaccines)"],
  ["shc0411", "shc0411-31", 1031, "Shot record with you today?", "single_select", "Paper|On my phone|No|With another clinic", "N", "", "", "Shots (vaccines)"],
  ["shc0411", "shc0411-32", 1032, "Ever a reaction to a shot?", "single_select", "No|Yes: ________|Not sure", "N", "", "", "Shots (vaccines)"],
  ["shc0411", "shc0411-33", 1033, "Had chickenpox (the illness)?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Shots (vaccines)"],
  ["shc0411", "shc0411-34", 1034, "HPV shot today if it is due (age 9 and up)?", "single_select", "Yes|No|I'd like to talk to the provider first", "N", "", "", "Shots (vaccines)"],
  ["shc0411", "shc0411-35", 1035, "Clinic that has the shot record:", "text", "", "N", "", "", "Shots (vaccines)"],
  ["shc0411", "shc0411-36", 1036, "City and state:", "text", "", "N", "", "", "Shots (vaccines)"],
  ["shc0411", "shc0411-37", 1037, "Shots you know your child still needs, or would like today:", "text", "", "N", "", "", "Shots (vaccines)"],
  ["shc0411", "shc0411-38", 1138, "Does anyone smoke or vape in the home?", "single_select", "No|Yes|Around the child, not at home", "N", "", "", "Family health history"],
  ["shc0411", "shc0411-39", 1139, "Who lives with the child?", "text", "", "N", "", "", "Family health history"],
  ["shc0411", "shc0411-40", 1240, "Fidgety, unable to sit still", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-41", 1241, "Feels sad, unhappy", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-42", 1242, "Daydreams too much", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-43", 1243, "Refuses to share", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-44", 1244, "Does not understand other people's feelings", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-45", 1245, "Feels hopeless", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-46", 1246, "Has trouble concentrating", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-47", 1247, "Fights with other children", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-48", 1248, "Is down on him or herself", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-49", 1249, "Blames others for his or her troubles", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-50", 1250, "Seems to be having less fun", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-51", 1251, "Does not listen to rules", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-52", 1252, "Acts as if driven by a motor", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-53", 1253, "Teases others", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-54", 1254, "Worries a lot", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-55", 1255, "Takes things that do not belong to him or her", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-56", 1256, "Distracts easily", "scored", "Never|Sometimes|Often", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-57", 1257, "Any big changes at home (move, new baby, separation, loss)?", "single_select", "No|Yes", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-58", 1258, "Sleeping and eating:", "single_select", "Fine|Some issues|I have concerns", "N", "", "", "How your child is doing: Pediatric Symptom Checklist (PSC-17)"],
  ["shc0411", "shc0411-59", 1359, "Nervous, anxious, or on edge", "scored", "Not at all|Several days|More than half the days|Nearly every day", "N", "", "", "For children 8 to 11"],
  ["shc0411", "shc0411-60", 1360, "Down, sad, or not interested in things", "scored", "Not at all|Several days|More than half the days|Nearly every day", "N", "", "", "For children 8 to 11"],
  ["shc0411", "shc0411-61", 1361, "Anything you'd like the provider to know?", "text", "", "N", "", "", "For children 8 to 11"],
  ["shc0411", "shc0411-62", 1462, "Any of these in the last 30 days?", "multi_select", "No|Hospital stay: mental health|ER visit: mental health|Hospital or ER: alcohol or drugs|Detox or live-in program|Mobile crisis team came|Hospital or ER: medical or surgical", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc0411", "shc0411-63", 1463, "Date left, or date of the visit:", "text", "", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc0411", "shc0411-64", 1464, "Hospital name and city:", "text", "", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc0411", "shc0411-65", 1465, "Seen anyone for follow-up since then?", "single_select", "No|Yes, who and when: ______________", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc0411", "shc0411-66", 1466, "Does your child have a mental health provider now?", "single_select", "No|Yes, who: ______________", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc0411", "shc0411-67", 1567, "In the past 12 months, has the electric, gas, oil, or water company threatened to shut off services in your home?", "single_select", "No|Yes|Already shut off", "N", "", "", "Home safety"],
  ["shc0411", "shc0411-68", 1568, "How hard is it to pay for basics like food, housing, and heat?", "single_select", "Not hard|A little|Somewhat|Hard|Very hard", "N", "", "", "Home safety"],
  ["shc0411", "shc0411-69", 1569, "Want help with school, GED, or job training, for you or your child?", "single_select", "No|Yes|Not now", "N", "", "", "Home safety"],
  ["shc0411", "shc0411-70", 1570, "Do you feel safe at home?", "single_select", "Yes|No|I'd like to talk in private|Prefer not to say", "N", "", "", "Home safety"],
  ["shc0411", "shc0411-71", 1571, "Do you have people you can turn to for help?", "single_select", "Plenty|A few|Almost no one", "N", "", "", "Home safety"],
  ["shc0411", "shc0411-72", 1572, "Any guns in the home?", "single_select", "No|Yes, locked and unloaded|Yes, other|Prefer not to say", "N", "", "", "Home safety"],
  ["shc1217", "shc1217-1", 601, "ADHD medicine (Adderall, Ritalin, Concerta, Vyvanse, Focalin, Strattera, guanfacine, clonidine):", "single_select", "No|Yes, started: ______|Check-up since starting: ☐ No ☐ Yes", "N", "", "", "Your child's health"],
  ["shc1217", "shc1217-2", 602, "Mood, anxiety, or behavior medicine (Risperdal, Abilify, Seroquel, Zyprexa, other):", "single_select", "No|Yes: ______|Ever had counseling or therapy for this: ☐ No ☐ Yes ☐ Not sure", "N", "", "", "Your child's health"],
  ["shc1217", "shc1217-3", 603, "Asthma inhaler:", "single_select", "None|Every day (controller)|As needed (rescue)|Both|Not sure which", "N", "", "", "Your child's health"],
  ["shc1217", "shc1217-4", 604, "Allergies to medicines?", "single_select", "No|Yes: ______________", "N", "", "", "Your child's health"],
  ["shc1217", "shc1217-5", 605, "Medicines your child takes now (name and how often), or write \"none\":", "text_area", "", "N", "", "", "Your child's health"],
  ["shc1217", "shc1217-6", 606, "Past surgeries or hospital stays (what, and about what year), and details for anything you checked above:", "text_area", "", "N", "", "", "Your child's health"],
  ["shc1217", "shc1217-7", 707, "Any worries about how your child talks, walks, plays, learns, or behaves?", "single_select", "No|A few|Yes, I'd like to talk", "N", "", "", "Birth, growth, and check-ups"],
  ["shc1217", "shc1217-8", 708, "In Early Intervention, an IEP, or a 504 plan?", "single_select", "No|Yes: ________|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc1217", "shc1217-9", 709, "Had a check-up or a school or sports physical this year?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc1217", "shc1217-10", 710, "Who did that visit?", "single_select", "Regular doctor|Somewhere else: ________|Not sure", "N", "", "", "Birth, growth, and check-ups"],
  ["shc1217", "shc1217-11", 811, "Dentist in the last 12 months?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc1217", "shc1217-12", 812, "Tooth pain now?", "single_select", "No|Yes", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc1217", "shc1217-13", 813, "Braces or dental device?", "single_select", "No|Yes", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc1217", "shc1217-14", 814, "Ever had a blood lead test?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc1217", "shc1217-15", 815, "Lives in or often visits a home built before 1978?", "single_select", "No|Yes|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc1217", "shc1217-16", 816, "Born outside the U.S., or hepatitis B in the home?", "single_select", "No|Yes|Not sure", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc1217", "shc1217-17", 817, "Glasses or contacts?", "single_select", "No|Yes", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc1217", "shc1217-18", 818, "Any concern about seeing or hearing?", "single_select", "No|Yes: ______________", "N", "", "", "Teeth, lead, eyes, and ears"],
  ["shc1217", "shc1217-19", 919, "Are your child's shots up to date, as far as you know?", "single_select", "Yes|No|Not sure|We don't vaccinate", "N", "", "", "Shots (vaccines)"],
  ["shc1217", "shc1217-20", 920, "Shot record with you today?", "single_select", "Paper|On my phone|No|With another clinic", "N", "", "", "Shots (vaccines)"],
  ["shc1217", "shc1217-21", 921, "Ever a reaction to a shot?", "single_select", "No|Yes: ________|Not sure", "N", "", "", "Shots (vaccines)"],
  ["shc1217", "shc1217-22", 922, "Had chickenpox (the illness)?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Shots (vaccines)"],
  ["shc1217", "shc1217-23", 923, "HPV shot today if it is due (age 9 and up)?", "single_select", "Yes|No|I'd like to talk to the provider first", "N", "", "", "Shots (vaccines)"],
  ["shc1217", "shc1217-24", 924, "Clinic that has the shot record:", "text", "", "N", "", "", "Shots (vaccines)"],
  ["shc1217", "shc1217-25", 925, "City and state:", "text", "", "N", "", "", "Shots (vaccines)"],
  ["shc1217", "shc1217-26", 926, "Shots you know your child still needs, or would like today:", "text", "", "N", "", "", "Shots (vaccines)"],
  ["shc1217", "shc1217-27", 1027, "Does anyone smoke or vape in the home?", "single_select", "No|Yes|Around the child, not at home", "N", "", "", "Family health history"],
  ["shc1217", "shc1217-28", 1028, "Who lives with the child?", "text", "", "N", "", "", "Family health history"],
  ["shc1217", "shc1217-29", 1129, "How is your teen doing with feelings and behavior lately?", "single_select", "Doing well|Some ups and downs|I have concerns", "N", "", "", "About your teen"],
  ["shc1217", "shc1217-30", 1130, "Any big changes at home?", "single_select", "No|Yes", "N", "", "", "About your teen"],
  ["shc1217", "shc1217-31", 1131, "Anything you would like the provider to know?", "text", "", "N", "", "", "About your teen"],
  ["shc1217", "shc1217-32", 1232, "Any of these in the last 30 days?", "multi_select", "No|Hospital stay: mental health|ER visit: mental health|Hospital or ER: alcohol or drugs|Detox or live-in program|Mobile crisis team came|Hospital or ER: medical or surgical", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc1217", "shc1217-33", 1233, "Date left, or date of the visit:", "text", "", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc1217", "shc1217-34", 1234, "Hospital name and city:", "text", "", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc1217", "shc1217-35", 1235, "Seen anyone for follow-up since then?", "single_select", "No|Yes, who and when: ______________", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc1217", "shc1217-36", 1236, "Does your child have a mental health provider now?", "single_select", "No|Yes, who: ______________", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shc1217", "shc1217-37", 1337, "In the past 12 months, has the electric, gas, oil, or water company threatened to shut off services in your home?", "single_select", "No|Yes|Already shut off", "N", "", "", "Home safety"],
  ["shc1217", "shc1217-38", 1338, "How hard is it to pay for basics like food, housing, and heat?", "single_select", "Not hard|A little|Somewhat|Hard|Very hard", "N", "", "", "Home safety"],
  ["shc1217", "shc1217-39", 1339, "Want help with school, GED, or job training, for you or your child?", "single_select", "No|Yes|Not now", "N", "", "", "Home safety"],
  ["shc1217", "shc1217-40", 1340, "Do you feel safe at home?", "single_select", "Yes|No|I'd like to talk in private|Prefer not to say", "N", "", "", "Home safety"],
  ["shc1217", "shc1217-41", 1341, "Do you have people you can turn to for help?", "single_select", "Plenty|A few|Almost no one", "N", "", "", "Home safety"],
  ["shc1217", "shc1217-42", 1342, "Any guns in the home?", "single_select", "No|Yes, locked and unloaded|Yes, other|Prefer not to say", "N", "", "", "Home safety"],
  ["shcadult", "shcadult-1", 601, "Medicine status:", "single_select", "Taking as prescribed|Missed doses|Can't refill or afford|Stopped", "N", "", "", "Your health"],
  ["shcadult", "shcadult-2", 602, "Allergies to medicines?", "single_select", "No|Yes: ______________", "N", "", "", "Your health"],
  ["shcadult", "shcadult-3", 603, "Could you be pregnant?", "single_select", "No|Yes|Not sure|N/A", "N", "", "", "Your health"],
  ["shcadult", "shcadult-4", 604, "Do you use any drugs not prescribed to you?", "single_select", "No|Yes|Prefer not to say", "N", "", "", "Your health"],
  ["shcadult", "shcadult-5", 605, "In the last 12 months, used:", "multi_select", "None|Heroin|Fentanyl|Pain pills not as prescribed|Methadone or bupe not prescribed|Meth or cocaine", "N", "", "", "Your health"],
  ["shcadult", "shcadult-6", 606, "Ever overdosed?", "single_select", "No|Yes, ____ times", "N", "", "", "Your health"],
  ["shcadult", "shcadult-7", 607, "Do you have naloxone (Narcan)?", "single_select", "No|Yes", "N", "", "", "Your health"],
  ["shcadult", "shcadult-8", 608, "On medicine for opioid use?", "single_select", "No|Suboxone / buprenorphine|Methadone|Vivitrol / naltrexone", "N", "", "", "Your health"],
  ["shcadult", "shcadult-9", 609, "Want to start medicine for opioid use today?", "single_select", "No|Yes|Tell me more", "N", "", "", "Your health"],
  ["shcadult", "shcadult-10", 610, "Medicines you take now (name and how often), or \"see my list\"; past surgeries or hospital stays; cancer details:", "text_area", "", "N", "", "", "Your health"],
  ["shcadult", "shcadult-11", 611, "Work you do:", "text", "", "N", "", "", "Your health"],
  ["shcadult", "shcadult-12", 612, "Who lives with you:", "text", "", "N", "", "", "Your health"],
  ["shcadult", "shcadult-13", 713, "Which relative, and age if known:", "text", "", "N", "", "", "Family health history"],
  ["shcadult", "shcadult-14", 814, "Check-up with your doctor this year?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-15", 815, "Last blood pressure check:", "single_select", "Never / not sure|When: ______", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-16", 816, "Last blood sugar or A1c check:", "single_select", "Never / not sure|When: ______", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-17", 817, "Last cholesterol check:", "single_select", "Never / not sure|When: ______", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-18", 818, "HIV test ever (15 to 65, once)?", "single_select", "No|Yes, when: ______|I want one today", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-19", 819, "Hepatitis C test ever (18 to 79, once)?", "single_select", "No|Yes, when: ______|I want one today", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-20", 820, "Dentist in the last 12 months?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-21", 821, "Eye exam (yearly if you have diabetes)?", "single_select", "No|Yes, when: ______|Not sure", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-22", 822, "Type and last A1c:", "single_select", "Type 1|Type 2|Not sure|A1c ____ % on ______", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-23", 823, "In the last year:", "multi_select", "Dilated eye exam|Urine kidney test|Taking a statin|None", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-24", 824, "Last Pap test:", "single_select", "Never|N/A (no cervix)|When: ______", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-25", 825, "Last HPV test; was it with the Pap (co-test)?", "single_select", "Never|When: ______|Co-test: ☐ Yes  ☐ No", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-26", 826, "Age 40 and older: last mammogram:", "single_select", "Never|N/A|When: ______", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-27", 827, "Age 65 and older (or at risk): bone density (DEXA):", "single_select", "Never|Not sure|When: ______", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-28", 828, "Plan to get pregnant in the next year?", "single_select", "Not planning|Planning|N/A", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-29", 829, "If planning: taking folic acid?", "single_select", "No|Yes", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-30", 830, "Flu this season? COVID this season? Tdap in 10 years?", "multi_select", "Flu|COVID|Tdap|Not sure", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-31", 831, "Age 18 to 26: HPV done? MenACWY booster? MenB?", "multi_select", "HPV|MenACWY|MenB|Not sure", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-32", 832, "Hep B series? Pneumonia (50+)? Shingles (50+)? RSV (75+)?", "multi_select", "HepB|Pneumonia|Shingles|RSV", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-33", 833, "Fallen in the last year?", "single_select", "No|Yes|I'm under 65", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-34", 834, "TB risk (born where TB is common, TB contact, shelter or jail, weak immune system)?", "single_select", "No|Yes|Not sure", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-35", 835, "Hepatitis B risk (born in Asia, Africa, Pacific Islands, E. Europe; hep B contact; HIV; injection drug use)?", "single_select", "No|Yes|Not sure", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-36", 836, "Smoke now, or quit within 15 years?", "text", "______ years smoked    ______ packs a day", "N", "", "", "Your care so far this year"],
  ["shcadult", "shcadult-37", 937, "Any of these in the last 30 days?", "multi_select", "No|Hospital stay: mental health|Hospital stay: alcohol or drugs|ER visit: mental health|ER visit: alcohol or drugs|Detox or withdrawal care|Live-in addiction program|Mobile crisis team came|Hospital or ER: medical or surgical", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shcadult", "shcadult-38", 938, "Date left, or date of the visit:", "text", "", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shcadult", "shcadult-39", 939, "Hospital name and city:", "text", "", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shcadult", "shcadult-40", 940, "Seen anyone for follow-up since then?", "single_select", "No|Yes, who and when: ______________", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shcadult", "shcadult-41", 941, "Getting mental health or substance use treatment now?", "single_select", "No|Yes|Recently stopped", "N", "", "", "Recent hospital, ER, or crisis care"],
  ["shcadult", "shcadult-42", 1042, "Little interest or pleasure in doing things", "scored", "Not at all|Several days|More than half the days|Nearly every day", "N", "", "", "Mood, worry, alcohol, tobacco"],
  ["shcadult", "shcadult-43", 1043, "Feeling down, depressed, or hopeless", "scored", "Not at all|Several days|More than half the days|Nearly every day", "N", "", "", "Mood, worry, alcohol, tobacco"],
  ["shcadult", "shcadult-44", 1044, "Feeling nervous, anxious, or on edge", "scored", "Not at all|Several days|More than half the days|Nearly every day", "N", "", "", "Mood, worry, alcohol, tobacco"],
  ["shcadult", "shcadult-45", 1045, "Not being able to stop or control worrying", "scored", "Not at all|Several days|More than half the days|Nearly every day", "N", "", "", "Mood, worry, alcohol, tobacco"],
  ["shcadult", "shcadult-46", 1046, "Drinks with alcohol, how often?", "single_select", "Never|Monthly or less|2 to 4 times a month|2 to 3 times a week|4+ times a week", "N", "", "", "Mood, worry, alcohol, tobacco"],
  ["shcadult", "shcadult-47", 1047, "Drinks on a typical day?", "single_select", "1 to 2|3 to 4|5 to 6|7 to 9|10 or more", "N", "", "", "Mood, worry, alcohol, tobacco"],
  ["shcadult", "shcadult-48", 1048, "6 or more drinks at one time?", "single_select", "Never|Less than monthly|Monthly|Weekly|Almost daily", "N", "", "", "Mood, worry, alcohol, tobacco"],
  ["shcadult", "shcadult-49", 1049, "Tobacco or nicotine?", "single_select", "No|Yes, ____ a day|Quit in the last year", "N", "", "", "Mood, worry, alcohol, tobacco"],
  ["shcadult", "shcadult-50", 1150, "In the past 12 months, has the electric, gas, oil, or water company threatened to shut off services in your home?", "single_select", "No|Yes|Already shut off", "N", "", "", "Safety and support"],
  ["shcadult", "shcadult-51", 1151, "Do you feel safe where you live?", "single_select", "Yes|No|Prefer not to say", "N", "", "", "Safety and support"],
  ["shcadult", "shcadult-52", 1152, "How hard is it to pay for basics?", "single_select", "Not hard|A little|Somewhat|Hard|Very hard", "N", "", "", "Safety and support"],
  ["shcadult", "shcadult-53", 1153, "Want help with work or school?", "single_select", "No|Yes|Not now", "N", "", "", "Safety and support"],
  ["shcadult", "shcadult-54", 1154, "How often do you feel lonely or cut off?", "single_select", "Never|Rarely|Sometimes|Often|Always", "N", "", "", "Safety and support"],
  ["shcadult", "shcadult-55", 1255, "Need help from another person with:", "multi_select", "None|Bathing|Dressing|Toilet|Moving from bed or chair|Eating|Medicines|Shopping, meals, or money", "N", "", "", "If you are 65 or older"],
  ["shcadult", "shcadult-56", 1256, "Walking:", "single_select", "No trouble|Some trouble|Cane or walker|Wheelchair", "N", "", "", "If you are 65 or older"],
  ["shcadult", "shcadult-57", 1257, "Fallen, unsteady, or worried about falling?", "single_select", "No|Fell|Unsteady|Worried", "N", "", "", "If you are 65 or older"],
  ["shcadult", "shcadult-58", 1258, "Vision:", "single_select", "Fine|Some trouble|A lot of trouble", "N", "", "", "If you are 65 or older"],
  ["shcadult", "shcadult-59", 1259, "Hearing:", "single_select", "Fine|Some trouble|A lot of trouble", "N", "", "", "If you are 65 or older"],
  ["shcadult", "shcadult-60", 1260, "Changes in memory or thinking?", "single_select", "No|Yes|Not sure", "N", "", "", "If you are 65 or older"],
  ["shcadult", "shcadult-61", 1261, "Living will, POLST, or health care power of attorney?", "single_select", "No|Yes|Not sure|I'd like to talk about it", "N", "", "", "If you are 65 or older"],
  ["shcadult", "shcadult-62", 1362, "Would you like a pregnancy test today?", "single_select", "No|Yes", "N", "", "", "If you came for pregnancy or after-baby care"],
  ["shcadult", "shcadult-63", 1363, "First day of your last period, and weeks pregnant:", "text", "___/___/____    ______ weeks", "N", "", "", "If you came for pregnancy or after-baby care"],
  ["shcadult", "shcadult-64", 1364, "Delivery date, if you just had a baby:", "text", "___/___/____", "N", "", "", "If you came for pregnancy or after-baby care"],
  ["shcadult", "shcadult-65", 1365, "Pregnancies and births so far:", "text", "______ / ______", "N", "", "", "If you came for pregnancy or after-baby care"],
  ["shcadult", "shcadult-66", 1366, "Have you started pregnancy care?", "single_select", "Not yet|Yes, where: ______|N/A, after baby", "N", "", "", "If you came for pregnancy or after-baby care"],
  ["shcadult", "shcadult-67", 1367, "Have you reported this pregnancy to the State in Manage My Case?", "single_select", "Yes|No, please help me today|Not sure", "N", "", "", "If you came for pregnancy or after-baby care"],
  ["shcadult", "shcadult-68", 1368, "This pregnancy:", "multi_select", "Prenatal vitamin|Flu shot|Tdap shot|RSV shot (32 to 36 weeks)", "N", "", "", "If you came for pregnancy or after-baby care"],
  ["shcadult", "shcadult-69", 1369, "HIV, syphilis, and hepatitis tests done?", "single_select", "Yes, all|Some|No|Not sure", "N", "", "", "If you came for pregnancy or after-baby care"],
  ["shcadult", "shcadult-70", 1370, "Past 7 days: felt down, or unable to enjoy things?", "single_select", "No or rarely|Some of the time|Most of the time", "N", "", "", "If you came for pregnancy or after-baby care"],
  ["shcadult", "shcadult-71", 1371, "Past 7 days: has the thought of hurting yourself come to mind?", "single_select", "No|Yes", "N", "", "", "If you came for pregnancy or after-baby care"],
  ["shcadult", "shcadult-72", 1472, "Are you sexually active?", "single_select", "No|Yes|Prefer not to say", "N", "", "", "Private questions"],
  ["shcadult", "shcadult-73", 1473, "Partners in the last year; partners are:", "text", "______   ☐ men  ☐ women  ☐ both", "N", "", "", "Private questions"],
  ["shcadult", "shcadult-74", 1474, "Any symptoms now (discharge, burning, sores)?", "single_select", "No|Yes", "N", "", "", "Private questions"],
  ["shcadult", "shcadult-75", 1475, "Last STI test and result:", "single_select", "Never tested|Negative|Positive|Don't know|When: ______", "N", "", "", "Private questions"],
  ["shcadult", "shcadult-76", 1476, "Would you like a test today?", "multi_select", "No|Chlamydia and gonorrhea|HIV|Syphilis|Hepatitis C", "N", "", "", "Private questions"],
  ["shcadult", "shcadult-77", 1477, "Want to learn about PrEP (prevents HIV)?", "single_select", "No|Yes|Already on PrEP", "N", "", "", "Private questions"],
  ["shcadult", "shcadult-78", 1478, "Preventing pregnancy with:", "single_select", "Nothing|Condoms|Pill / patch / ring|Shot|Implant|IUD|Tubes tied / vasectomy|N/A", "N", "", "", "Private questions"],
  ["shcadult", "shcadult-79", 1479, "Want to be pregnant in the next year?", "single_select", "No|Yes|Not sure|N/A", "N", "", "", "Private questions"],
  ["shcadult", "shcadult-80", 1480, "In the last year, has a partner or someone at home hit, hurt, scared, controlled, or forced you into sex?", "single_select", "No|Yes|I'd rather talk about it", "N", "", "", "Private questions"],
  ["shcadult", "shcadult-81", 1481, "Do you feel safe going home today?", "radio_yes_no", "Yes|No", "N", "", "", "Private questions"],
  ["shcvax26", "shcvax26-1", 101, "Child's name:", "text", "", "N", "", "", "Your child"],
  ["shcvax26", "shcvax26-2", 102, "Date of birth:", "text", "", "N", "", "", "Your child"],
  ["shcvax26", "shcvax26-3", 103, "School and grade:", "text", "", "N", "", "", "Your child"],
  ["shcvax26", "shcvax26-4", 104, "Your name and relationship:", "text", "", "N", "", "", "Your child"],
  ["shcvax26", "shcvax26-5", 305, "Is your child sick today with a fever?", "single_select", "No|Yes", "N", "", "", "Health questions before shots"],
  ["shcvax26", "shcvax26-6", 306, "Has your child ever had a serious allergic reaction to a shot, latex, or any medicine?", "single_select", "No|Yes: ______", "N", "", "", "Health questions before shots"],
  ["shcvax26", "shcvax26-7", 307, "Does your child have a long-term health problem (heart, lung, kidney, blood, immune system)?", "single_select", "No|Yes: ______", "N", "", "", "Health questions before shots"],
  ["shcvax26", "shcvax26-8", 308, "Does your child have seizures or a nervous system problem?", "single_select", "No|Yes", "N", "", "", "Health questions before shots"],
  ["shcvax26", "shcvax26-9", 309, "Has your child had a blood transfusion or antibody treatment (immune globulin) in the past year?", "single_select", "No|Yes", "N", "", "", "Health questions before shots"],
  ["shcvax26", "shcvax26-10", 310, "Is your child taking steroids, cancer drugs, or other medicine that weakens the immune system?", "single_select", "No|Yes", "N", "", "", "Health questions before shots"],
  ["shcvax26", "shcvax26-11", 311, "Is your child (age 12 and up) pregnant or could be?", "single_select", "No|Yes|Prefer to discuss privately", "N", "", "", "Health questions before shots"],
  ["shcvax26", "shcvax26-12", 312, "Has your child had a shot in the past 4 weeks?", "single_select", "No|Yes: ______", "N", "", "", "Health questions before shots"],
  ["shcvax26", "shcvax26-13", 413, "Parent or guardian signature:", "text", "", "N", "", "", "Agreement and signature"],
  ["shcvax26", "shcvax26-14", 414, "Date:", "text", "", "N", "", "", "Agreement and signature"],
  ["shcvax26", "shcvax26-15", 415, "Phone to reach you on the visit day:", "text", "", "N", "", "", "Agreement and signature"],
  ["shcvax26", "shcvax26-16", 416, "Interpreter used (language):", "text", "", "N", "", "", "Agreement and signature"]
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
    var refusal = 'WRONG WORKBOOK - nothing written.\n\n' +
      '"' + book.getName() + '" is missing: ' + missing.join(', ') + '\n' +
      'It contains: ' + present.join(', ') + '\n\n' +
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

  var report = (dryRun ? 'PREVIEW - nothing written\n\n' : 'IMPORT COMPLETE\n\n') + log.join('\n');
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
    rowOf[String(r[0]).trim() + '\u0000' + String(r[3]).trim()] = i + 2;
  });

  var updates = 0, appended = [];
  CONSENT_ITEMS.forEach(function (row) {
    var key = String(row[0]).trim() + '\u0000' + String(row[3]).trim();
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

/** Restates Age Eligibility on the existing services in the new bands. */
function migrateAgeBands_(book, dryRun) {
  var sheet = book.getSheetByName('Service Types');
  if (!sheet) return 'Age bands: Service Types missing, nothing written.';

  var last = sheet.getLastRow();
  if (last < 2) return 'Age bands: no rows.';
  var values = sheet.getRange(2, 1, last - 1, 8).getValues();

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
        if (!dryRun) sheet.getRange(i + 2, 6).setValue(replacement);
      }
      return;
    }
    notes.push('  ' + id + ': not found.');
  });
  return 'Age bands:\n' + notes.join('\n');
}

function normalise_(value) {
  return String(value).split(',').map(function (s) { return s.trim(); })
    .filter(String).sort().join(',');
}
