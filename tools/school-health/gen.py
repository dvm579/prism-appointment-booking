# -*- coding: utf-8 -*-
"""Turn the Data Dictionary into Form Questions rows for the booking schema."""
import json, re, sys
from collections import defaultdict, OrderedDict
import os
HERE = os.path.dirname(os.path.abspath(__file__))


def here(name):
    """Intermediates live beside the scripts, not in the caller's cwd."""
    return os.path.join(HERE, name)


sys.stdout.reconfigure(encoding='utf-8', errors='replace')

recs = json.load(open(here('dd.json'), encoding='utf-8'))

CHILD = ['Parent 0-3', 'Parent 4-11', 'Parent 12-17']
INTAKE = CHILD + ['Adult']
# Sections that carry the shared core: how the form was filled, the visit, the
# parent/guardian block, insurance, Medicaid renewal, and the signature page.
CORE_SECTIONS = {'Parent 0-3': {2, 3, 4, 5, 6, 15}, 'Parent 4-11': {2, 3, 4, 5, 6, 16},
                 'Parent 12-17': {1, 2, 3, 4, 5, 14}, 'Adult': {1, 2, 3, 4, 5, 15}}
FORM_ID = {'Parent 0-3': 'shc0003', 'Parent 4-11': 'shc0411',
           'Parent 12-17': 'shc1217', 'Adult': 'shcadult',
           'PRISM_Vaccine_Consent': 'shcvax26'}
BAND = {'Parent 0-3': '0-3', 'Parent 4-11': '4-11', 'Parent 12-17': '12-17', 'Adult': '18+'}
CHILD_BANDS = '0-3|4-11|12-17'

# The two signature sections say the same thing in different words. The core
# asks each question once, so it must not carry two names for one section.
SECTION_ALIASES = {
    'Sharing with the school, and your signature': 'Sharing and your signature',
    'Safety check, sharing, and your signature': 'Sharing and your signature',
}

# Core questions are gathered form by form, so their natural order walks each
# form's sections in turn and jumps back and forth between them. Steps are
# sections, so the core is laid out in this order instead.
CORE_SECTION_ORDER = [
    'How this form was filled out',
    "Today's visit",
    'About you',
    'Parent or guardian filling this out',
    'Insurance',
    'Keeping Medicaid coverage',
    'Reaching you about results',
    'Sharing and your signature',
]


def norm(s):
    s = re.sub(r'\s+', ' ', str(s or '')).strip().rstrip(':').lower()
    return re.sub(r'[^a-z0-9 ]', '', s)


# The dictionary gives two instruments their raw scoring values rather than the
# words the patient reads. Both response sets are fixed by the instrument and
# map onto the digits positionally, so scoring stays a lookup away.
SCALE_LABELS = {
    '0|1|2': 'Never|Sometimes|Often',                                  # PSC-17
    '0|1|2|3': ('Not at all|Several days|More than half the days'
                '|Nearly every day'),                                  # PHQ-2 / GAD-2
}


def opts(rec):
    raw = str(rec['Allowed values'] or '').strip()
    if not raw:
        return ''
    parts = [p.strip() for p in raw.split('|') if p.strip()]
    # Drop the trailing write-in rule; it is a text field, not an option.
    parts = [p for p in parts if not re.fullmatch(r'(Other|Others)?:?\s*_+', p)]
    joined = '|'.join(parts)
    if str(rec['Data type'] or '').strip() == 'scored item':
        return SCALE_LABELS.get(joined, joined)
    return joined


def qtype(rec):
    t = str(rec['Data type'] or '').strip()
    o = [p.strip().lower() for p in str(rec['Allowed values'] or '').split('|') if p.strip()]
    if t == 'scored item':
        return 'scored'
    if t == 'multi-select':
        return 'multi_select'
    if t == 'free text':
        return 'text_area'
    if t == 'single-select':
        return 'radio_yes_no' if o == ['yes', 'no'] else 'single_select'
    return 'text'


def label(rec):
    return re.sub(r'\s+', ' ', str(rec['Label'] or '')).strip()


# --- shared core ------------------------------------------------------------
core = defaultdict(dict)
order_hint = {}
section_of = {}
for r in recs:
    d = r['Document']
    if d in CORE_SECTIONS and r['Section #'] in CORE_SECTIONS[d]:
        k = norm(r['Label'])
        core[k][d] = r
        if k not in order_hint:
            order_hint[k] = (INTAKE.index(d), r['Section #'], str(r['Field ID (printed on form)']))
            title = str(r['Section title'] or '').strip()
            section_of[k] = SECTION_ALIASES.get(title, title)

core_rows, mapping = [], []
n = 0
for k in sorted(core, key=lambda k: order_hint[k]):
    byform = core[k]
    variants = defaultdict(list)          # options -> forms sharing them
    for d, r in byform.items():
        variants[opts(r)].append(d)

    for o, forms in variants.items():
        n += 1
        qid = 'shccore-%d' % n
        rep = byform[forms[0]]
        bands = [BAND[d] for d in INTAKE if d in forms]
        # No trigger when every band has it; otherwise gate on the bands that do.
        trig = ('', '') if len(bands) == 4 else ('@age', '|'.join(bands))
        core_rows.append(OrderedDict(
            FormID='shccore', QuestionID=qid, DisplayOrder=n * 10,
            QuestionText=label(rep), QuestionType=qtype(rep), Options=o,
            IsRequired='Y' if k == 'type' and rep['Section #'] in (4, 5) else 'N',
            TriggerID=trig[0], TriggerValue=trig[1], Section=section_of[k]))
        for d in forms:
            mapping.append((qid, FORM_ID[d], str(byform[d]['Field ID (printed on form)'])))

# --- consent-attached fields ------------------------------------------------
# Four fields live on the Consent for Services rather than in the Data
# Dictionary. Two of them - the primary care provider's name and phone - are
# already asked as "regular doctor or clinic (name, phone or fax)" above, and
# Section 3 sends results to exactly that person, so they are not asked twice.
# The remaining two have nowhere else to live and are asked of everyone.
CONSENT_FIELDS = [
    ('Best way to reach you for follow-up:', 'single_select', 'Phone|Text|Video'),
    ('Best days and times to reach you:', 'text', ''),
]
for text, typ, options in CONSENT_FIELDS:
    n += 1
    core_rows.append(OrderedDict(
        FormID='shccore', QuestionID='shccore-%d' % n, DisplayOrder=n * 10,
        QuestionText=text, QuestionType=typ, Options=options,
        IsRequired='N', TriggerID='', TriggerValue='',
        Section='Reaching you about results'))

# --- per-form clinical questions -------------------------------------------
form_rows = []
for doc, fid in FORM_ID.items():
    skip = CORE_SECTIONS.get(doc, set())
    fields = [r for r in recs if r['Document'] == doc and r['Section #'] not in skip]
    for i, r in enumerate(fields, 1):
        form_rows.append(OrderedDict(
            FormID=fid, QuestionID='%s-%d' % (fid, i),
            DisplayOrder=(int(r['Section #']) * 100) + i,
            QuestionText=label(r), QuestionType=qtype(r), Options=opts(r),
            IsRequired='N', TriggerID='', TriggerValue='',
            Section=SECTION_ALIASES.get(
                str(r['Section title'] or '').strip(),
                str(r['Section title'] or '').strip())))

# --- conditional logic ------------------------------------------------------
#
# The Data Dictionary carries none, so these are read off the printed forms and
# written out by hand. Deliberately sparse: a wrong trigger hides a question and
# the answer is never collected, while a missing one only shows something that
# did not apply. Anything ambiguous is left showing.

# QuestionID -> (TriggerID, TriggerValue)
QUESTION_TRIGGERS = {
    # "If Medicaid, which plan?" follows whichever insurance question is on
    # screen; the child and adult variants word their Medicaid option
    # differently, so both spellings are listed.
    'shccore-28': ('shccore-26|shccore-27',
                   'Medicaid / All Kids|Medicaid|CHIP / All Kids'),
    # The work rule only applies to the ACA Adult group, asked of the parent on
    # the child forms and of the patient on the adult one.
    'shccore-41': ('shccore-40|shccore-60', 'ACA Adult'),
    # Exemptions are asked only of someone who met none of the work rules.
    'shccore-42': ('shccore-41', 'None of these'),
    'shcadult-29': ('shcadult-28', 'Planning'),
}

# (FormID, Section) -> (TriggerID, TriggerValue); applies to every question in it
SECTION_TRIGGERS = {
    # The pregnancy block is NOT gated on the reason for the visit, though the
    # printed form heads it "If you came for pregnancy or after-baby care".
    # Somebody who books a check-up and is pregnant would otherwise never be
    # asked, and the heading already tells anyone it does not apply to that they
    # can move on. Nothing in it is required.
    # Neither of these lines up with an age band, so they use a plain range.
    ('shcadult', 'If you are 65 or older'): ('@age', '65+'),
    ('shc0411', 'For children 8 to 11'): ('@age', '8-11'),
}


def apply_triggers(rows):
    """Stamps the tables above onto the generated rows, and checks they fit."""
    by_id = {r['QuestionID']: r for r in rows}
    applied = 0

    for qid, (trigger, value) in QUESTION_TRIGGERS.items():
        row = by_id[qid]
        assert not row['TriggerID'], '%s already has a trigger' % qid
        for parent in trigger.split('|'):
            if parent.startswith('@'):
                continue
            assert parent in by_id, '%s triggers on missing %s' % (qid, parent)
            options = by_id[parent]['Options'].split('|')
            assert any(v in options for v in value.split('|')),                 '%s: none of %r is an option of %s' % (qid, value, parent)
        row['TriggerID'], row['TriggerValue'] = trigger, value
        applied += 1

    for (form, section), (trigger, value) in SECTION_TRIGGERS.items():
        hit = [r for r in rows if r['FormID'] == form and r['Section'] == section]
        assert hit, 'no questions in %s / %s' % (form, section)
        for row in hit:
            if row['TriggerID']:
                continue          # a question-level trigger is more specific
            row['TriggerID'], row['TriggerValue'] = trigger, value
            applied += 1

    return applied


def core_rank(row):
    try:
        return CORE_SECTION_ORDER.index(row['Section'])
    except ValueError:
        return len(CORE_SECTION_ORDER)


# QuestionIDs stay as assigned - they are already in the sheet - and only the
# ordering changes, which is what the page sorts by.
core_rows.sort(key=lambda r: (core_rank(r), int(r['DisplayOrder'])))
for position, row in enumerate(core_rows, 1):
    row['DisplayOrder'] = position * 10

# Fields the paper form gives to staff: who ran a phone interview and the
# initials confirming the read-back. A patient cannot answer either, and staff
# record them in the EMR. Dropped after numbering so no other QuestionID moves;
# the importer deletes their rows from the sheet (RETIRED_QUESTIONS).
STAFF_ONLY = {'shccore-48', 'shccore-49'}
assert STAFF_ONLY <= {r['QuestionID'] for r in core_rows}, 'a staff-only id no longer exists'
assert all('staff' in r['QuestionText'].lower() for r in core_rows if r['QuestionID'] in STAFF_ONLY)
core_rows = [r for r in core_rows if r['QuestionID'] not in STAFF_ONLY]
mapping = [m for m in mapping if m[0] not in STAFF_ONLY]

rows = core_rows + form_rows
triggered = apply_triggers(rows)
json.dump([dict(r) for r in rows], open(here('questions_out.json'), 'w', encoding='utf-8'))
json.dump(mapping, open(here('core_mapping.json'), 'w', encoding='utf-8'))
json.dump(sorted(STAFF_ONLY), open(here('retired_out.json'), 'w', encoding='utf-8'))

print('core questions   :', len(core_rows), '(from', sum(len(v) for v in core.values()),
      'paper fields +', len(CONSENT_FIELDS), 'consent fields)')
by = defaultdict(int)
for r in form_rows:
    by[r['FormID']] += 1
for k in ['shc0003', 'shc0411', 'shc1217', 'shcadult', 'shcvax26']:
    print(f'  {k:10} {by[k]:4}')
print('TOTAL Form Questions rows:', len(rows))
print('core -> paper field mappings:', len(mapping))
print()
print('types:', dict((t, sum(1 for r in rows if r['QuestionType'] == t))
                     for t in sorted({r['QuestionType'] for r in rows})))
print('questions with a trigger:', sum(1 for r in rows if r['TriggerID']),
      '(%d age-gated core, %d conditional)' % (
          sum(1 for r in core_rows if r['TriggerID'] == '@age'), triggered))
print()
sections = []
for r in rows:
    key = (r['FormID'], r['Section'])
    if key not in sections:
        sections.append(key)
print('sections (= steps):', len(sections))
for fid, sec in sections:
    n = sum(1 for r in rows if r['FormID'] == fid and r['Section'] == sec)
    print(f'  {fid:10} {n:3}  {sec}')
