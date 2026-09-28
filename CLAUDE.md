# Working in this repo

A static registration page for Prism's mobile and school health clinics, backed
entirely by Google Sheets and Apps Script. There is no build step and no package
manager: `index.html` loads ES modules from `src/` directly.

Start with [`docs/schema.md`](docs/schema.md). It is the design document for the
data model and is kept current — how services decide which forms and consent a
patient sees, what each `QuestionType` renders as, how triggers and age bands
work, and how a long form is stepped through. Most questions about *why*
something is shaped the way it is are answered there.

## Layout

| Path | What it is |
| --- | --- |
| `src/` | The page. `questions.js` renders the questionnaire, `steps.js` shows one section at a time, `consent.js` the opt-out consent, `catalog.js` resolves services to forms. |
| `apps-script/` | Mirrors the Apps Script project. `endpoints.gs` is the web app; `pdfHandler.gs` is the document queue; one `.gs` per form generates its PDF. |
| `apps-script/tools/` | One-off scripts run by hand from the editor, never on a trigger. |
| `tools/school-health/` | Build step that generates the School Health rows and the importer. See its README. |
| `docs/schema.md` | The data model. |

## Things that have bitten

- **The sheet and the page ship together.** `src/patient.js` computes an age
  band and `Service Types` gates on the same vocabulary. Deploying one without
  the other hides every age-gated service.
- **The Drive connector cannot write cells.** Its `update_file` changes only
  title and parent. Sheet rows have to go through an Apps Script the user runs,
  with a preview mode and upserts keyed by row id.
- **Range-shaped values become dates.** Google Sheets reads `12-18` as December
  18 and stores a date behind an `MM-DD` format, so the cell still shows and
  exports `12-18` while `getValues()` returns a `Date`. Apps Script reading those
  columns should use `getDisplayValues()`. See the hazard note in `docs/schema.md`.
- **The workbook is "Events Management"** (`17226ud6cLY7gbLyv0IS_3k1mylHeWuoHHKyr96hoy1I`),
  not "Campaigns, Events, Facilities" — that one has an unrelated `Events` sheet
  and none of the booking sheets.
- **Commit straight to `main`.** No feature branches here, even though `main`
  deploys live.

## Verifying UI work

There is no test runner for the page. Changes are checked by serving the repo
(`.claude/launch.json` has a static server) and driving the real render path in a
browser with fixture rows, rather than by reasoning about the markup. The
Apps Script tools do have harnesses — `node tools/school-health/imptest.js`.
