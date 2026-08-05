# Apps Script backend

`endpoints.gs` is a **mirror** of one file in the Apps Script project that backs
[register.prism.org](https://register.prism.org/). It is tracked here so the
frontend's contract with the backend is reviewable in one place.

The Apps Script project is the source of truth and is maintained separately. It
also contains files that are *not* in this repo:

| Referenced from `endpoints.gs` | What it is |
| --- | --- |
| `enqueueDocJob_(...)` | Queues PDF/document generation for a registration |
| `ConfirmationEmail` | HTML template for booked appointments |
| `WaitlistEmail` | HTML template for waitlist entries |

Editing this copy changes nothing in production. To deploy, paste it into the
Apps Script editor and publish a **new version** of the web app.

> **Deploy this together with the frontend.** The submission payload changed in two
> ways an older `endpoints.gs` mishandles: `selectedServices[].id` is now a
> ServiceTypeID (with a `formIds` list) rather than a form id, so question responses
> would be written with a blank ServiceID; and `signature` may be an empty string
> for services that carry no consent, which the previous version rejected outright.

## Deployment settings

The web app must be deployed with:

- **Execute as:** Me (the owner of the spreadsheets and Drive folder)
- **Who has access:** Anyone

"Anyone" is required because patients are anonymous. Any other setting makes Apps
Script answer with an HTML sign-in page, which the frontend can only report as an
unexpected server response.

The script must stay **container-bound** to the scheduling spreadsheet:
`bookingBook_()` uses `SpreadsheetApp.getActiveSpreadsheet()` for *Events*,
*Appointment Slots* and *Appointment Waitlist*, while `mainBook_()` opens the EMR
spreadsheet by id for *Patients*, *Appointments* and *Services Rendered*.

## Required trigger

`checkPendingToOpen` needs a time-driven trigger (every 5 minutes). Without it,
slots abandoned mid-registration stay `Pending` forever and quietly disappear from
the available pool.

## Actions

| Action | Payload | Effect |
| --- | --- | --- |
| `bookSlot` | `{ eventId, startTime }` | `Open` → `Pending` |
| `releaseSlot` | `{ eventId, startTime }` | `Pending` → `Open` (no-op otherwise) |
| `submitForm` | full registration | `Pending` → `Booked`, writes all records |

Every response is JSON. Failures return `{ status: 'error', code, message }` where
`code` is stable and `message` is shown to the patient:

| Code | Meaning |
| --- | --- |
| `BUSY` | Could not get the script lock — too many concurrent writers |
| `SLOT_UNAVAILABLE` | Someone else took the slot first |
| `SLOT_EXPIRED` | The `Pending` hold was swept before submission completed |
| `UNKNOWN_EVENT` | No Events row matches the submitted `eventId` |
| `MISSING_SHEET` | A required sheet has been renamed or deleted |
| `BAD_REQUEST` / `EMPTY_REQUEST` / `UNKNOWN_ACTION` | Malformed request |

## Signatures

The consent signature is **optional**: services whose `ConsentIDs` is empty require
nothing to be signed, and the client sends `signature: ''`. The Patients row simply
gets a blank signature URL.

Questions with `QuestionType = signature` send a `additionalSignatures` array of
`{questionId, label, data}`. Each image is written to the attachments folder and its
Drive URL **replaces the Yes/No answer** on that question's Question Responses row,
so the artefact is recorded without needing an extra column.

Answers are attributed to a ServiceID through `buildFormServiceMap_`, which walks
each selected service's `formIds`. When a form is shared by two selected services
the first one wins, so a shared questionnaire is recorded once.

## Operational notes

**What is inside the lock matters.** Only the slot read/modify/write is
serialised. Drive uploads, the QR fetch, email, and document generation are
outside it — when they were inside, a few simultaneous registrations were enough
to push later requests past the lock timeout.

**Side effects are best-effort.** The QR code, confirmation email, and document
job are each wrapped in a try/catch. A Gmail quota error or a QR service outage is
logged but does not fail a registration whose rows are already written. Watch
**Executions** in the Apps Script editor for `Confirmation email failed` — that
usually means the daily `MailApp` quota is exhausted.

**Submissions are idempotent.** The client sends a `submissionId` with every
registration and the result is cached against it for 6 hours, so a retry after a
response lost in transit replays the original result instead of creating a second
patient record. The client only retries submissions when
`RETRY.retrySubmissions` is enabled in `src/config.js` — turn that on only after
this file is deployed.

**Quotas worth knowing.** `MailApp.sendEmail` is capped daily (1,500/day on
Workspace, 100/day on consumer accounts). A single execution is capped at 6
minutes, which is why the upload budget is limited client-side.
