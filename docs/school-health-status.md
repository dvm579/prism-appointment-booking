# School Health rollout: where this stands

The six PRISM School Health intake forms have been translated into the booking
schema, loaded into the workbook, and the page has been reworked to cope with
their length. What remains is configuration and a deploy, not code.

Written 2026-09-28.

## In the workbook already

Loaded by `apps-script/tools/importSchoolHealthForms.gs`, verified against the
published CSV:

- **328 Form Questions rows** across six forms — `shccore` (the shared core, 64
  questions listed by every age service) plus `shc0003`, `shc0411`, `shc1217`,
  `shcadult` and `shcvax26`. Every row carries a `Section`.
- **Five Service Types** — `SHCV0003`, `SHCV0411`, `SHCV1217`, `SHCVADLT`,
  `SHCVAXIM`.
- **Consent Blocks** row `cfs20267`, the Consent for Services v2026.7 prose.
- **Consent Items**, a new sheet: the 19 things a patient can decline.
- **Core Field Map**, a new sheet: QuestionID → the printed field id on each
  paper form, for the document generators.
- Age eligibility on the five pre-existing services restated in the new bands.

464 paper fields became 328 rows because ~173 of them are the same demographics,
contact and insurance questions repeated on each form.

Teen Private (27 fields) is **not** modelled — it stays on paper.

## Outstanding

**1. Re-run the importer.** Four rows still need it: `c2e4d150-38` to `-41` on
the WOW pediatric form, whose `@age` triggers read `12-18` — a band `ageBand()`
no longer returns, so those questions are hidden. They include the teen
self-harm question. The first attempt skipped them because Sheets had stored
`12-18` as a date; the importer now compares display values and forces the cell
to text. Run `previewSchoolHealthImport()` first — it writes nothing.

**2. Publish `Consent Items` to web and set its gid** in `CSV_URLS.consentItems`
in `src/config.js`. It is `null`, so the opt-out decline panel does not render at
all: consent currently falls back to prose plus the certification checkbox, which
is the pre-opt-out behaviour. Nothing breaks, but no decline can be recorded.

**3. Create an Event** whose `Services` names the new codes. Nothing exercises
the new forms until one exists.

**4. Deploy the frontend with the sheet.** `src/patient.js` now computes
`0-3 / 4-11 / 12-17 / 18+`. The workbook has been migrated to match. Shipping the
page without that migration — or reverting one — hides every age-gated service,
including the live vaccination and physical ones.

Once the gid is in and an event exists, the whole flow can be walked in a browser
against real data rather than a fixture.

## Decisions worth not relitigating

- **Consent is opt-out.** One signature covers every section not declined.
  Declines are their own sheet and their own rows, because the printed form's
  staff box requires each one verified and entered in the EMR.
- **Audio recording is not collected.** The consent's staff box says that one is
  "entered by staff, never by the tool".
- **Scored instruments are not scored.** The grid captures the label the patient
  chose; PSC-17's words map onto its digits positionally, so totalling is a
  lookup away.
- **The pregnancy block always shows to adults**, though the paper heads it "If
  you came for pregnancy or after-baby care". Somebody who books a check-up and
  is pregnant would otherwise never be asked. The age-based sections *are* gated.
- **Triggers are deliberately sparse** — 14 of 328. A wrong one hides a question
  and its answer is never collected; a missing one only shows something that did
  not apply.

## Known gaps

- The Data Dictionary encodes no conditional logic, so the triggers were read off
  the printed forms by hand. More may be derivable with a clinician's eye.
- `%wowtc.declines.{hpv,covid,flu}_vaccination_if_indicated%` have nowhere to
  print on the WOW consent artwork — recorded in responses, absent from the PDF.
- The generator for `apps-script/tools/makeWowSlidesTemplates.gs` was lost with a
  scratchpad; the tool itself is tracked and still runs, but regenerating it
  would mean redoing the PDF measurement.
