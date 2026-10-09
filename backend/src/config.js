// Deployment configuration. Ids are the same ones apps-script/endpoints.gs uses;
// anything that differs per environment comes from the environment.

const env = process.env;

/** "Events Management": Events, Appointment Slots. */
export const BOOKING_SPREADSHEET_ID = env.BOOKING_SPREADSHEET_ID || '17226ud6cLY7gbLyv0IS_3k1mylHeWuoHHKyr96hoy1I';

/**
 * The Events row behind the page's no-link general registration: a patient
 * record with no appointment. Every other event needs a slot; there is no
 * waitlist.
 */
export const GENERAL_REGISTRATION_EVENT_ID = 'WAITLIST';

/** The EMR: Patients, Appointments, Services Rendered, Attachments. */
export const MAIN_SPREADSHEET_ID = env.MAIN_SPREADSHEET_ID || '1CX9GiID58srjCcrB_QH2RNgzMYtYSKFbfTmxKPwYeLs';

/** "Form Responses": Question Responses, Consent Declines. */
export const RESPONSES_SPREADSHEET_ID = env.RESPONSES_SPREADSHEET_ID || '1VnopEIAJSdfO6OKhWwHVn9SzCau0xkKndEecF4Xc1nY';

/** Clinical documentation sheets (WOW Documentation, Mobile EM, Sports Physicals). */
export const CLINICAL_SPREADSHEET_ID = env.CLINICAL_SPREADSHEET_ID || '1h45EaaeXK7c-6ggcWrAoDRl2lyS-dNr7K-YHXP91EfY';

/** EMR attachments: signatures and generated PDFs. */
export const UPLOAD_FOLDER_ID = env.UPLOAD_FOLDER_ID || '1LydgJoBKURyzl-_nYDWRn4dYL51AeM2k';

/**
 * The fallback zone, used only until a spreadsheet's own zone has been read.
 *
 * Timestamps are written in each spreadsheet's own time zone (see
 * `GoogleSheets.stamp`), because that is where Apps Script's Date objects
 * landed - and the workbooks do not agree: Main DB shows a 9:14 Chicago
 * booking as 8:14.
 */
export const TIME_ZONE = env.TIME_ZONE || 'America/Chicago';

/** How long a 'Pending' slot is honoured before the sweep reopens it. */
export const PENDING_GRACE_MS = 25 * 60 * 1000;

/** How long a completed submission is remembered for idempotency. */
export const SUBMISSION_TTL_MS = 6 * 60 * 60 * 1000;

/** Pages allowed to call this service from a browser. */
export const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS ||
    'https://register.prism.org,http://localhost:8777')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

/**
 * The mailbox confirmation emails are sent as, via domain-wide delegation.
 * Unset means email is skipped and logged, never that registration fails.
 */
export const EMAIL_SENDER = env.EMAIL_SENDER || '';

/** Service account the Cloud Scheduler sweep authenticates as. */
export const SWEEP_CALLER = env.SWEEP_CALLER || '';

export const PORT = Number(env.PORT || 8080);
