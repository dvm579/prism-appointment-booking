# School Health rollout: where this stands

The six PRISM School Health intake forms have been translated into the booking
schema, loaded into the workbook, and the page has been reworked to cope with
their length. What remains is configuration and a deploy, not code.

Written 2026-09-28.

## In the workbook already

Loaded by `apps-script/tools/importSchoolHealthForms.gs`, verified against the
published CSV:

- **326 Form Questions rows** across six forms — `shccore` (the shared core, 62
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
contact and insurance questions repeated on each form; two staff-only fields have
been dropped since.

Teen Private (27 fields) is **not** modelled — it stays on paper.

## Outstanding

Updated 2026-09-29, after the first live test event (`bc41fe7d`).

**1. Re-run the importer** to delete the two staff-only questions, `shccore-48`
(phone-interview staff name) and `shccore-49` (read-back initials), from Form
Questions and Core Field Map. Upserts never delete, so until then patients still
see them. The same run switches Core Field Map to a QuestionID + FormID key; it
was keyed on FormID alone, so a changed mapping could never land (the rows already
there were unharmed). Preview first: expect "would remove 2" for each sheet.

**2. Confirm the deployed `endpoints.gs` writes declines.** The tracked copy
writes them to a `Consent Declines` sheet since `ca6b070`; a web app deployed
before that silently drops them.

Done:

- Age bands: every Age Eligibility and `@age` value is in the current vocabulary
  (`SPRTPHYS` and `LEADTEST` fixed by the second importer run).
- Consent Items is published (gid `389763252`) and the decline panel is live.
- Validation no longer paints blank optional fields green with a tick.
- The header Back is now "Change time slot"; the step Back only moves steps.
- The shared core no longer re-asks what the patient panel collected — see
  *Questions the patient panel already asks* in `docs/schema.md`.

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
- **Triggers are deliberately sparse** — 14 of 326. A wrong one hides a question
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
