# Data model: services, forms, and consent

How the registration page decides what to show. **Service Types** is the single
source of truth: it says what a service is called, which intake forms it needs, and
which consent it requires. Everything the patient sees follows from the service
codes on the event row.

## What this replaced

`Events` used to carry three hand-maintained copies of information owned elsewhere
— `Forms`, `Service Names`, `Consent HTML` — plus an unused `ConsentOverride`. The
page paired `Forms[n]` with `Service Names[n]` positionally. Nothing kept the lists
in step, and across 126 event rows that cost:

- **9 events** listed `Forms = regvax25`, which is not a real form id. ADULTVAX's
  form is `adultvax25`, exactly as Service Types already said. Those patients got
  an empty questionnaire.
- **1 event** (DIAGTEST only) had a service but no form, so no service checkbox
  rendered and the "select at least one service" rule made the form
  **impossible to submit**.
- **8 events** offered more services than forms, so positional pairing put the
  wrong label on a questionnaire — a school physical shown as "Diagnostic
  Testing" — and the unpaired service could not be selected at all.
- `Consent HTML` was duplicated across 114 rows and held 2 distinct values.

None of these are reachable now: the label, the form list, and the consent all come
from the same row that defines the service.

## Sheets

All six live in the **Campaigns, Events** workbook and are published to web, so they
share one publish id and differ only by gid (see `src/config.js`).

### `Service Types` — the source of truth

| Column | Notes |
| --- | --- |
| `ServiceTypeID` | Key. `VAXADMIN`, `PHYSICAL`, … Written to *Services Rendered*. |
| `Service Name` | Patient-facing label. The only place it is written. |
| `Intake Form` | Comma-separated FormIDs. Singular name, read as a **list**, so a service can require several forms. May be empty. |
| `ConsentIDs` | Comma-separated ConsentIDs. **Empty means no consent and no signature.** |
| `Age Eligibility` | Comma-separated age bands. Empty means any age. |
| `Gender Eligibility` | Comma-separated gender values. Empty means any gender. |
| `AppSheet Form View` | AppSheet only; unused by the page. |
| `Active` | Governs authoring, **not** rendering — see below. |

`Active` is not consulted when rendering. It controls which services can be picked
when creating a new event; filtering on it would strand patients on already-scheduled
events whose service has since been retired (9 live events use ADULTVAX, which is
`Active = False`).

### `Consent Blocks`

| Column | Notes |
| --- | --- |
| `ConsentID` | Key, e.g. `init0001` |
| `Consent Name` | For the AppSheet picker |
| `ConsentHTML` | The block as authored. Injected unescaped — see the warning below. |
| `DisplayOrder` | Order when several blocks are concatenated |

A separate sheet rather than an HTML column on `Service Types` because three
services share one block today. Inline HTML would mean editing the same 5 KB in
three places — the same duplication that broke `Forms`. With ids, "show identical
content only once" is an exact id comparison rather than a string diff.

> `ConsentHTML` is injected as real HTML by design. Edit access to this sheet is
> therefore equivalent to script access on the registration page. Keep it restricted.

### `Events`

`Services` is the only service-related column: a comma-separated list of
ServiceTypeIDs. `Forms`, `Service Names`, `Consent HTML` and `ConsentOverride` are
gone.

The `WAITLIST` row (CampaignID `xxxxxxxx`) backs the parameterless general-registration
mode. Its `Services` is empty, which is why that mode asks for no consent and no
signature.

### `Forms`, `Form Questions`, `Appointment Slots`

`Forms` maps `FormID` → `Form Name`, used to title each questionnaire section.
`Form Questions` holds the questions. `Appointment Slots` is unchanged.

`Campaigns`, `Appointment Waitlist` and `Registration Queue` are **not** published:
nothing on the page reads them and the last two hold patient data.

## Age bands and eligibility

Three bands, half-open so the labels never overlap:

| Band | Means |
| --- | --- |
| `0-12` | under 12 |
| `12-18` | 12 up to but not including 18 |
| `18+` | 18 and over |

A patient turning 12 or 18 therefore falls in exactly one band. The band is
computed from the date of birth in the demographics section — it is never asked
for separately.

`Age Eligibility` and `Gender Eligibility` on Service Types hide services the
patient cannot receive. Both are comma-separated lists — `0-12, 12-18` for any
minor, `12-18, 18+` for 12 and over — and a service is offered if the patient
matches any entry. Both are empty by default, meaning no restriction, and a
restriction only applies once the demographic it depends on is known: gating on a
blank date of birth would hide every service before the patient has filled the
form in.

Two rules worth knowing:

- **Other and Decline to Answer bypass gender gating entirely.** Choosing either
  never narrows what a patient is offered.
- **Changing the date of birth or gender re-evaluates immediately.** A service
  that becomes ineligible while ticked is unticked, which withdraws its forms and
  consent too. If a correction leaves nothing eligible, the picker says so rather
  than showing an empty box.

## How a registration is assembled

1. **Services** — one checkbox per code in `Events.Services` the patient is
   eligible for, labelled from `Service Name`. A service with no intake form
   still gets a checkbox.
2. **Forms** — the union of `Intake Form` across the ticked services, deduplicated
   by FormID in order of first appearance. A form needed by two services is shown
   once. Sections are titled with `Form Name`, not a service name, because a shared
   form belongs to neither service exclusively.
3. **Consent** — the union of `ConsentIDs`, deduplicated by id and ordered by
   `DisplayOrder`, concatenated into the accordion.
4. **Signature** — if that union is empty, the accordion, the certification
   checkbox and the signature pad are all hidden and no signature is collected.
   Ticking a service that does carry consent brings them back.

All four recompute on every service change, so the patient only ever sees what
their current selection actually requires.

## Question types

| `QuestionType` | Renders as |
| --- | --- |
| `radio_yes_no` | Yes / No radio |
| `single_select` | Dropdown from `Options` |
| `multi_select` | Checkbox list from `Options`; answers joined with `, ` |
| `text_area` | Two-row textarea |
| `date` | Date input |
| `insurance` | The insurance block — see below |
| `signature` | Inline Yes / No, with a pad at the end — see below |
| anything else | Text input |

`Options` is comma-separated, so option labels cannot contain commas.
`DisplayOrder` sorts questions within a form and accepts decimals, so `0.1` puts a
question first without renumbering everything after it; rows without a usable
value keep their sheet position, at the end.

### Triggers

`TriggerID` / `TriggerValue` hide a question until something else has a given value.

| `TriggerID` | Meaning |
| --- | --- |
| a QuestionID | Show when that question in the same form is answered with `TriggerValue` |
| `@age` | Show when the patient's age band equals `TriggerValue` (`0-12`, `12-18`, `18+`) |
| `@gender` | Show when the selected gender equals `TriggerValue` |

`@`-prefixed triggers read the demographics section instead of a question, so a
form can branch on age or gender without asking for it twice.

`TriggerValue` is **comma-separated**, so one row can list several values and the
question appears if *any* of them matches — `0-12, 12-18` for any minor,
`12-18, 18+` for 12 and over, or `Yes, Not sure` to catch both answers. As with
`Options`, a value therefore cannot itself contain a comma. A blank `TriggerValue`
alongside a `TriggerID` means `Yes`.

While the demographic is still blank the question stays hidden — we cannot tell
whether it applies, and hidden questions are neither validated nor submitted. Date
of birth and gender are both required, so the right set is always revealed before
the form can be submitted.

**Chained triggers are not supported.** A question whose `TriggerID` points at
another *conditional* question can be left visible after its parent is cleared.
Point triggers at an unconditional question. A question must never trigger on
itself — that hides it permanently, since it can never be answered.

Generated inputs carry **no** `required` attribute. A required control inside a
hidden section makes the browser abort submission with "An invalid form control is
not focusable" — no message, submit handler never runs, page looks frozen.
Required-ness is enforced in `collectResponses()`, which knows what is visible.

### `insurance`

A row with `QuestionType = insurance` marks a form as needing insurance details.
`QuestionText` and `Options` are ignored — the full block is always rendered.

- Shown when **any** visible form asks for it, and rendered **once** regardless of
  how many do.
- Mounted in one fixed place rather than inline, so the details survive a service
  being toggled off and back on.
- Asks "I am uninsured" / "I have insurance". Choosing *I have insurance* reveals
  the detail fields and requires `primaryIns`, `primaryPayer` and `primaryId`.
  Group and payer ids stay optional: requiring them would block anyone whose card
  does not print them.
- Choosing *I am uninsured* clears the fields and drops their `required`.
- Answers flow into the submission's `insurance` object and land in the existing
  `Patients` columns. **No row is written to Question Responses** — the marker
  question has no `data-question-id`, so it is invisible to answer collection.

### `signature`

A row with `QuestionType = signature` asks a Yes / No **at its place in the form**,
so the questionnaire's flow is not interrupted by a drawing area. Answering *Yes*
adds a pad in the signature area at the end, labelled with the `QuestionText`;
answering *No* removes it. Each pad accepts a drawn signature or a typed name.

A form can request several — `sprtphys22` asks for student and guardian separately.

Each signature image is written to the EMR attachments folder, and the Drive URL
**replaces the Yes/No answer** on that question's Question Responses row. The
response row carries the artefact rather than a bare "Yes", so no extra column is
needed.

## Deployment coupling

The frontend and `apps-script/endpoints.gs` must be deployed **together**. The
submission payload changed in two ways the old backend mishandles:

- `selectedServices[].id` is now a ServiceTypeID and each entry carries `formIds`.
  The old backend looked up `serviceMap[formId]`, so question responses would be
  written with a blank ServiceID.
- `signature` may be an empty string. The old backend rejected that outright.

## School and grade

These are asked by the school-physical and sports-physical intake forms rather
than by the demographics section, so only the patients who need them see them.
They therefore land in **Question Responses**, not in the `Patients` row — the two
`Patients` columns that used to hold them are now written blank so the row keeps
its shape. Anything reporting off those columns needs repointing.

A patient booking both physicals is asked twice, once per form, because the two
questionnaires are independent. Moving the pair into a small shared form listed on
both services would ask once instead.

## Remaining items

- **DIAGTEST** needs consent and a signature but is not built out. Give it a
  `ConsentIDs` value when it is, and it will behave like any other service; it is
  slated for deletion otherwise. Its `Intake Form` is empty, which is fine.
- The four legacy `signature` rows (`schlphys22-73`, `sprtphys22-41/42`,
  `sprtphys26-42`) now work as intended. `schlphys22` and `sprtphys22` are
  2022-era forms no active service references.
- `Campaigns` still has a `Consent HTML` column. Nothing reads it; consent comes
  from services now. Safe to drop when AppSheet no longer needs it.
