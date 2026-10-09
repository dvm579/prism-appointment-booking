import { BASE_URL } from './config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { escapeHtml, formatTimeRange, parseSheetDate, slotDateTime } from './utils.js';

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
 * True once an event is over: its end time has passed, or, with no readable end
 * time, its day has. An event later today is still upcoming. One with no date
 * at all is kept, shown as "Date to be announced".
 */
function hasEnded(event, date, now) {
    if (!date) return false;
    const end = slotDateTime(date, event['End Time']);
    if (end) return end <= now;
    const nextDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    return nextDay <= now;
}

/**
 * Renders the event chooser used when the page is opened with a campaignId or
 * facilityId instead of a single eventId.
 *
 * Only upcoming events are listed, soonest first. A campaign or facility keeps
 * every event it has ever run, and listing those too buried the bookable ones
 * at the bottom of a long page.
 *
 * @param {{campaignId?: string, facilityId?: string}} filter
 */
export function renderEventCards({ campaignId, facilityId }) {
    const now = new Date();
    const matches = state.events
        .filter(event =>
            campaignId
                ? String(event.CampaignID) === String(campaignId)
                : String(event.FacilityID) === String(facilityId)
        )
        .map(event => ({ event, date: parseSheetDate(event.Date) }))
        .filter(({ event, date }) => !hasEnded(event, date, now));

    if (matches.length === 0) {
        dom.eventCardsGrid.innerHTML =
            '<div class="col-12"><p class="text-center">No upcoming events found for this selection.</p></div>';
        return;
    }

    const cards = matches
        .sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity))
        .map(({ event, date }) => {
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
                    <p class="card-text"><strong>Time:</strong> ${escapeHtml(formatTimeRange(event['Start Time'], event['End Time']))}</p>
                </div>`;

            const href = `${BASE_URL}?eventId=${encodeURIComponent(event.EventID)}`;
            return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <a href="${escapeHtml(href)}" class="event-card-link">
                        <div class="card event-card h-100">${body}</div>
                    </a>
                </div>`;
        })
        .join('');

    dom.eventCardsGrid.innerHTML = cards;
}
