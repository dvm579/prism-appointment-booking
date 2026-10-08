// Mutable state shared between modules. Kept in a single object so that
// reassignment is visible everywhere (a plain exported `let` would not be).

export const state = {
    /** Event id from the URL, or the general-registration sentinel. */
    eventId: null,

    // Rows from the published sheets, keyed by what they describe.
    events: [],
    slots: [],
    /** Service Types: the source of truth for names, intake forms and consent. */
    serviceTypes: [],
    /** Forms: FormID -> Form Name, used to title each questionnaire. */
    forms: [],
    /** Form Questions. */
    questions: [],
    /** Consent Blocks: reusable consent HTML, referenced by Service Types. */
    consentBlocks: [],
    /** Consent Items: the declinable parts of each consent block. */
    consentItems: [],

    /** Normalised "HH:mm" start time of the slot currently held, if any. */
    heldSlotTime: null,
    /**
     * True when this event's intake forms are done on paper, so only the patient
     * panel, services and insurance are asked. Set per event by src/intake.js.
     */
    paperIntake: false,
    /** True when the submission should be recorded as a waitlist entry. */
    isWaitlist: false,
    /** Handle for the slot-hold countdown. */
    timerInterval: null,
    /** Consent-signature SignaturePad, created lazily with the form. */
    signaturePad: null
};

/** Looks up the event currently being registered for. */
export function currentEvent() {
    if (!state.eventId) return null;
    return state.events.find(event => String(event.EventID) === String(state.eventId)) || null;
}
