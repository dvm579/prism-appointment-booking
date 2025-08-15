// script.js

// --- CONFIGURATION ---
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwnvm7Q26ebVGOnC14BrFajyuh7RyeBijBQg6xSSfz0hA8ofj4HxT8P1EoqKkpg8lDU/exec";
const EVENTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSjsfBdiXj2A0M4v-cjYryFN9WwB_qMd4B5FVjxV2DsPWngRm8tz670W02S3uAfqqobEtAcMsjwGAsC/pub?gid=1643561266&single=true&output=csv";
const SLOTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSjsfBdiXj2A0M4v-cjYryFN9WwB_qMd4B5FVjxV2DsPWngRm8tz670W02S3uAfqqobEtAcMsjwGAsC/pub?gid=582524870&single=true&output=csv";
const TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

// --- GLOBAL STATE ---
let eventId;
let allEvents = [];
let allSlots = [];
let selectedSlotTime = null;
let timerInterval;
let signaturePad;
let isWaitlistSubmission = false; // Add this line

// --- DOM ELEMENTS ---
const DOMElements = {
    loadingOverlay: document.getElementById('loadingOverlay'),
    eventDetails: document.getElementById('eventDetails'),
    slotsGrid: document.getElementById('slotsGrid'),
    slotSection: document.getElementById('slotSection'),
    formSection: document.getElementById('formSection'),
    confirmationSection: document.getElementById('confirmationSection'),
    timer: document.getElementById('timer'),
    regForm: document.getElementById('regForm'),
    goBackButton: document.getElementById('goBackButton'),
    waitlistSection: document.getElementById('waitlistSection'), // Add this
    joinWaitlistBtn: document.getElementById('joinWaitlistBtn') // Add this
};

// --- CORE FUNCTIONS ---

/**
 * Main function to initialize the app
 */
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        eventId = urlParams.get('eventId');
        if (!eventId) {
            handleError("Event ID is missing from the URL.");
            return;
        }

        // Fetch both CSV files in parallel for speed
        [allEvents, allSlots] = await Promise.all([
            fetchCSV(EVENTS_CSV_URL),
            fetchCSV(SLOTS_CSV_URL)
        ]);
        
        console.log("First Event Row:", allEvents[0]);
        console.log("First Slot Row:", allSlots[0]);
        
        const currentEvent = allEvents.find(event => event.EventID === eventId);
        if (!currentEvent) {
            handleError("Event not found.");
            return;
        }

        displayEventDetails(currentEvent);
        renderSlots();
        setupEventListeners();
        hideLoading();

    } catch (error) {
        handleError("Failed to initialize the application.", error);
    }
});

/**
 * Fetches and parses CSV data from a URL using PapaParse
 * @param {string} url The URL of the CSV file
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of objects
 */
function fetchCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: (err) => reject(err)
        });
    });
}

/**
 * Calls the Google Apps Script backend API
 * @param {string} action The action to perform (e.g., 'bookSlot')
 * @param {Object} payload The data to send
 * @returns {Promise<Object>} The JSON response from the server
 */
async function callAPI(action, payload) {
    const response = await fetch(GAS_API_URL, {
        method: 'POST',
        mode: 'cors', // Important for cross-origin requests
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // GAS quirk
        body: JSON.stringify({ action, payload })
    });

    const result = await response.json();
    if (result.status === 'error') {
        throw new Error(result.message);
    }
    return result;
}

// --- UI AND EVENT HANDLING ---

function setupEventListeners() {
    DOMElements.regForm.addEventListener('submit', submitBooking);
    DOMElements.goBackButton.addEventListener('click', goBack);
    DOMElements.joinWaitlistBtn.addEventListener('click', joinWaitlist); // Add this
    document.getElementById('dob').addEventListener('change', checkAge);

    window.addEventListener('beforeunload', (e) => {
        if (selectedSlotTime) {
            const payload = { eventId, startTime: selectedSlotTime };
            const data = JSON.stringify({ action: 'releaseSlot', payload });
            navigator.sendBeacon(GAS_API_URL, data);
        }
    });
}

function displayEventDetails(event) {
    const eventDate = new Date(event.Date).toLocaleDateString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    DOMElements.eventDetails.textContent = `${event['Event Name']} - ${eventDate}`;
}

function renderSlots() {
    const container = DOMElements.slotsGrid;
    container.innerHTML = '';
    
    const eventSlots = allSlots.filter(slot => slot.EventID === eventId);
    const openSlots = eventSlots.filter(slot => slot.Status === 'Open');

    // If there are no open slots, show the waitlist option
    if (openSlots.length === 0) {
        DOMElements.slotsGrid.classList.add('d-none');
        DOMElements.waitlistSection.classList.remove('d-none');
        return;
    }

    // Otherwise, render the available slots
    DOMElements.slotsGrid.classList.remove('d-none');
    DOMElements.waitlistSection.classList.add('d-none');
    
    eventSlots.forEach(slot => {
        const pill = document.createElement('div');
        pill.classList.add('slot-item');
        pill.textContent = `${slot['Start Time']} – ${slot['End Time']}`;

        if (slot.Status === 'Open') {
            pill.classList.add('slot-open');
            pill.onclick = () => selectSlot(slot['Start Time'], pill);
        } else {
            pill.classList.add('slot-taken');
        }
        container.appendChild(pill);
    });
}

async function selectSlot(time) {
    if (selectedSlotTime) return; // Prevent double-clicking
    showLoading();

    try {
        await callAPI('bookSlot', { eventId, startTime: time });
        selectedSlotTime = time;

        // Update UI
        startTimer();
        DOMElements.slotSection.classList.add('d-none');
        DOMElements.formSection.classList.remove('d-none');
        const currentEvent = allEvents.find(e => e.EventID === eventId);
        displayEventDetails(currentEvent); // Refresh details to include time
        DOMElements.eventDetails.innerHTML += `<br> Selected Time Slot: ${time}`;
        
        // Initialize Signature Pad only when the form is visible
        if (!signaturePad) {
            const canvas = document.getElementById('sigPad');
            signaturePad = new SignaturePad(canvas);
        } else {
            signaturePad.clear();
        }

    } catch (error) {
        handleError("This slot was just taken. Please select another.", error);
        // Refresh slots in case the status changed
        const updatedSlots = await fetchCSV(SLOTS_CSV_URL);
        allSlots = updatedSlots;
        renderSlots();
    } finally {
        hideLoading();
    }
}

async function goBack() {
    clearInterval(timerInterval);
    showLoading();
    
    try {
        await callAPI('releaseSlot', { eventId, startTime: selectedSlotTime });
    } catch (error) {
        console.error("Failed to release slot, but proceeding with UI reset.", error);
    } finally {
        selectedSlotTime = null;
        DOMElements.formSection.classList.add('d-none');
        DOMElements.slotSection.classList.remove('d-none');
        const currentEvent = allEvents.find(e => e.EventID === eventId);
        displayEventDetails(currentEvent); // Reset details
        hideLoading();
    }
}

function joinWaitlist() {
    isWaitlistSubmission = true; // Set the flag
    selectedSlotTime = null; // No slot is selected

    DOMElements.slotSection.classList.add('d-none');
    DOMElements.formSection.classList.remove('d-none');
    DOMElements.timer.classList.add('d-none'); // Hide the timer for waitlist

    const currentEvent = allEvents.find(e => e.EventID === eventId);
    displayEventDetails(currentEvent);
    DOMElements.eventDetails.innerHTML += `<br> <b>Joining the Waitlist</b>`;

    if (!signaturePad) {
        const canvas = document.getElementById('sigPad');
        signaturePad = new SignaturePad(canvas);
    } else {
        signaturePad.clear();
    }
}

async function submitBooking(e) {
    e.preventDefault();
    if (signaturePad.isEmpty()) {
        alert("Please provide a signature.");
        return;
    }
    showLoading();
    clearInterval(timerInterval);

    const form = e.target;
    const data = {
      eventId,
      slotTime: selectedSlotTime,
      isWaitlist: isWaitlistSubmission, // Add this flag
      demographics: {},
      insurance: {},
      signature: signaturePad.toDataURL()
    };

    // Gather form data (same as before)
    ['firstName','middleName','lastName','dob','gender','race','ethnicity','fullAddress','street','city','state','zip','cell','home','email','ssn','parentName','parentRel','parentContact'].forEach(id => data.demographics[id] = form[id]?.value || '');
    ['primaryIns','primaryPayer','primaryPlan','primaryId','primaryGroup','primaryPayerId','secondaryIns','secondaryPlan','secondaryId','secondaryGroup','secondaryPayerId'].forEach(id => data.insurance[id] = form[id]?.value || '');
    
    try {
        const response = await callAPI('submitForm', data);
        displayConfirmation(response, form);
    } catch (error) {
        handleError("There was an error submitting your registration. Please try again.", error);
    } finally {
        hideLoading();
    }
}


function displayConfirmation(response, form) {
    const { appointmentID, qrBase64, isWaitlist } = response;
    
    DOMElements.slotSection.classList.add('d-none');
    DOMElements.formSection.classList.add('d-none');
    DOMElements.confirmationSection.classList.remove('d-none');

    const patientName = `${form.firstName.value} ${form.lastName.value}`;
    document.getElementById('confPatientName').textContent = patientName;
    document.getElementById('confPatientDob').textContent = form.dob.value;
    document.getElementById('confEventName').textContent = DOMElements.eventDetails.textContent.split('-')[0].trim();

    // Show different confirmation messages
    if (isWaitlist) {
        document.querySelector('#confirmationSection h2').textContent = "You've Been Added to the Waitlist";
        document.getElementById('confApptId').parentElement.innerHTML = "You will be notified by email if an appointment becomes available.";
        document.getElementById('confQrCode').style.display = 'none';
    } else {
        document.querySelector('#confirmationSection h2').textContent = "Registration Confirmed";
        document.getElementById('confApptId').textContent = appointmentID;
        document.getElementById('confQrCode').src = `data:image/png;base64,${qrBase64}`;
        document.getElementById('confQrCode').style.display = 'block';
    }
}


// --- UTILITY FUNCTIONS ---

function showLoading() { DOMElements.loadingOverlay.style.display = 'flex'; }
function hideLoading() { DOMElements.loadingOverlay.style.display = 'none'; }
function handleError(userMessage, error) {
    console.error(userMessage, error);
    alert(userMessage);
    hideLoading();
}
function checkAge() {
    // This function is unchanged from your original code.
}
