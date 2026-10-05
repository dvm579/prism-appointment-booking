# -*- coding: utf-8 -*-
"""Measure where every School Health question is filled in on its printed PDF.

The six intake PDFs have no AcroForm fields, so the backend fills them by
drawing onto the original artwork. This script finds each spot by reading the
page itself - printed field ids, label text, the ☐ glyphs and the rules - and
writes `backend/src/docs/shc/fields.json` plus `measure_report.md`.

    python measure_pdfs.py                 # needs gen.py's outputs and the bundle
    python measure_pdfs.py --proof DIR     # also renders every page with dummies

Coordinates are PDF points with a top-left origin, as in makeWowSlidesTemplates.gs.

Field conventions (the backend relies on these):
  check  The ink box of the ☐ glyph (tighter than the font bbox). Centre a mark in it.
  text   The box's bottom edge sits on the rule (underscores or a drawn line).
         Draw with the baseline at top + height - 2.5, left-aligned at `left`,
         shrinking below `size` if the value is wider than `width`.
  area   The empty band under a full-width label bar. First baseline at
         top + size; wrap within width; lines every size * 1.2.
A blank printed as several underscore groups joined only by `/`
(`___/___/____`) is one field across all of them. Where printed words sit
between groups (`______ years smoked ______ packs a day`) the field covers the
first group only, so nothing is drawn over the words; the report lists these.
"""
import ast, json, os, re, sys
from collections import defaultdict

import pymupdf

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
BUNDLE = os.environ.get('SHC_BUNDLE', 'C:/Users/User/Downloads/PRISM_School_Health_Clinic_Program_v1.0/'
                        'PRISM_School_Health_Clinic_Program_v1.0/1_Before_the_visit')
OUT_JSON = os.path.join(REPO, 'backend', 'src', 'docs', 'shc', 'fields.json')
OUT_REPORT = os.path.join(HERE, 'measure_report.md')

FORMS = [  # FormID, Data Dictionary document, PDF
    ('shc0003', 'Parent 0-3', 'PRISM_Parent_Form_Child_0-3_v1.0.pdf'),
    ('shc0411', 'Parent 4-11', 'PRISM_Parent_Form_Child_4-11_v1.0.pdf'),
    ('shc1217', 'Parent 12-17', 'PRISM_Parent_Form_Teen_12-17_v1.0.pdf'),
    ('shcadult', 'Adult', 'PRISM_Patient_Form_Adult_18plus_v1.0.pdf'),
    ('shcvax26', 'PRISM_Vaccine_Consent', 'PRISM_Vaccine_Consent_v1.0.pdf'),
]
BOX = '\u2610'
ID_COLOR = 0x9aa3b2           # the grey of printed field ids
HEADER_BOTTOM = 75            # the Name / DOB / Visit date strip on every page
FOOTER_TOP = 760
LEFT_COL = 60                 # labels and grid items start at x 40.6
OPTION_COL = 150              # option cells start at x 200 (label cells end at 198)

# Hand overrides. Empty: every position below is measured. Kept so that a
# future misprint can be patched here, visibly, rather than in the logic.
OVERRIDES = {}


def load(name):
    return json.load(open(os.path.join(HERE, name), encoding='utf-8'))


def norm(s):
    s = str(s or '').replace(BOX, ' ').replace('_', ' ').lower()
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def label(rec):
    return re.sub(r'\s+', ' ', str(rec['Label'] or '')).strip()


def core_sections():
    """gen.py's CORE_SECTIONS, read without running gen.py."""
    tree = ast.parse(open(os.path.join(HERE, 'gen.py'), encoding='utf-8').read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], 'id', '') == 'CORE_SECTIONS':
            return ast.literal_eval(node.value)
    raise SystemExit('CORE_SECTIONS not found in gen.py')


# --- questions per PDF -------------------------------------------------------

def questions_for_forms():
    """FormID -> [question], each carrying its Data Dictionary row."""
    dd, rows, mapping = load('dd.json'), load('questions_out.json'), load('core_mapping.json')
    by_id = {r['QuestionID']: r for r in rows}
    skip = core_sections()
    out = {}
    for fid, doc, _ in FORMS:
        recs = [r for r in dd if r['Document'] == doc]
        by_field = {str(r['Field ID (printed on form)']): r for r in recs}
        qs = []
        # Core questions, via the printed id core_mapping gives them on this form.
        for qid, form, field in mapping:
            if form == fid:
                qs.append(dict(row=by_id[qid], dd=by_field[field], field=field))
        # Per-form questions are numbered over the dictionary rows outside the core.
        own = [r for r in recs if r['Section #'] not in skip.get(doc, set())]
        mine = sorted((r for r in rows if r['FormID'] == fid),
                      key=lambda r: int(r['QuestionID'].rsplit('-', 1)[1]))
        assert len(own) == len(mine), (fid, len(own), len(mine))
        for rec, row in zip(own, mine):
            assert label(rec) == row['QuestionText'], (row['QuestionID'], label(rec))
            qs.append(dict(row=row, dd=rec, field=str(rec['Field ID (printed on form)'])))
        qs.sort(key=lambda q: (int(q['dd']['Section #']), [int(x) for x in re.findall(r'\d+', q['field'])]))
        out[fid] = qs
    return out


# --- page model --------------------------------------------------------------

class Seg:
    """A run of characters on one baseline with one style."""

    def __init__(self, chars, style):
        self.chars = chars
        self.style = style
        self.text = ''.join(c['c'] for c in chars)
        self.x0 = min(c['bbox'][0] for c in chars)
        self.x1 = max(c['bbox'][2] for c in chars)
        self.y0 = min(c['bbox'][1] for c in chars)
        self.y1 = max(c['bbox'][3] for c in chars)
        self.oy = chars[0]['origin'][1]
        self.size = chars[0]['size']
        self.color = chars[0]['color']


class Phrase:
    """Consecutive lines of one label or item, left-aligned in one cell."""

    def __init__(self, seg):
        self.segs = [seg]

    @property
    def text(self):
        return ' '.join(s.text.strip() for s in self.segs)

    x0 = property(lambda self: self.segs[0].x0)
    x1 = property(lambda self: max(s.x1 for s in self.segs))
    y0 = property(lambda self: self.segs[0].y0)
    y1 = property(lambda self: self.segs[-1].y1)
    style = property(lambda self: self.segs[0].style)


def style_of(ch):
    if ch['c'] == BOX:
        return 'glyph'
    if ch['size'] < 6.5:
        return 'id' if ch['color'] == ID_COLOR else 'small'
    return 'bold' if 'Bold' in ch['font'] else 'reg'


class Page:
    def __init__(self, page, number):
        self.page, self.number = page, number
        chars = []
        for b in page.get_text('rawdict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    for c in s['chars']:
                        c = dict(c, size=s['size'], font=s['font'], color=s['color'])
                        c['style'] = style_of(c)
                        chars.append(c)
        # Rows: every character on one baseline, left to right.
        rows = defaultdict(list)
        for c in chars:
            rows[round(c['origin'][1] * 2) / 2].append(c)
        self.rows = []
        for y in sorted(rows):
            if self.rows and abs(self.rows[-1][0] - y) < 0.6:
                self.rows[-1][1].extend(rows[y])
            else:
                self.rows.append([y, list(rows[y])])
        for r in self.rows:
            r[1].sort(key=lambda c: c['bbox'][0])
        for ri, (_, cs) in enumerate(self.rows):
            for ci, c in enumerate(cs):
                c['ri'], c['ci'] = ri, ci
        self._drawings()
        self._segments()
        self._phrases()
        self._underscores()

    def _drawings(self):
        self.rules, self.lines, self.bars = [], [], []
        seen = set()
        for d in self.page.get_drawings():
            if d['type'] == 's':
                for it in d['items']:
                    if it[0] != 'l':
                        continue
                    a, b = it[1], it[2]
                    if abs(a.y - b.y) > 0.2 or abs(a.x - b.x) < 30:
                        continue
                    key = ('l', round(a.x, 1), round(b.x, 1), round(a.y, 1))
                    if key in seen:
                        continue
                    seen.add(key)
                    x0, x1 = sorted((a.x, b.x))
                    w = d.get('width') or 0
                    if w < 0.5 and x1 - x0 > 300:
                        self.rules.append(a.y)            # row separators
                    elif 0.5 <= w <= 1.2:
                        self.lines.append((x0, x1, a.y))  # write-in rules
            elif d['type'] == 'f':
                r = d['rect']
                key = ('f', round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1))
                if key in seen:
                    continue
                seen.add(key)
                fill = d.get('fill') or (0, 0, 0)
                if r.x1 - r.x0 > 500 and min(fill) > 0.9:
                    self.bars.append(r)                   # full-width grey label bars
        self.rules.sort()

    def _segments(self):
        self.segs = []
        for ri, (_, cs) in enumerate(self.rows):
            cur = []
            for c in cs:
                if cur:
                    gap = c['bbox'][0] - cur[-1]['bbox'][2]
                    main = next((x['style'] for x in cur if x['c'] != ' '), cur[0]['style'])
                    same = c['style'] == main or (c['c'] == ' ' and main != 'glyph')
                    if gap > 6 or not same or c['style'] == 'glyph' or main == 'glyph':
                        self._emit(cur)
                        cur = []
                if c['c'] == ' ' and not cur:
                    continue
                cur.append(c)
            self._emit(cur)

    def _emit(self, cs):
        while cs and cs[-1]['c'] == ' ':
            cs = cs[:-1]
        if not cs:
            return
        styles = [c['style'] for c in cs if c['c'] != ' ']
        style = styles[0] if styles else cs[0]['style']
        s = Seg(cs, style)
        if style == 'id' and not re.fullmatch(r'A\d+(\.\d+)+', s.text.strip()):
            s.style = 'small'
        self.segs.append(s)

    def rule_between(self, ya, yb):
        return any(ya < r < yb for r in self.rules)

    def _phrases(self):
        self.phrases = []
        open_ = []
        for s in sorted(self.segs, key=lambda s: (s.oy, s.x0)):
            if s.style not in ('bold', 'reg'):
                continue
            joined = None
            if not re.match(r'\d+\.\s', s.text):
                for p in open_:
                    last = p.segs[-1]
                    if (p.style == s.style and abs(p.x0 - s.x0) < 1.5 and abs(last.size - s.size) < 0.1
                            and 0 < s.oy - last.oy < 12.8 and last.color == s.color
                            and not self.rule_between(last.oy, s.y0)):
                        joined = p
                        break
            if joined:
                joined.segs.append(s)
            else:
                p = Phrase(s)
                self.phrases.append(p)
                open_.append(p)
            open_ = [p for p in open_ if s.oy - p.segs[-1].oy < 13]

    def _underscores(self):
        """Write-in runs printed as underscores; `/` only between underscores."""
        self.runs = []
        for ri, (_, cs) in enumerate(self.rows):
            cur = []
            for c in cs + [None]:
                ok = c is not None and c['c'] in '_/' and (
                    not cur or c['bbox'][0] - cur[-1]['bbox'][2] < 1.5)
                if ok:
                    cur.append(c)
                    continue
                while cur and cur[-1]['c'] == '/':
                    cur.pop()
                if sum(1 for x in cur if x['c'] == '_') >= 3:
                    self.runs.append(cur)
                cur = [c] if c is not None and c['c'] == '_' else []

    # glyphs ------------------------------------------------------------------
    def glyphs(self):
        return [s for s in self.segs if s.style == 'glyph']

    def starts_cell(self, g):
        c = g.chars[0]
        before = [x for x in self.rows[c['ri']][1][:c['ci']] if x['c'] != ' ']
        return not before or before[-1]['bbox'][2] < g.x0 - 3.5

    def glyph_text(self, g):
        """The option label printed after a ☐, including wrapped lines."""
        c0 = g.chars[0]
        used = []

        # The cell ends where the next column of boxes starts.
        # Any box to the right in the same table row (no row rule between,
        # cells are vertically centred so rows of a cell need not line up).
        # Sub-boxes inside a cell (`starting: ☐ No`) follow their words closely
        # and do not start a column.
        cy = (g.y0 + g.y1) / 2
        right = min([o.x0 for o in self.glyphs() if o.x0 > g.x1 + 5 and self.starts_cell(o)
                     and abs((o.y0 + o.y1) / 2 - cy) < 30
                     and not self.rule_between(*sorted((cy, (o.y0 + o.y1) / 2)))] + [612]) - 0.5
        stopped = []

        def take(cs, start):
            out = []
            for c in cs[start:]:
                if c['c'] == BOX:
                    stopped.append(True)
                    break
                if c['bbox'][0] >= right or (out and c['bbox'][0] - out[-1]['bbox'][2] > 4):
                    break
                out.append(c)
            return out

        cs = self.rows[c0['ri']][1]
        first = take(cs, c0['ci'] + 1)
        used.extend(first)
        parts = [''.join(c['c'] for c in first)]
        last_oy = c0['origin'][1]
        # A cell holding more boxes after this one (`Co-test: ☐ Yes ☐ No`) wraps
        # those boxes' words, not this one's.
        for ri in ([] if stopped else range(c0['ri'] + 1, min(c0['ri'] + 8, len(self.rows)))):
            oy, cs = self.rows[ri]
            if oy - last_oy > 13.5:
                break
            if oy - last_oy < 6:
                continue
            start = [c for c in cs if g.x0 - 1.5 <= c['bbox'][0] <= g.x0 + 2.5]
            if not start:
                break
            c = start[0]
            prev = cs[c['ci'] - 1] if c['ci'] else None
            if (c['c'] == BOX or c['style'] == 'bold' or abs(c['size'] - c0['size']) > 0.6
                    or (prev and c['bbox'][0] - prev['bbox'][2] < 3)
                    or self.rule_between(last_oy, oy)):
                break
            more = take(cs, c['ci'])
            used.extend(more)
            parts.append(''.join(x['c'] for x in more))
            last_oy = oy
        return ' '.join(p.strip() for p in parts), used

    def ink_box(self, g):
        """The drawn square inside the ☐ glyph's font bbox."""
        r = pymupdf.Rect(g.x0, g.y0, g.x1, g.y1)
        zoom = 12
        pix = self.page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=r, colorspace=pymupdf.csGRAY)
        xs, ys = [], []
        for y in range(pix.height):
            for x in range(pix.width):
                if pix.pixel(x, y)[0] < 128:
                    xs.append(x)
                    ys.append(y)
        if not xs:
            return r
        # pixel (0,0) is the clip's top-left
        return pymupdf.Rect(r.x0 + min(xs) / zoom, r.y0 + min(ys) / zoom,
                            r.x0 + (max(xs) + 1) / zoom, r.y0 + (max(ys) + 1) / zoom)


# --- matching ----------------------------------------------------------------

def option_score(opt, text):
    a, b = norm(opt), norm(text)
    if not a or not b:
        return 0
    if a == b:
        return 3
    if b.startswith(a + ' ') and len(a) > 2:
        return 2         # the paper adds words after the option (rare)
    if a.startswith(b + ' ') and len(b) > 2:
        return 1         # the option carries inline sub-boxes the paper splits off
    return 0


def assign(options, cands):
    """options -> glyph, best score first; each glyph used once."""
    pairs = []
    for i, o in enumerate(options):
        for j, (g, text) in enumerate(cands):
            sc = option_score(o, text)
            if sc:
                pairs.append((-sc, i, j))
    pairs.sort()
    got, used = {}, set()
    for sc, i, j in pairs:
        if i in got or j in used:
            continue
        got[i] = j
        used.add(j)
    return got


class Form:
    def __init__(self, fid, doc_name, pdf):
        self.fid, self.doc_name, self.pdf = fid, doc_name, pdf
        self.doc = pymupdf.open(os.path.join(BUNDLE, pdf))
        self.pages = [Page(p, i + 1) for i, p in enumerate(self.doc)]
        self.sections = []   # (number, page index, y)
        for pi, pg in enumerate(self.pages):
            for s in pg.segs:
                m = re.match(r'(\d+)\.\s+[A-Z]', s.text)
                if m and s.style == 'bold' and s.color == 0xffffff:
                    self.sections.append((int(m.group(1)), pi, s.y0))
        self.fields, self.notes, self.used_glyphs = [], [], set()
        self.used_runs = set()

    def section_span(self, n):
        for i, (num, pi, y) in enumerate(self.sections):
            if num == n:
                end = self.sections[i + 1][1:] if i + 1 < len(self.sections) else (len(self.pages), 0)
                return (pi, y), end
        return None

    def in_section(self, n, pi, y):
        span = self.section_span(n)
        return span is not None and span[0] <= (pi, y) < span[1]

    def find_id(self, field, n):
        hits = [(pi, s) for pi, pg in enumerate(self.pages) for s in pg.segs
                if s.style == 'id' and s.text.strip() == field and self.in_section(n, pi, s.y0)]
        return hits

    def find_label(self, text, n, numbered=False):
        want = norm(text)
        hits = []
        for pi, pg in enumerate(self.pages):
            for p in pg.phrases:
                if not self.in_section(n, pi, p.y0):
                    continue
                t = p.text
                if numbered:
                    t = re.sub(r'^\d+\.\s*', '', t)
                h = norm(t)
                if h == want or (h.startswith(want + ' ') and not numbered):
                    hits.append((pi, p))
        return hits

    def label_for_id(self, pg, ids):
        """The bold label a printed id belongs to: on its last line, or just above."""
        best = None
        for p in pg.phrases:
            if p.style != 'bold' or p.x0 > ids.x0 + 1:
                continue
            if p.y1 <= ids.y1 + 1.5 and p.y1 >= ids.y0 - 9:
                if best is None or p.y1 > best.y1:
                    best = p
        return best

    def next_anchor_top(self, pg, pi, below, n):
        """Top of the next row that starts a new thing in the left column."""
        tops = [s.y0 for s in pg.segs if s.x0 < LEFT_COL and s.style != 'id' and s.y0 > below]
        tops += [r.y0 for r in pg.bars if r.y0 > below]
        span = self.section_span(n)
        if span and span[1][0] == pi:
            tops.append(span[1][1])
        return min(tops + [FOOTER_TOP])

    # -- emitters ---------------------------------------------------------------
    def add(self, q, pi, kind, rect, option=None, size=9):
        f = {'q': q, 'page': pi + 1, 'kind': kind}
        if option is not None:
            f['option'] = option
        f.update(left=round(rect[0], 2), top=round(rect[1], 2),
                 width=round(rect[2] - rect[0], 2), height=round(rect[3] - rect[1], 2), size=size)
        self.fields.append(f)

    def add_check(self, qid, pi, g, option):
        pg = self.pages[pi]
        r = pg.ink_box(g)
        self.used_glyphs.add((pi, id(g)))
        self.add(qid, pi, 'check', (r.x0, r.y0, r.x1, r.y1), option, size=round(0.8 * r.height / 0.716, 1))

    # -- per question type -------------------------------------------------------
    def place(self, q):
        row, dd, field = q['row'], q['dd'], q['field']
        qid, qtype, n = row['QuestionID'], row['QuestionType'], int(dd['Section #'])
        opts = [o for o in row['Options'].split('|')] if row['Options'] else []
        text = row['QuestionText']
        if 'signature' in text.lower():
            return None, 'signature: drawn by hand or e-signed, not typed'
        if qtype == 'scored':
            return self.place_scored(q, qid, n, text, opts)
        anchor = self.anchor(q, n, text)
        if anchor is None:
            return None, 'label not found on the page'
        pi, phrase, idseg, how = anchor
        if qtype in ('single_select', 'multi_select', 'radio_yes_no'):
            return self.place_checks(qid, pi, phrase, idseg, n, opts, how)
        return self.place_text(qid, pi, phrase, idseg, n, how, row)

    def anchor(self, q, n, text):
        hits = self.find_id(q['field'], n)
        if len(hits) > 1:
            self.notes.append('%s: printed id %s appears %d times; used the first' % (q['row']['QuestionID'], q['field'], len(hits)))
        if hits:
            pi, ids = hits[0]
            return pi, self.label_for_id(self.pages[pi], ids), ids, 'printed id %s' % q['field']
        lab = self.find_label(text, n)
        if len(lab) > 1:
            self.notes.append('%s: label "%s" matches %d places in section %d; used the first' % (
                q['row']['QuestionID'], text, len(lab), n))
        if lab:
            pi, p = lab[0]
            return pi, p, None, 'label text'
        return None

    def place_checks(self, qid, pi, phrase, idseg, n, opts, how):
        pg = self.pages[pi]
        top = min(x.y0 for x in (phrase, idseg) if x is not None)
        bottom_anchor = max(x.y1 for x in (phrase, idseg) if x is not None)
        bottom = self.next_anchor_top(pg, pi, bottom_anchor - 0.5, n)
        # Snap the band to the table's row rules: a row's boxes can sit higher
        # than its vertically centred label.
        top = max([r for r in pg.rules if r <= top + 0.5] or [top - 4])
        bottom = max([r for r in pg.rules if bottom_anchor < r <= bottom + 0.5] or [bottom])
        cands = []
        for g in pg.glyphs():
            cy = (g.y0 + g.y1) / 2
            if top <= cy < bottom and g.x0 > OPTION_COL and (pi, id(g)) not in self.used_glyphs:
                t, used = pg.glyph_text(g)
                cands.append((g, t, used))
        got = assign(opts, [(g, t) for g, t, _ in cands])
        missing = [o for i, o in enumerate(opts) if i not in got]
        for i, j in sorted(got.items()):
            g, t, used = cands[j]
            self.add_check(qid, pi, g, opts[i])
            for c in used:
                if c['c'] == '_':
                    self.used_runs.add((pi, c['ri'], c['ci']))
            if norm(t) != norm(opts[i]):
                self.notes.append('%s: option "%s" matched the box printed "%s" (prefix match)' % (qid, opts[i], t))
        leftover = [t for j, (g, t, _) in enumerate(cands) if j not in got.values()]
        return (len(got), len(opts), missing, leftover, how), None

    def place_scored(self, q, qid, n, text, opts):
        hits = self.find_label(text, n, numbered=True)
        if not hits:
            return None, 'instrument item label not found'
        pi, p = hits[0]
        pg = self.pages[pi]
        right = min([o.x0 for o in pg.phrases if o.x0 > p.x1 and re.match(r'\d+\.\s', o.text)
                     and o.y0 < p.y1 + 3 and o.y1 > p.y0 - 3] + [999])
        gl = sorted([g for g in pg.glyphs() if p.y0 - 3 <= (g.y0 + g.y1) / 2 <= p.y1 + 3
                     and p.x1 < g.x0 < right], key=lambda g: g.x0)
        raw = [x.strip() for x in str(q['dd']['Allowed values']).split('|')]
        if len(gl) != len(opts):
            return None, 'found %d boxes on the item row, expected %d' % (len(gl), len(opts))
        for g, o, r in zip(gl, opts, raw):
            t, _ = pg.glyph_text(g)
            if norm(t) != norm(r):
                return None, 'box printed "%s" where "%s" was expected' % (t, r)
            self.add_check(qid, pi, g, o)
        return (len(gl), len(opts), [], [], 'item text, boxes verified against %s' % '/'.join(raw)), None

    def place_text(self, qid, pi, phrase, idseg, n, how, row):
        pg = self.pages[pi]
        lab = phrase or idseg
        y0 = min(x.y0 for x in (phrase, idseg) if x is not None)
        y1 = max(x.y1 for x in (phrase, idseg) if x is not None)
        # The next label to the right on the same row bounds the blank.
        right = min([p.x0 for p in pg.phrases if p.style == 'bold' and p.x0 > lab.x1
                     and p.y0 < y1 and p.y1 > y0] + [612])
        cands = []
        for run in pg.runs:
            if any((pi, c['ri'], c['ci']) in self.used_runs for c in run):
                continue
            x0, x1 = run[0]['bbox'][0], run[-1]['bbox'][2]
            rule = run[0]['origin'][1] + 0.19 * run[0]['size']
            ty = min(c['bbox'][1] for c in run)
            by = max(c['bbox'][3] for c in run)
            if lab.x0 + 20 < x0 < right and y0 + 4 <= rule <= y1 + 9:
                cands.append((rule, x0, (x0, ty, x1, by), run))
        for x0, x1, y in pg.lines:
            if lab.x0 + 20 < x0 < right and y0 + 4 <= y <= y1 + 9:
                cands.append((y, x0, (x0 + 1, y - 10, x1 - 1, y), None))
        if cands:
            cands.sort(key=lambda c: (c[0], c[1]))
            rule, x0, rect, run = cands[0]
            same_row = [c for c in cands if abs(c[0] - rule) < 1 and c is not cands[0]]
            if same_row:
                self.notes.append('%s: blank is printed in %d parts with words between; field covers the first part only' % (
                    qid, len(same_row) + 1))
            if run:
                for c in run:
                    self.used_runs.add((pi, c['ri'], c['ci']))
            self.add(qid, pi, 'text', rect)
            return (1, 1, [], [], how), None
        # A full-width label bar with an empty band under it is a write-in area.
        for bar in pg.bars:
            if bar.y0 - 1 <= lab.y0 and lab.y1 <= bar.y1 + 1:
                below = [r for r in pg.rules if r > bar.y1 + 3]
                if below:
                    rect = (bar.x0 + 3, bar.y1 + 1.5, bar.x1 - 3, below[0] - 1.5)
                    self.add(qid, pi, 'area', rect)
                    return (1, 1, [], [], how), None
        return None, 'no printed blank next to the label'

    def unused_glyphs(self):
        out = []
        for pi, pg in enumerate(self.pages):
            for g in pg.glyphs():
                if (pi, id(g)) in self.used_glyphs or g.y0 < HEADER_BOTTOM:
                    continue
                t, _ = pg.glyph_text(g)
                out.append((pi + 1, round(g.y0), t))
        return out


# --- proof renders -------------------------------------------------------------

def proof(form, fields, outdir):
    os.makedirs(outdir, exist_ok=True)
    doc = pymupdf.open(os.path.join(BUNDLE, form.pdf))
    blue, red = (0.05, 0.25, 0.9), (0.85, 0.1, 0.1)
    for f in fields:
        page = doc[f['page'] - 1]
        x, y, w, h, size = f['left'], f['top'], f['width'], f['height'], f['size']
        if f['kind'] == 'check':
            tw = pymupdf.get_text_length('X', fontname='helv', fontsize=size)
            page.insert_text((x + (w - tw) / 2, y + (h + 0.716 * size) / 2), 'X',
                             fontname='helv', fontsize=size, color=blue)
        else:
            page.draw_rect(pymupdf.Rect(x, y, x + w, y + h), color=(1, 0.6, 0.6), width=0.3)
            base = y + h - 2.5 if f['kind'] == 'text' else y + size
            fs = size
            while fs > 4 and pymupdf.get_text_length(f['q'], fontname='helv', fontsize=fs) > w:
                fs -= 0.5
            page.insert_text((x, base), f['q'], fontname='helv', fontsize=fs, color=red)
    for i, page in enumerate(doc):
        page.get_pixmap(dpi=90).save(os.path.join(outdir, '%s_p%d.png' % (form.fid, i + 1)))


# --- main ------------------------------------------------------------------------

#: The running header every page prints: label -> pseudo-QuestionID. The
#: service fills these from the patient panel, not from a question - no
#: question asks for the patient's own name or date of birth, so without them
#: a printed page would not say whose it is. "ID" and New/Established are staff's.
HEADER_FIELDS = {'Name:': '@name', 'DOB:': '@dob', 'Visit date:': '@visit'}


def header_fields(doc):
    """The underscore run after each header label, on every page."""
    out = []
    for number, page in enumerate(doc, 1):
        words = [w for w in page.get_text('words') if w[1] < 90]
        for i, w in enumerate(words):
            for label, q in HEADER_FIELDS.items():
                parts = label.split()
                if [x[4] for x in words[i:i + len(parts)]] != parts:
                    continue
                run = []
                for x in words[i + len(parts):]:
                    if not re.fullmatch(r'[_/]+', x[4]):
                        break
                    run.append(x)
                if not run:
                    continue
                left, top = run[0][0], min(x[1] for x in run)
                right, bottom = run[-1][2], max(x[3] for x in run)
                out.append({'q': q, 'page': number, 'kind': 'text', 'left': round(left, 2),
                            'top': round(top, 2), 'width': round(right - left, 2),
                            'height': round(bottom - top, 2), 'size': 9})
    return out


def main():
    args = sys.argv[1:]
    proof_dir = args[args.index('--proof') + 1] if '--proof' in args else None
    questions = questions_for_forms()
    result, report = {}, []
    totals = []
    for fid, doc_name, pdf in FORMS:
        form = Form(fid, doc_name, pdf)
        placed, partial, unplaced = [], [], []
        for q in questions[fid]:
            qid = q['row']['QuestionID']
            if qid in OVERRIDES:
                for f in OVERRIDES[qid]:
                    form.fields.append(dict(f, q=qid))
                placed.append((q, 'override'))
                continue
            res, why = form.place(q)
            if res is None or res[0] == 0:
                unplaced.append((q, why or 'no option matched a printed box'))
                continue
            got, want, missing, leftover, how = res
            placed.append((q, how))
            if missing or leftover:
                partial.append((q, missing, leftover))
        # Stable order: page, then top, then left.
        fields = sorted(form.fields + header_fields(form.doc),
                        key=lambda f: (f['page'], round(f['top']), f['left']))
        result[fid] = {'source': pdf, 'pages': len(form.pages), 'fields': fields}
        if proof_dir:
            proof(form, fields, proof_dir)
        totals.append((fid, pdf, len(questions[fid]), len(placed), len(fields),
                       sum(1 for f in fields if f['kind'] == 'check'),
                       sum(1 for f in fields if f['kind'] == 'text'),
                       sum(1 for f in fields if f['kind'] == 'area')))
        report.append((form, questions[fid], placed, partial, unplaced))

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    write_report(totals, report)
    for t in totals:
        print('%-9s %3d questions, %3d placed (%5.1f%%), %4d fields' % (t[0], t[2], t[3], 100.0 * t[3] / t[2], t[4]))
    print('wrote', os.path.relpath(OUT_JSON, REPO), 'and', os.path.relpath(OUT_REPORT, REPO))


def write_report(totals, report):
    L = ['# School Health PDF field measurement', '',
         'Generated by `measure_pdfs.py` - do not edit by hand. Positions are in',
         '`backend/src/docs/shc/fields.json`; conventions are in the script\'s docstring.', '',
         '## Coverage', '',
         '| Form | PDF | Questions on the PDF | Placed | Coverage | Fields | check | text | area |',
         '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for fid, pdf, nq, npl, nf, nc, nt, na in totals:
        L.append('| %s | %s | %d | %d | %.1f%% | %d | %d | %d | %d |' % (fid, pdf, nq, npl, 100.0 * npl / nq, nf, nc, nt, na))
    L += ['', '"Questions on the PDF" is the form\'s own rows in `questions_out.json` plus the',
          '`shccore` rows `core_mapping.json` maps onto this form. `shccore-61` and `shccore-62`',
          '(follow-up contact preferences) come from the Consent for Services, not these PDFs,',
          'and the retired staff-only `shccore-48`/`shccore-49` are not in the data at all.', '',
          '## How rows were matched', '',
          '- **Printed field id first.** Every option row prints its Data Dictionary id in grey',
          '  (`A5.2`); the id is searched for within its own section (section header bars give',
          '  each section\'s page/y range), and the label it ends is the row\'s anchor.',
          '- **Label text otherwise.** Plain write-in rows (`Child\'s middle name:`) print no id;',
          '  their label is matched in full (normalised) within the section.',
          '- **Options by their printed words.** Within the row band (the anchor down to the next',
          '  thing in the left column), each ☐ is read together with the label printed after it',
          '  (wrapped lines included), and matched to the option string exactly; a prefix match is',
          '  used only where the option string itself contains sub-boxes, and each is listed below.',
          '- **Instrument grids** (lead risk, PSC-17, PHQ/GAD) are matched by item text, and each',
          '  row\'s boxes are taken left to right and verified against the printed column words',
          '  (`0/1/2`, `Yes/No/Don\'t know`, ...) before the option labels are assigned positionally.',
          '  No row was matched by order alone.', '',
          '## Not emitted on purpose', '',
          '- **Signatures.** `Signature and date:` (`shccore-47`) and the vaccine consent\'s',
          '  `Parent or guardian signature:` (`shcvax26-13`) are signed by hand or e-signed, not typed.',
          '- **Staff-only areas.** The phone-interview staff name and read-back initials (the retired',
          '  `shccore-48`/`shccore-49`) and the vaccine consent\'s "Staff use: consent taken by" line;',
          '  listed per form below.',
          '- **The page header strip** (`Name`, `DOB`, `Visit date`, `ID`, `New`/`Established`) repeats',
          '  on every page but is not a Form Questions row; it would be filled from the patient record.',
          '- **Options the generator drops.** `gen.py` strips `Other: ______` from option lists (shccore-56,',
          '  -57, -58), so those printed boxes have no option string to key on.',
          '- **Write-ins inside an option** (`Yes, when: ______`). The page renders the option as one',
          '  choice and collects no follow-up text, so only the box is placed; each is listed per form.', '']
    for form, qs, placed, partial, unplaced in report:
        L += ['## %s - %s' % (form.fid, form.pdf), '']
        if unplaced:
            L += ['### Not placed', '', '| QuestionID | Printed id | Label | Reason |', '| --- | --- | --- | --- |']
            for q, why in unplaced:
                L.append('| %s | %s | %s | %s |' % (q['row']['QuestionID'], q['field'], q['row']['QuestionText'], why))
            L.append('')
        if partial:
            L += ['### Placed with gaps', '']
            for q, missing, leftover in partial:
                bits = []
                if missing:
                    bits.append('no box for option(s) %s' % ', '.join('"%s"' % m for m in missing))
                if leftover:
                    bits.append('extra box(es) in the row with no option: %s' % ', '.join('"%s"' % t for t in leftover))
                L.append('- `%s` (%s) %s: %s' % (q['row']['QuestionID'], q['field'], q['row']['QuestionText'], '; '.join(bits)))
            L.append('')
        if form.notes:
            L += ['### Resolved matches worth knowing', '']
            L += ['- ' + n for n in form.notes]
            L.append('')
        inline = [(q, o) for q, _ in placed for o in (q['row']['Options'].split('|') if q['row']['Options'] else [])
                  if '__' in o and q['row']['QuestionType'] not in ('text', 'text_area')]
        if inline:
            L += ['### Write-in blanks inside options (no follow-up question to put there)', '']
            for q, o in inline:
                L.append('- `%s` "%s"' % (q['row']['QuestionID'], o))
            L.append('')
        staff = ['p%d "%s"' % (pi + 1, ph.text) for pi, pg in enumerate(form.pages) for ph in pg.phrases
                 if re.search(r'staff', ph.text, re.I) and len(ph.text) < 120]
        if staff:
            L += ['### Staff-only areas (out of scope, no fields emitted)', '']
            L += ['- ' + x for x in staff]
            L.append('')
        un = form.unused_glyphs()
        if un:
            L += ['### Printed boxes no question maps to', '',
                  'Checklists the Data Dictionary has no row for, sub-boxes inside an option, and staff-use boxes.', '']
            by = defaultdict(list)
            for p, y, t in un:
                by[p].append(t.strip() or '(blank)')
            for p in sorted(by):
                L.append('- p%d: %s' % (p, '; '.join(by[p])))
            L.append('')
    with open(OUT_REPORT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(L))


if __name__ == '__main__':
    main()
