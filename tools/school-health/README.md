# School Health form pipeline

Turns the program's Data Dictionary into the rows the registration page reads,
and emits the Apps Script that loads them into the workbook.

Nothing here runs in production. It is a build step whose only output is
`apps-script/tools/importSchoolHealthForms.gs`, which is tracked.

## Running it

From this directory, in order:

```bash
python gen.py            # dd.json            -> questions_out.json, core_mapping.json
python sheets.py         # consent_html.html  -> sheets_out.json
python emit_importer.py  # both               -> apps-script/tools/importSchoolHealthForms.gs
node imptest.js          # 51 checks against a stubbed workbook
```

The three `*_out.json` / `core_mapping.json` files are intermediates and are not
tracked. Re-running the four commands on a clean checkout should leave
`git status` clean — if the importer comes out different, something in the
inputs or the generator changed and that difference is the thing to look at.

## Inputs

| File | What it is |
| --- | --- |
| `dd.json` | The `Data_Dictionary` sheet of `PRISM_Standards_and_Data_Dictionary_Workbook_v1.0.xlsx`, extracted to JSON. 918 rows covering every document in the program; the six intake forms are 464 of them. Field definitions only — no patient data. |
| `consent_html.html` | The Consent for Services prose, section by section, verbatim. Rebuilt from the source PDF when the program bundle is on the machine and read from here otherwise, so the pipeline runs on a checkout alone. |

The program bundle itself is **not** in this repo. `sheets.py` looks for it at the
path in `BUNDLE` and falls back to the cache; it says which it used.

To refresh `dd.json` from a new version of the workbook:

```bash
python -c "import openpyxl, json; wb = openpyxl.load_workbook(PATH, read_only=True); ws = wb['Data_Dictionary']; rows = list(ws.iter_rows(values_only=True)); hdr = list(rows[0]); json.dump([dict(zip(hdr, r)) for r in rows[1:] if r and r[0]], open('dd.json', 'w', encoding='utf-8'), default=str)"
```

## What the generator decides

- **The shared core.** ~173 paper fields repeat across the four intake forms with
  different printed numbers, so they merge by *label* into 64 questions on one
  `shccore` form that every age service lists. `core_mapping.json` keeps
  QuestionID → printed field id per form, which is what the document generators
  need. Where an option set differs between the child and adult forms the
  question splits into age-gated variants — four labels do.
- **Sections.** Each row carries the section title it sits under on the printed
  form, which is what the page steps through. Core rows are ordered by section
  rather than by the form they were gathered from, or the steps double back.
- **Triggers.** The dictionary carries none. `QUESTION_TRIGGERS` and
  `SECTION_TRIGGERS` in `gen.py` are read off the printed forms by hand and
  asserted at generation time to name a real question and a real option of it.
  Deliberately sparse — see *Writing triggers* in `docs/schema.md`.
- **Instrument labels.** PSC-17 and PHQ-2/GAD-2 arrive as their raw scoring
  values (`0 | 1 | 2`); `SCALE_LABELS` restores the words the patient reads.

## What the importer does

Upserts keyed by each row's own id — QuestionID and FormID together for Core
Field Map, where a core question has a row per paper form — so a re-run corrects
rather than duplicates. Upserts never delete, so questions dropped from the
generator (`STAFF_ONLY` in `gen.py`) are removed by name from Form Questions and
Core Field Map.
`previewSchoolHealthImport()` reports every change and writes nothing. It refuses
outright if the workbook is missing any of Forms, Form Questions, Service Types
or Consent Blocks, and it widens the QuestionType validation and adds the Section
column before writing rows that need them.
