// Deployment configuration. Ids are the same ones apps-script/endpoints.gs uses;
// anything that differs per environment comes from the environment.

const env = process.env;

/** "Events Management": Events, Appointment Slots, Appointment Waitlist. */
export const BOOKING_SPREADSHEET_ID = env.BOOKING_SPREADSHEET_ID || '17226ud6cLY7gbLyv0IS_3k1mylHeWuoHHKyr96hoy1I';

/** The EMR: Patients, Appointments, Services Rendered, Attachments. */
export const MAIN_SPREADSHEET_ID = env.MAIN_SPREADSHEET_ID || '1CX9GiID58srjCcrB_QH2RNgzMYtYSKFbfTmxKPwYeLs';

/** "Form Responses": Question Responses, Consent Declines. */
export const RESPONSES_SPREADSHEET_ID = env.RESPONSES_SPREADSHEET_ID || '1VnopEIAJSdfO6OKhWwHVn9SzCau0xkKndEecF4Xc1nY';

/** Clinical documentation sheets (WOW Documentation, Mobile EM, Sports Physicals). */
export const CLINICAL_SPREADSHEET_ID = env.CLINICAL_SPREADSHEET_ID || '1h45EaaeXK7c-6ggcWrAoDRl2lyS-dNr7K-YHXP91EfY';

/** EMR attachments: signatures and generated PDFs. */
export const UPLOAD_FOLDER_ID = env.UPLOAD_FOLDER_ID || '1LydgJoBKURyzl-_nYDWRn4dYL51AeM2k';

/**
 * Every date and time the sheets hold is Chicago wall-clock time, which is what
 * the Apps Script project ran in. Timestamps are written in it and read back in it.
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
