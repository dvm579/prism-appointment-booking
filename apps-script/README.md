# Apps Script backend

`endpoints.gs` is a **mirror** of one file in the Apps Script project that backs
[register.prism.org](https://register.prism.org/). It is tracked here so the
frontend's contract with the backend is reviewable in one place.

The Apps Script project is the source of truth and is maintained separately. It
also contains files that are *not* in this repo:

| Referenced from `endpoints.gs` | What it is |
| --- | --- |
| `ConfirmationEmail` | HTML template for booked appointments |
| `WaitlistEmail` | HTML template for waitlist entries |

Document generation *is* tracked here: `pdfHandler.gs` (the queue and the
FormID → generator table), `pdfHelper.gs` (shared rendering and logging), and
one file per form, named after the FormID it serves.

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

## The document queue

`processDocQueue` needs its own time-driven trigger. Each registration enqueues
one job; the trigger drains them oldest first, within a five-minute budget.

**One Script Property per job**, keyed `docJob:<uuid>`. It used to be a single
`docQueueV1` property holding the whole queue as a JSON array, which capped the
*queue* at PropertiesService's 9 KB per-value limit rather than capping a job.
A job carries the whole submission — an ENMADULT registration answers 61
questions across three forms, about 4.5 KB — so the array overflowed on the
**second** such registration. `setProperty` threw, `tryEnqueueDocJob_` swallowed
it, and the only trace was a log line and a missing PDF.

**Jobs over 8 KB spill to Drive.** Per-job properties raise the ceiling but do
not remove it, and one job can still pass 9 KB alone: `additionalSignatures`
carries a base64 PNG per signature pad, which `6f25fcaa` collects. Oversized
payloads are written to a `_PRISM doc queue spill` folder — created on first use
— and the property holds only a pointer. The file is trashed once the job runs.

**Claiming is destructive and locked.** A job's property is read and deleted in
one critical section, then generated outside it. Two overlapping executions
therefore cannot both take the same job and file every document twice. The
trade is that a job cut off by the execution limit is lost rather than repeated;
that is deliberate, because duplicate EMR rows are much harder to unpick than a
missing PDF the log names. The five-minute budget stops a minute early to make
that unlikely.

**Failures retry twice, then stop.** A job that throws before any generator runs
is requeued with an incremented `attempts`; after three it moves to
`docJobDead:<uuid>` and stays there. Run `listDeadDocJobs` to see them. A
*generator* throwing is not a job failure — it is logged and the remaining forms
still generate, which is what keeps retries from duplicating a document that was
already filed.

Jobs left in `docQueueV1` by an older deploy are migrated into per-job
properties on the next pass, so deploying mid-queue strands nothing.

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
