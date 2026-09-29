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

Updated 2026-09-29.

**1. Re-run the importer, again.** The `@age` triggers are done — every one in
the published CSV now names a current band or a plain range. But the page's new
bands exposed two services still on the old vocabulary, and Age Eligibility is an
exact band match, so both are **hidden from every patient on the live site**:

- `SPRTPHYS` still reads `12-18`. `migrateAgeBands_` had the same `getValues()`
  bug the trigger migration had — the lone `12-18` is stored as December 18 — so
  it was skipped. The Macon event on 10/13 offers it.
- `LEADTEST` reads `0-12`. It was never in `AGE_MIGRATION`.

The importer now reads display values here too and has `LEADTEST` in the list.
Paste the regenerated `apps-script/tools/importSchoolHealthForms.gs`, run
`previewSchoolHealthImport()` and check that both show a `->`, then run
`importSchoolHealthForms()`.

**2. Confirm the deployed `endpoints.gs` writes declines.** The decline panel is
now live (Consent Items is published at gid `389763252`). The tracked
`endpoints.gs` writes them to a `Consent Declines` sheet since `ca6b070`; a web
app deployed before that silently drops them.

**3. Create an Event** whose `Services` names the new codes — being done from
AppSheet. Nothing exercises the new forms end to end until one exists.

Done: the band change and the page shipped together (`main` is live and serves
`0-3 / 4-11 / 12-17 / 18+`); Consent Items is published and wired in, and was
checked against the live rows — all 19 items render and `collectDeclines()`
returns them with their notes.

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
