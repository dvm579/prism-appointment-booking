# -*- coding: utf-8 -*-
"""Forms, Service Types, Consent Blocks and Consent Items rows.

Writes sheets_out.json, which emit_importer.py folds into the Apps Script
importer alongside gen.py's questions.
"""
import json, sys, re, html, io, os

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
CONSENT_CACHE = os.path.join(HERE, 'consent_html.html')

# The program bundle is not in this repo. When it is on the machine the consent
# prose is rebuilt from the PDF and the cache refreshed; otherwise the cache is
# used, so the pipeline runs on a checkout alone.
BUNDLE = ("C:/Users/User/Downloads/PRISM_School_Health_Clinic_Program_v1.0/"
          "PRISM_School_Health_Clinic_Program_v1.0 1/PRISM_School_Health_Clinic_Program_v1.0")
CONSENT_PDF = BUNDLE + "/0_Entry_stack/PRISM_Consent_for_Services_v2026.7.pdf"

CONSENT_ID = 'cfs20267'

FORMS = [
    ('shccore',  'School Health - shared core'),
    ('shc0003',  'School Health Parent Form (ages 0-3)'),
    ('shc0411',  'School Health Parent Form (ages 4-11)'),
    ('shc1217',  'School Health Parent Form (ages 12-17)'),
    ('shcadult', 'School Health Patient Form (18+)'),
    ('shcvax26', 'School Health Vaccine Consent'),
]

SERVICE_TYPES = [
    # ServiceTypeID, Name, Intake Form, AppSheet view, ConsentIDs, Age, Gender, Active
    ('SHCV0003', 'School Health Visit (ages 0-3)',   'shccore,shc0003',  '', CONSENT_ID, '0-3y',  '', 'TRUE'),
    ('SHCV0411', 'School Health Visit (ages 4-11)',  'shccore,shc0411',  '', CONSENT_ID, '4-11y', '', 'TRUE'),
    ('SHCV1217', 'School Health Visit (ages 12-17)', 'shccore,shc1217',  '', CONSENT_ID, '12-17y', '', 'TRUE'),
    ('SHCVADLT', 'School Health Visit (18+)',        'shccore,shcadult', '', CONSENT_ID, '18+y',  '', 'TRUE'),
    ('SHCVAXIM', 'Immunizations at this visit',      'shcvax26',         '', CONSENT_ID, '0-3y,4-11y,12-17y', '', 'TRUE'),
]


# Section 5 (audio recording) is deliberately absent: the consent's staff box
# says recording consent is "entered by staff, never by the tool".
CONSENT_ITEMS = [
    ('1A', 'Treatment',                  'treatment',  'Treatment', ''),
    ('1A', 'Treatment',                  'trainees',   'Trainees or observers', ''),
    ('1B', 'Laboratory testing',         'hiv',        'HIV screening', ''),
    ('1B', 'Laboratory testing',         'hcv',        'Hepatitis C screening', ''),
    ('1B', 'Laboratory testing',         'holdresult', 'Hold results for clinician review', ''),
    ('1B', 'Laboratory testing',         'othertest',  'Another test', 'Which test?'),
    ('1C', 'Immunizations and registry', 'hpv',        'HPV vaccine', ''),
    ('1C', 'Immunizations and registry', 'flu',        'Flu vaccine', ''),
    ('1C', 'Immunizations and registry', 'covid',      'COVID-19 vaccine', ''),
    ('1C', 'Immunizations and registry', 'othervax',   'Another vaccine', 'Which vaccine?'),
    ('1C', 'Immunizations and registry', 'icare',      'I-CARE reporting (non-mandatory)', ''),
    ('1C', 'Immunizations and registry', 'icarelock',  'Lock my existing I-CARE record', ''),
    ('1D', 'Telehealth follow-up',       'telehealth', 'Telehealth follow-up', ''),
    ('2',  'Communications and portal',  'sms',        'Text messages', ''),
    ('2',  'Communications and portal',  'email',      'Email', ''),
    ('2',  'Communications and portal',  'autocalls',  'Automated calls', ''),
    ('2',  'Communications and portal',  'allcontact', 'All contact (except an urgent result)', ''),
    ('3',  'Results to my doctor',       'pcp',        'Sending results to my doctor', ''),
    ('4',  'De-identified research',     'research',   'Contact about research', ''),
]

DOT = '\u00b7'
HEADS = ['1 ' + DOT + ' CONSENT FOR SERVICES',
         '2 ' + DOT + ' COMMUNICATIONS AND PATIENT PORTAL ACCESS',
         '3 ' + DOT + ' DISCLOSURE OF RESULTS TO PRIMARY CARE PROVIDER',
         '4 ' + DOT + ' DE-IDENTIFIED RESEARCH AND QUALITY USE',
         '5 ' + DOT + ' AUDIO RECORDING FOR CLINICAL DOCUMENTATION',
         '6 ' + DOT + ' TECHNOLOGY USE IN PRISM OPERATIONS',
         '7 ' + DOT + ' ASSIGNMENT OF BENEFITS AND FINANCIAL RESPONSIBILITY',
         '8 ' + DOT + ' NOTICE OF PRIVACY PRACTICES AND PATIENT RIGHTS']


def consent_html_from_pdf():
    """The consent's own words, section by section, verbatim."""
    import pypdf

    reader = pypdf.PdfReader(CONSENT_PDF)
    text = "\n".join((p.extract_text() or '') for p in reader.pages[:2])
    for a, b in [('\u2019', "'"), ('\u201c', '"'), ('\u201d', '"')]:
        text = text.replace(a, b)

    pos = [(h, text.find(h)) for h in HEADS]
    blocks = ['<p class="text-muted small">Read each section. Use the <strong>I decline</strong> '
              'controls to opt out of anything you do not want; declining one item does not affect '
              'any other care. Signing consents to every section you did not decline.</p>']

    for i, (head, at) in enumerate(pos):
        if at < 0:
            continue
        end = next((q for _, q in pos[i + 1:] if q > at), len(text))
        body = text[at + len(head):end]
        # The decline panels are rendered from Consent Items, not from the prose.
        body = re.split(r'I DECLINE\s+initial the box to decline', body)[0]
        body = re.sub(r'\s*\n\s*', ' ', body).strip()
        body = re.sub(r'\s{2,}', ' ', body)

        num, title = head.split(' ' + DOT + ' ', 1)
        blocks.append('<h5 class="mt-3">%s. %s</h5>\n<p>%s</p>'
                      % (html.escape(num), html.escape(title.title()), html.escape(body)))
    return '\n'.join(blocks)


if os.path.exists(CONSENT_PDF):
    consent_html = consent_html_from_pdf()
    io.open(CONSENT_CACHE, 'w', encoding='utf-8', newline='\n').write(consent_html)
    source = 'rebuilt from the source PDF, cache refreshed'
else:
    consent_html = io.open(CONSENT_CACHE, encoding='utf-8').read()
    source = 'read from consent_html.html (the program bundle is not on this machine)'

out = {
    'forms': FORMS,
    'serviceTypes': SERVICE_TYPES,
    'consentBlock': (CONSENT_ID, 'Consent for Services v2026.7', consent_html, 10),
    'consentItems': [(CONSENT_ID, s, t, i, lbl, note, (n + 1) * 10)
                     for n, (s, t, i, lbl, note) in enumerate(CONSENT_ITEMS)],
}
json.dump(out, io.open(os.path.join(HERE, 'sheets_out.json'), 'w', encoding='utf-8'),
          ensure_ascii=False)

print('forms         :', len(FORMS))
print('service types :', len(SERVICE_TYPES), 'new')
print('consent items :', len(CONSENT_ITEMS))
print('consent HTML  :', len(consent_html), 'chars -', source)
