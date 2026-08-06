# Prism Appointment Booking

Patient-facing registration and appointment booking page for Prism Health events,
served as a static site at **[register.prism.org](https://register.prism.org/)** via
GitHub Pages.

There is no build step. The page is plain HTML, CSS, and ES modules; serve
`index.html` from any static file server and it runs.

## How it works

```
Browser (this repo)
  │
  ├─ reads   Published-to-web CSV feeds  ──►  Google Sheets (Events, Slots, Questions)
  │          (fast, cached by Google for a few minutes)
  │
  └─ writes  POST { action, payload }     ──►  Apps Script web app (apps-script/endpoints.gs)
                                                 │
                                                 ├─ Appointment Slots  (hold / release / book)
                                                 ├─ Patients, Appointments, Services Rendered
                                                 ├─ Question Responses
                                                 ├─ Signature + record uploads → Drive
                                                 └─ Confirmation email + PDF job queue
```

Reads and writes go through different paths on purpose: CSV feeds are cheap and
serve the slot grid, while every mutation is serialised through the Apps Script
web app so two people cannot claim the same slot.

### The three entry modes

| URL | Behaviour |
| --- | --- |
| `?eventId=<id>` | Slot picker for one event, then the registration form. |
| `?campaignId=<id>` or `?facilityId=<id>` | Card list of matching events, each linking to `?eventId=`. |
| no parameters | General registration / records request, recorded as a waitlist entry. |

### Booking lifecycle

1. Patient picks a slot → `bookSlot` flips the row to **Pending** and stamps the time.
2. The browser counts down `SLOT_HOLD_MS` (18 min) while the form is filled in.
3. `submitForm` flips the row to **Booked** and writes the patient records.
4. Leaving early, or the countdown expiring, calls `releaseSlot` → back to **Open**.
5. `checkPendingToOpen` (time-driven trigger, every 5 min) reopens anything left
   Pending for longer than `PENDING_GRACE_MS` (25 min).

The client hold is deliberately *shorter* than the server grace period. If the two
are equal, a slot can be swept back to Open while someone is mid-submission.

## Layout

```
index.html               Single page: slot picker, form, confirmation
assets/css/style.css     Theme layer over Bootstrap 5.3
assets/favicon.ico
src/
  main.js                Entry point: routing, listeners, bootstrap
  config.js              URLs, timeouts, limits — the only file to edit per deployment
  state.js               Shared mutable state
  dom.js                 Cached element references
  api.js                 Apps Script calls (retry/backoff) and CSV loading
  utils.js               Sheet value parsing, loading overlay, alerts
  catalog.js             Resolves event services into forms and consent
  events.js              Event heading and event-selection cards
  slots.js               Slot grid, hold countdown, waitlist entry
  questions.js           Service picker and dynamic questionnaires
  insurance.js           Insurance block (the `insurance` question type)
  patient.js             Demographics, guardian fields, uploads
  signature.js           Consent signature plus per-question signatures
  submit.js              Validation, submission, confirmation
apps-script/             Mirror of the backend endpoint file (see its README)
docs/schema.md           How services, forms and consent fit together
CNAME                    GitHub Pages custom domain
```

## Spreadsheet contract

All six published sheets live in the **Campaigns, Events** workbook and share one
publish id, differing only by gid (`src/config.js`). The page depends on these
column names — renaming one breaks it silently, so change both sides together.
Header whitespace is trimmed on load, but spelling and case must match.

**Events** — `EventID`, `Event Name`, `Date`, `Start Time`, `End Time`,
`CampaignID`, `FacilityID`, `Services`

**Service Types** — `ServiceTypeID`, `Service Name`, `Intake Form`, `ConsentIDs`,
`Age Eligibility`, `Gender Eligibility`

**Forms** — `FormID`, `Form Name`

**Consent Blocks** — `ConsentID`, `ConsentHTML`, `DisplayOrder`

**Form Questions** — `FormID`, `QuestionID`, `DisplayOrder`, `QuestionText`,
`QuestionType`, `Options`, `IsRequired`, `TriggerID`, `TriggerValue`

**Appointment Slots** — `EventID`, `Date`, `Start Time`, `End Time`, `Status`
(`Open` / `Pending` / `Booked`)

`Events.Services` names service codes and nothing else. Which intake forms and
consent those pull in, who is eligible for them, and whether a signature is
required at all is resolved through **Service Types**. See
[docs/schema.md](docs/schema.md) for the full model, including age bands, the
`@age` / `@gender` triggers, and the `insurance` and `signature` question types.

## Local development

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/?eventId=<an-event-id>`. A server is required —
ES modules do not load over `file://`.

Reads come from the published CSV feeds and writes go to the live Apps Script
deployment, so running locally exercises **production data**. Use a test event id,
or point `src/config.js` at a staging deployment, before submitting anything.

## Deployment

Pushing to `main` publishes through GitHub Pages; `CNAME` pins the custom domain.
Backend changes deploy separately from the Apps Script editor — see
[apps-script/README.md](apps-script/README.md).
