# Registration backend (Cloud Run)

Replaces the Apps Script web app (`apps-script/endpoints.gs`) for booking slots
and recording registrations, and fills the paperwork as PDFs while the patient
waits instead of queueing it.

It speaks the same protocol: the page posts `{action, payload}` as `text/plain`
with `bookSlot`, `releaseSlot` or `submitForm`, and every answer is JSON. The
page decides per event which backend to call — see `apiUrl()` in `src/api.js`
and `RUN_SERVICES` in `src/config.js` of the page. An event moves here only when
every one of its services is documented here; the rest stay on Apps Script.

## Layout

| Path | What it is |
| --- | --- |
| `src/submit.js` | `submitForm`: the rows endpoints.gs wrote, same columns, one batched write per sheet |
| `src/slots.js` | `bookSlot`, `releaseSlot`, the slot confirmation and the pending sweep |
| `src/documents.js` | Uploads filled PDFs and logs Attachments rows |
| `src/docs/overlay.js` | Draws values onto a form's original artwork at measured positions |
| `src/docs/wow/` | The four WOW / mobile health forms and their clinical rows |
| `src/store.js` | Firestore: slot hold tokens and replayable submission results |
| `assets/forms/` | Blank form artwork, one PDF per FormID |

## Running the tests

```bash
npm install
npm test
```

The WOW test reads the published Form Questions CSV and skips offline.

## Deploying

Project `prism-emr`, region `us-central1`. One instance, always warm: slot
booking relies on a single process holding the lock, and a cold start would eat
into the patient's wait.

```bash
gcloud run deploy registration --source backend --region us-central1 --project prism-emr \
  --service-account registration-backend@prism-emr.iam.gserviceaccount.com \
  --min-instances 1 --max-instances 1 --allow-unauthenticated
```

The service account needs Editor on the four spreadsheets (Events Management,
the EMR, Form Responses, Clinical Documentation) and on the attachment folders.

| Variable | Meaning |
| --- | --- |
| `EMAIL_SENDER` | Mailbox confirmations are sent as, via domain-wide delegation. Unset skips email. |
| `SWEEP_CALLER` | Service account Cloud Scheduler calls `/jobs/sweep` as. |
| `SWEEP_AUDIENCE` | This service's URL, the audience of the scheduler's token. |
| `ALLOWED_ORIGINS` | Pages allowed to call from a browser. |
