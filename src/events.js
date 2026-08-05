import { BASE_URL } from './config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { escapeHtml, parseSheetDate } from './utils.js';

/** Renders the event name and date above the slot picker / form. */
export function displayEventDetails(event, suffixHtml = '') {
    if (!event) {
        dom.eventDetails.textContent = '';
        return;
    }

    const date = parseSheetDate(event.Date);
    const formatted = date
        ? date.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
        : '';

    const heading = [event['Event Name'], formatted].filter(Boolean).join(' - ');
    dom.eventDetails.innerHTML = escapeHtml(heading) + suffixHtml;
}

/**
 * Renders the event chooser used when the page is opened with a campaignId or
 * facilityId instead of a single eventId.
 *
 * @param {{campaignId?: string, facilityId?: string}} filter
 */
export function renderEventCards({ campaignId, facilityId }) {
    const matches = state.events.filter(event =>
        campaignId
            ? String(event.CampaignID) === String(campaignId)
            : String(event.FacilityID) === String(facilityId)
    );

    if (matches.length === 0) {
        dom.eventCardsGrid.innerHTML =
            '<div class="col-12"><p class="text-center">No upcoming events found for this selection.</p></div>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cards = matches
        .map(event => ({ event, date: parseSheetDate(event.Date) }))
        .sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity))
        .map(({ event, date }) => {
            const isPast = date !== null && date < today;
            const formatted = date
                ? date.toLocaleDateString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                  })
                : 'Date to be announced';

            const body = `
                <div class="card-body">
                    <h5 class="card-title">${escapeHtml(event['Event Name'])}</h5>
                    <p class="card-text mb-1"><strong>Date:</strong> ${escapeHtml(formatted)}</p>
                    <p class="card-text"><strong>Time:</strong> ${escapeHtml(event['Start Time'])} - ${escapeHtml(event['End Time'])}</p>
                </div>`;

            if (isPast) {
                return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card event-card event-card-past h-100" aria-disabled="true">${body}</div>
                </div>`;
            }

            const href = `${BASE_URL}?eventId=${encodeURIComponent(event.EventID)}`;
            return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <a href="${escapeHtml(href)}" class="event-card-link">
                        <div class="card event-card text-white h-100">${body}</div>
                    </a>
                </div>`;
        })
        .join('');

    dom.eventCardsGrid.innerHTML = cards;
}
