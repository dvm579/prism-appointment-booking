// Builds a plausible answer for every question of the given forms from the
// published Form Questions CSV, so fillers can be exercised against the real
// question set rather than a hand-picked few. Network: reads the public CSV.

const QUESTIONS_CSV =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vSjsfBdiXj2A0M4v-cjYryFN9WwB_qMd4B5FVjxV2DsPWngRm8tz670W02S3uAfqqobEtAcMsjwGAsC/pub?gid=2021441540&single=true&output=csv';

function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
        else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const [head, ...body] = rows;
    return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export async function questionsFor(formIds) {
    const rows = parseCsv(await (await fetch(QUESTIONS_CSV)).text());
    return rows.filter(r => formIds.includes(r.FormID));
}

/** `pick(options, index)` decides which option a choice question gets. */
export async function answersFor(formIds, pick = (options, i) => options[i % options.length]) {
    const questions = await questionsFor(formIds);
    return questions.map((q, i) => {
        const options = q.Options ? q.Options.split(q.Options.includes('|') ? '|' : ',').map(s => s.trim()).filter(Boolean) : [];
        let answer;
        switch (q.QuestionType) {
            case 'radio_yes_no': case 'signature': answer = i % 2 ? 'No' : 'Yes'; break;
            case 'multi_select': answer = options.length ? [pick(options, i), pick(options, i + 1)].filter((v, j, a) => a.indexOf(v) === j).join(', ') : ''; break;
            case 'single_select': case 'radio_custom': case 'scored': answer = options.length ? pick(options, i) : ''; break;
            case 'date': answer = '2026-09-01'; break;
            case 'text_area': answer = `Answer to ${q.QuestionID}: a longer note that should wrap across the lines of its write-in area.`; break;
            default: answer = `Ans ${q.QuestionID}`;
        }
        return { questionId: q.QuestionID, answer, formId: q.FormID };
    });
}
