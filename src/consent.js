// Opt-out consent.
//
// The Consent for Services v2026.7 inverted the model: one signature consents
// to every section the signer did not decline. `Consent Blocks` still holds the
// prose; `Consent Items` lists the things a patient can opt out of, and this
// renders those as a panel of declines and reads them back at submission.
//
// The panel sits outside the accordion on purpose. The prose is there to be
// read; a decline is an action, and an action hidden behind a collapsed
// accordion is one nobody takes.

import { state } from './state.js';
import { dom } from './dom.js';
import { escapeHtml } from './utils.js';

/**
 * The declinable items belonging to a set of consent blocks, grouped by section
 * and in sheet order.
 *
 * @param {string[]} consentIds
 * @returns {Array<{section: string, title: string, items: Object[]}>}
 */
export function consentItemsFor(consentIds) {
    const wanted = new Set(consentIds.map(id => String(id).trim()));
    const rows = state.consentItems
        .filter(row => wanted.has(String(row.ConsentID ?? '').trim()))
        .sort((a, b) => Number(a.DisplayOrder ?? 0) - Number(b.DisplayOrder ?? 0));

    const sections = [];
    const bySection = new Map();

    rows.forEach(row => {
        const section = String(row.Section ?? '').trim();
        if (!bySection.has(section)) {
            const group = {
                section,
                title: String(row['Section Title'] ?? '').trim(),
                items: []
            };
            bySection.set(section, group);
            sections.push(group);
        }
        bySection.get(section).items.push(row);
    });

    return sections;
}

function itemKey(row) {
    return `${String(row.ConsentID ?? '').trim()}.${String(row.ItemID ?? '').trim()}`;
}

/**
 * Draws the decline panel for the consent blocks currently in force.
 *
 * Declines already ticked are preserved across a re-render, because changing an
 * unrelated service should not quietly re-consent to something the patient
 * turned off.
 */
export function renderConsentDeclines(consentIds) {
    const mount = dom.consentDeclines;
    if (!mount) return;

    const previous = collectDeclines().reduce((acc, decline) => {
        acc[`${decline.consentId}.${decline.itemId}`] = decline.note;
        return acc;
    }, {});

    const sections = consentItemsFor(consentIds);
    if (sections.length === 0) {
        mount.innerHTML = '';
        mount.classList.add('d-none');
        return;
    }

    const groups = sections
        .map(group => {
            const items = group.items
                .map(row => {
                    const key = itemKey(row);
                    const id = `decline_${key.replace(/\W+/g, '_')}`;
                    const note = String(row['Note Label'] ?? '').trim();
                    const was = previous[key];
                    const checked = was !== undefined ? ' checked' : '';
                    const noteHtml = note
                        ? `<input type="text" class="form-control form-control-sm mt-1 ${
                              was ? '' : 'd-none'
                          }" data-decline-note="${escapeHtml(key)}"
                               placeholder="${escapeHtml(note)}" aria-label="${escapeHtml(note)}"
                               value="${escapeHtml(was ?? '')}">`
                        : '';
                    return `
                <div class="form-check consent-decline">
                    <input class="form-check-input" type="checkbox" id="${id}"
                           data-decline-item="${escapeHtml(key)}"${checked}>
                    <label class="form-check-label" for="${id}">${escapeHtml(
                        String(row['Item Label'] ?? '').trim()
                    )}</label>
                    ${noteHtml}
                </div>`;
                })
                .join('');

            return `
        <div class="col-12 col-md-6 mb-3">
            <p class="fw-semibold small mb-2">${escapeHtml(group.section)}. ${escapeHtml(
                group.title
            )}</p>
            ${items}
        </div>`;
        })
        .join('');

    mount.innerHTML = `
        <div class="border rounded p-3 mb-3 bg-body-tertiary">
            <p class="fw-semibold mb-1">Is there anything you do not want today?</p>
            <p class="small text-muted mb-3">
                Leave these blank to accept everything. Ticking one declines only that item —
                it does not affect any other care you receive.
            </p>
            <div class="row">${groups}</div>
        </div>`;
    mount.classList.remove('d-none');
}

/**
 * Reveals or clears an item's note field as its decline is ticked.
 *
 * Attached once to the mount rather than per checkbox, so a re-render does not
 * leave listeners behind on detached nodes.
 */
export function attachConsentDeclineListeners() {
    const mount = dom.consentDeclines;
    if (!mount || mount.dataset.listening === 'true') return;
    mount.dataset.listening = 'true';

    mount.addEventListener('change', event => {
        const box = event.target.closest('[data-decline-item]');
        if (!box) return;
        const note = mount.querySelector(
            `[data-decline-note="${CSS.escape(box.dataset.declineItem)}"]`
        );
        if (!note) return;
        note.classList.toggle('d-none', !box.checked);
        if (!box.checked) note.value = '';
    });
}

/**
 * Everything the patient has declined.
 *
 * @returns {Array<{consentId: string, itemId: string, label: string, note: string}>}
 */
export function collectDeclines() {
    const mount = dom.consentDeclines;
    if (!mount) return [];

    return Array.from(mount.querySelectorAll('[data-decline-item]:checked')).map(box => {
        const key = box.dataset.declineItem;
        const dot = key.indexOf('.');
        const note = mount.querySelector(`[data-decline-note="${CSS.escape(key)}"]`);
        return {
            consentId: key.slice(0, dot),
            itemId: key.slice(dot + 1),
            label: (box.parentElement.querySelector('label')?.textContent ?? '').trim(),
            note: note ? note.value.trim() : ''
        };
    });
}
