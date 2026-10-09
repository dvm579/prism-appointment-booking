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
signature. Despite the id it is not a waitlist: there is none. It is the one event
registered without a slot, and writes only a Patients row; any other event with
nothing open shows a fully-booked notice instead.

### `Forms`, `Form Questions`, `Appointment Slots`

`Forms` maps `FormID` → `Form Name`, used to title each questionnaire section.
`Form Questions` holds the questions, including the `Section` column the page
steps through. `Appointment Slots` is unchanged.

`Campaigns`, `Appointment Waitlist` and `Registration Queue` are **not** published:
nothing on the page reads them and the last two hold patient data.

## Age bands and eligibility

Every age value in the sheet is an inclusive **range of whole years**, written
with a `y`:

| Value | Means |
| --- | --- |
| `0-3y` | 0 through 3 |
| `4-11y` | 4 through 11 |
| `12-17y` | 12 through 17 |
| `18+y` | 18 and over |

Those four are the bands the School Health forms split on, so a patient turning
4, 12 or 18 falls in exactly one of them, but any range works the same way —
`8-11y`, `65+y`. Age is computed from the date of birth in the demographics
section; it is never asked for separately.

**The `y` is not decoration.** A bare `12-17` typed into a sheet cell is read as
December 17 and stored as a date — see *A hazard with range-shaped cells*. The
page still reads the bare form too (`12-17`, `18+`), so the sheet can be
migrated before or after a deploy; `suffixAgeValues_` in the importer adds the
`y` everywhere.

`Age Eligibility` and `Gender Eligibility` on Service Types hide services the
patient cannot receive. Both are lists — `0-3y,4-11y,12-17y` for any minor,
`12-17y,18+y` for 12 and over — and a service is offered if the patient matches
any entry. Both are empty by default, meaning no restriction, and a restriction
only applies once the demographic it depends on is known: gating on a blank date
of birth would hide every service before the patient has filled the form in.

Two rules worth knowing:

- **Eligibility behaves exactly like an `@age` or `@gender` question trigger.**
  Age is a range test, so the sheet and the page no longer have to agree on a
  fixed list of band names — which is what used to hide every age-gated service
  whenever one changed without the other. Gender is a plain membership test with
  no special handling for Other or Decline to Answer: a service listing `Female`
  is hidden from them. Whenever a gender-restricted service should still be
  offered to those patients, list the values — `Female, Other, Decline to Answer`.
- **Changing the date of birth or gender re-evaluates immediately.** A service
  that becomes ineligible while ticked is unticked, which withdraws its forms and
  consent too. If a correction leaves nothing eligible, the picker says so rather
  than showing an empty box.

## Paper intake

An event runs in one of two modes. **Online** is everything this document
describes. **Paper** keeps registration to what the EMR needs before the day:
the patient panel, the services being booked, insurance, and contact
preferences. The patient fills in their intake forms, consent and signatures on
paper on site, and staff scan those into the chart.

| Where | Value |
| --- | --- |
| `Intake` on the Events row | `paper` or `online`. Anything else, or no column, falls back to the default. |
| `DEFAULT_INTAKE` in `src/config.js` | The default, currently `paper`. |

This is a mode of the one page rather than a fork, so the full forms stay live
on any event set to `online` while they are polished. On a paper event:

- **Services are still picked**, with eligibility applied as usual. The
  Services Rendered rows they write are the appointment's visit types, and the
  clinical-sheet rows are keyed on the service, so both are written as before.
- **No form, consent or signature is rendered.** The medical-records upload and
  the electronic-signature agreement go too.
- **Insurance is always asked**, because checking Medicaid and insurance coverage
  before the day is half the point. Whether the patient is insured is required,
  as it is on any form that carries the `insurance` marker.
- **The submission names no forms.** `selectedServices[].formIds` is empty, so
  both backends fall back to the ServiceTypeID, which no document generator is
  keyed on, and no blank PDF is filed for a form that will arrive on paper. No
  backend change is needed. The payload also carries `intake: 'paper'`, which
  neither backend reads yet.

What the online part asks, against what the checks look up:

| Check | Looks up by | Online source |
| --- | --- | --- |
| Illinois MEDI | RIN; or SSN + DOB; or name + DOB; or name + SSN | Name, DOB, optional SSN, and the RIN as the insurance ID |
| Commercial eligibility | Payer, member ID, policyholder, name, DOB | Insurance block, patient panel |
| I-CARE | Name and DOB | Patient panel |
| EMR patient and appointment | Demographics, sex at birth, full address, guardian for a minor, event, slot, services | Patient panel, slot, picker |

### Patient panel fields that land in Patients

These apply in both modes, because the online forms create EMR patients too.

- **Sex at Birth** is asked beside Gender and is required. Gender drives
  eligibility and `@gender` triggers; sex at birth is what the EMR and the
  registries match on. It is written to a **`Sex at Birth` column appended as
  column 48** of `Patients`, after `DrChrono Chart ID`, `DrChrono API ID` and
  `Last Updated` (45–47), which registration writes blank because they are
  filled in later. Appending keeps every earlier column where it was.
- **Street, city and state are required**, alongside the ZIP. A patient cannot
  be created in the EMR without a full address.
- **`Primary Insurance Payer Name` (column 25) holds the policyholder**: the
  person the plan is under. The page labels it *Policyholder Name*;
  `primaryPayer` is still its field name. It is required once the patient says
  they are insured. There is no column for the policyholder's date of birth or
  relationship.


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
| `scored` | One item of a clinical instrument — see below |
| `insurance` | The insurance block — see below |
| `signature` | Inline Yes / No, with a pad at the end — see below |
| anything else | Text input |

The sheet's own **data validation on `QuestionType` has to list every type in
use**, or a write fails part way: Sheets applies a `setValues` row by row and
rejects the offending cell, leaving the sheet half-loaded.
`tools/importSchoolHealthForms.gs` widens that rule before it writes, adding only
what is missing. `radio_custom` appears in the rule but is used by no question
and implemented nowhere — treat it as vestigial rather than as something to build
on.

### `Section`

The tenth column, appended so every earlier column keeps its position. It holds
the section title the question sits under on the printed form — `Insurance`,
`Shots (vaccines)` — and it is what the page steps through.

Consecutive questions sharing a section form one group, and groups are packed
into steps of at most twelve questions. A section is never split, so a section
larger than that gets a step to itself; the cap only stops several small
sections being spread over several near-empty screens. Rows with a blank
`Section` — every form authored before this column — fall into a single step
named after the form, which is how they rendered before.

The shared core gathers its questions form by form, so its natural order walks
each form's sections in turn and doubles back. `DisplayOrder` on those rows is
therefore assigned by section rather than by generation order, and the two
signature sections (`Sharing with the school, and your signature` on the child
forms, `Safety check, sharing, and your signature` on the adult one) are
recorded under one name: the core asks each question once and must not carry two
names for one section.

`Options` splits on `|` when the cell contains one and on `,` otherwise. Comma
alone could not express an option whose label has a comma in it, and the School
Health forms have 80 of those — `Testing only (HIV, hep C, STI)` and the like.
Cells written before this contain no pipe, so they split exactly as they did.
**A pipe-separated cell may contain commas; a comma-separated one may not.**
`DisplayOrder` sorts questions within a form and accepts decimals, so `0.1` puts a
question first without renumbering everything after it; rows without a usable
value keep their sheet position, at the end.

### Triggers

`TriggerID` / `TriggerValue` hide a question until something else has a given value.

| `TriggerID` | Meaning |
| --- | --- |
| a QuestionID | Show when that question is answered with `TriggerValue` |
| several QuestionIDs | Show when **any** of them is both asked and answered with `TriggerValue` |
| `@age` | Show when the patient's age falls in `TriggerValue`, a range of years such as `12-17y` |
| `@gender` | Show when the selected gender equals `TriggerValue` |

**`TriggerID` may name several questions**, split the same way as `Options`.
A question hangs off whichever of them is on screen, which is what lets one row
follow either the child or the adult variant of a question rather than needing a
copy per age band — "If Medicaid, which plan?" follows both. A list is either
all question ids or a single `@` trigger; the two cannot be mixed.

**`@age` takes any range of years**, read exactly as `Age Eligibility` is:
`8-11y` and `65+y` gate *For children 8 to 11* and *If you are 65 or older*,
which do not line up with the bands. Because values are ranges rather than names,
one left behind by an older vocabulary still lands roughly where it was meant to
instead of matching nothing — which is how eight rows on `c2e4d150`, including a
self-harm question, were silently hidden when the bands last changed.

`@`-prefixed triggers read the demographics section instead of a question, so a
form can branch on age or gender without asking for it twice.

`TriggerValue` is a **list**, so one row can list several values and the
question appears if *any* of them matches — `0-3y|4-11y|12-17y` for any minor,
`12-17y|18+y` for 12 and over, or `Yes|Not sure` to catch both answers. It splits
the same way as `Options` — see below. A blank `TriggerValue`
alongside a `TriggerID` means `Yes`.

While the demographic is still blank the question stays hidden — we cannot tell
whether it applies, and hidden questions are neither validated nor submitted. Date
of birth and gender are both required, so the right set is always revealed before
the form can be submitted.

**Chained triggers work.** Visibility is recomputed to a fixed point after every
change, and a dependent whose trigger question is itself hidden is hidden too, so
chains of any depth collapse and clear correctly in both directions. A question
must still never trigger on itself — that hides it permanently, since it can
never be answered — and a cycle between questions is only caught by a pass cap.

Generated inputs carry **no** `required` attribute. A required control inside a
hidden section makes the browser abort submission with "An invalid form control is
not focusable" — no message, submit handler never runs, page looks frozen.
Required-ness is enforced in `collectResponses()`, which knows what is visible.

### `scored`

One item of a clinical instrument — PSC-17, the Illinois lead risk set,
PHQ-2/GAD-2. Consecutive `scored` questions sharing an option set are taken to be
the same instrument and render as a single matrix: an item per row, an option per
column, with the options named once in the header rather than once per item.
Below tablet width the matrix restacks into a block per item, the header hidden
from sight but not from screen readers, which get the item and the option
together from each radio's `aria-label`.

Only **ungated** items group. A row that could disappear on its own would leave a
hole in the table under a header still describing it, so a `scored` question
carrying a `TriggerID` renders on its own as an ordinary radio row.

Nothing is scored. The answer stored is the label the patient chose, not a
number. Where the instrument's published values are numeric the labels are the
instrument's own words — `Never / Sometimes / Often` for PSC-17 — which map onto
its digits positionally, so totalling is a lookup rather than a rewrite.

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

## Consent Items

`Consent Blocks` holds the prose; `Consent Items` holds the things a patient can
opt **out** of. The Consent for Services v2026.7 inverted the model: one
signature consents to every section the signer did not decline, rather than a
single certification checkbox covering everything.

| Column | Notes |
| --- | --- |
| `ConsentID` | The block these items belong to |
| `Section` | `1A`, `1B`, … — groups the items under their section heading |
| `Section Title` | Shown above the group |
| `ItemID` | Key within the consent, e.g. `hiv`. `ConsentID` + `ItemID` is unique |
| `Item Label` | What the patient sees beside the decline control |
| `Note Label` | Non-empty means the item reveals a text input when declined — "Which test?" for *Another test* |
| `DisplayOrder` | Order within the consent |

Declines are recorded per item, so "declined HIV screening" is a fact about the
consent rather than an answer buried in a questionnaire. An item with a
`Note Label` stores the note alongside the decline.

**Section 5 (audio recording) is deliberately absent.** The consent's own staff
box says recording consent is *"entered by staff, never by the tool"*, so the
app must not collect it.

Sections 6, 7 and 8 have no decline panel on the paper form — they are
informational or binding — so they appear in the prose and have no items.

## Stepping through a form

A School Health registration is 135 questions for a single eight-year-old, which
as one page is about fifteen thousand pixels of scroll. The same markup is shown
one step at a time, with a progress bar, Back and Next, and Submit only on the
last step.

Steps are built from what is on the page, so they follow the patient rather than
the sheet: a step whose questions have all been withdrawn by a trigger or by age
is dropped rather than shown empty, and a section heading left with nothing under
it is hidden while its box stays put.

**A step hides with `step-off`, never with `d-none`.** The distinction carries
real weight. `d-none` means *this does not apply to this patient*, and both
`collectResponses` and the trigger cascade read it; a step the patient has
already filled in is still part of the submission while it is off screen. Hiding
a step with `d-none` would silently drop every answer on it.

Advancing runs the browser's validation over the current step's controls only.
Validating the whole form at each step would trip over required fields on steps
the patient has not reached, which report as invalid and cannot be focused —
the same failure that `collectResponses` exists to avoid.

Submission validation can still reject something answered several steps back, so
`reject()` surfaces that element's step before scrolling to it. Scrolling to an
element on a step that is not showing scrolls to nothing.

Validation paints only what is wrong. `was-validated` goes on the whole form the
first time a step or submission is refused, and Bootstrap's default then styles
every *passing* control green — which includes every blank optional field, so an
untouched select showed a tick. `style.css` cancels the `:valid` styling.

## Questions the patient panel already asks

The School Health shared core is the paper form's front page, so it repeats the
patient panel: middle name, race, ethnicity, the parent's name and relationship,
a phone number, a typed signature. `src/prefill.js` maps those QuestionIDs to the
panel field that answers them. They are still rendered and still gated by their
own triggers — so the adult and child variants apply exactly as before — but they
carry `prefilled`, which hides them and which the steps treat as absent, and
`collectResponses` records the panel's answer in their place. Question Responses
and the Core Field Map therefore still get a value for every printed field.

`prefilled`, like `step-off`, is deliberately not `d-none`: a `d-none` question
does not apply and is not collected.

Only equivalents belong in the map. Sex at birth is not gender, so the forms'
sex-at-birth questions (`shccore-17`/`-18`, the physicals, the WOW sign-up) take
the panel's own **Sex at Birth**, never Gender; the child form's `Girl|Boy` is
mapped from Female and Male. Where the panel's wording differs from the paper option ("White or Caucasian" and
"White"), the map rewords it; a panel answer the paper has no box for passes
through rather than being dropped.

This lives in the page rather than the sheet because the panel is page markup:
a column naming `middleName` would be a sheet value that only means something to
one file of JavaScript.

## A hazard with range-shaped cells

`12-18`, `8-11` and `1-2` all look like dates to Google Sheets. Typed into a
default-formatted cell, `12-18` becomes December 18 stored as a date behind an
`MM-DD` number format — so it still *displays* as `12-18`, and the published CSV
still *carries* `12-18`, but `getValues()` in Apps Script hands back a `Date`.

That is invisible until something compares the cell to a string, which is how
four `@age` rows and `SPRTPHYS` survived migrations that fixed their siblings:
`0-12` has no valid month, so it stayed text, while `12-18` did not.

Age values now carry a `y` (`12-17y`), which Sheets does not parse, so this no
longer bites anything typed by hand. It still applies to any other range-shaped
answer or option. Anything in Apps Script that reads such a column should use
`getDisplayValues()`, and anything writing a range-shaped value should set the
cell's number format to `@` first, or the value it writes is parsed as a date on
the way in. The published CSV is unaffected either way, so the page never sees
this.

## Writing triggers

The Data Dictionary behind the School Health forms carries no conditional logic,
so their triggers were read off the printed forms and written by hand in
`tools/importSchoolHealthForms.gs`.

They are deliberately sparse. **A wrong trigger hides a question and its answer
is never collected; a missing one only shows something that did not apply.** The
two failures are not comparable, so anything ambiguous is left showing. Of 326
questions, 14 carry a conditional trigger and the rest are always asked.

Two things are worth knowing about the ones that exist:

- **A section heading that reads like a condition is not necessarily one.** The
  printed form heads the pregnancy block *If you came for pregnancy or after-baby
  care*, but it is **not** gated on the reason for the visit: somebody who books
  a check-up and is pregnant would otherwise never be asked. Nothing in it is
  required, and the heading already tells anyone it does not apply to that they
  can move on — which costs an adult one step and answers nothing wrongly. The
  age-based ones (*For children 8 to 11*, *If you are 65 or older*) are real
  conditions and are gated.
- A chain needs no extra gating at its tail. A question whose parent is hidden is
  hidden too, so "If none, check any that fit" only has to name the work-rule
  question; the age gating on that question's own parents carries down.
