// Deployment-specific configuration. Everything here is public by design: the
// page is a static site, so these URLs are visible to anyone who loads it.

/** Google Apps Script web app that handles all write operations. */
export const GAS_API_URL =
    'https://script.google.com/macros/s/AKfycbwnvm7Q26ebVGOnC14BrFajyuh7RyeBijBQg6xSSfz0hA8ofj4HxT8P1EoqKkpg8lDU/exec';

/**
 * Published-to-web CSV feeds used for read-only data.
 *
 * All six sheets live in the "Campaigns, Events" workbook, so they share one
 * publish id and differ only by gid. Publish a new sheet from
 * File → Share → Publish to web, then add its gid here.
 *
 * Campaigns, Appointment Waitlist and Registration Queue are deliberately NOT
 * published — nothing on this page reads them and the last two hold patient data.
 */
const WORKBOOK_PUB_ID =
    '2PACX-1vSjsfBdiXj2A0M4v-cjYryFN9WwB_qMd4B5FVjxV2DsPWngRm8tz670W02S3uAfqqobEtAcMsjwGAsC';

const published = gid =>
    `https://docs.google.com/spreadsheets/d/e/${WORKBOOK_PUB_ID}/pub?gid=${gid}&single=true&output=csv`;

export const CSV_URLS = {
    events: published(1643561266),
    slots: published(582524870),
    serviceTypes: published(874288766),
    forms: published(494874326),
    questions: published(2021441540),
    consentBlocks: published(952217193)
};

/** Base URL used when building links to a single event. */
export const BASE_URL = 'https://register.prism.org/';

/**
 * How long a held slot stays reserved in the UI.
 *
 * This MUST stay comfortably below the backend's `checkPendingToOpen` grace
 * period (25 minutes). If the two are equal, a submission that starts near the
 * deadline can have its slot swept back to "Open" mid-request, and the user
 * gets "Could not confirm your slot" after filling in the whole form.
 */
export const SLOT_HOLD_MS = 18 * 60 * 1000;

/**
 * Total upload budget for medical records.
 *
 * Files are sent to Apps Script as base64 data URLs, which inflates them by
 * ~33%, and the whole payload has to be JSON-parsed inside a single Apps Script
 * execution. Keeping the raw total modest is what keeps submissions from dying
 * on payload size or the execution time limit.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Sentinel event id used by the parameterless "general registration" mode. */
export const GENERAL_REGISTRATION_EVENT_ID = 'WAITLIST';

/**
 * Insurance fields the patient must supply once they say they have coverage.
 *
 * Deliberately just the three that identify the policy. Requiring group and payer
 * ids as well would block registration for anyone whose card does not print them,
 * which is the failure mode this form can least afford.
 */
export const REQUIRED_INSURANCE_FIELDS = ['primaryIns', 'primaryPayer', 'primaryId'];

/** Transient-failure retry policy for backend calls. */
export const RETRY = {
    attempts: 3,
    baseDelayMs: 600,
    /**
     * Retrying `submitForm` is only safe once the backend deduplicates on the
     * `submissionId` we send with every submission; without that, a retry after
     * a response that was lost in transit would register the patient twice.
     * Flip this on after deploying an endpoints.gs that honours submissionId.
     */
    retrySubmissions: false
};
