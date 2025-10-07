// script.js

// --- CONFIGURATION ---
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwnvm7Q26ebVGOnC14BrFajyuh7RyeBijBQg6xSSfz0hA8ofj4HxT8P1EoqKkpg8lDU/exec";
const EVENTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSjsfBdiXj2A0M4v-cjYryFN9WwB_qMd4B5FVjxV2DsPWngRm8tz670W02S3uAfqqobEtAcMsjwGAsC/pub?gid=1643561266&single=true&output=csv";
const SLOTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSjsfBdiXj2A0M4v-cjYryFN9WwB_qMd4B5FVjxV2DsPWngRm8tz670W02S3uAfqqobEtAcMsjwGAsC/pub?gid=582524870&single=true&output=csv";
const TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
const BASE_URL = "https://register.prism.org/"; // Base URL for event links

// --- GLOBAL STATE ---
let eventId;
let allEvents = [];
let allSlots = [];
let selectedSlotTime = null;
let timerInterval;
let signaturePad;
let isWaitlistSubmission = false;

// --- DOM ELEMENTS ---
const DOMElements = {
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingMessage: document.getElementById('loadingMessage'),
    eventDetails: document.getElementById('eventDetails'),
    slotsGrid: document.getElementById('slotsGrid'),
    slotSection: document.getElementById('slotSection'),
    eventSelectionSection: document.getElementById('eventSelectionSection'), // New
    eventCardsGrid: document.getElementById('eventCardsGrid'), // New
    formSection: document.getElementById('formSection'),
    confirmationSection: document.getElementById('confirmationSection'),
    timer: document.getElementById('timer'),
    regForm: document.getElementById('regForm'),
    goBackButton: document.getElementById('goBackButton'),
    waitlistSection: document.getElementById('waitlistSection'),
    joinWaitlistBtn: document.getElementById('joinWaitlistBtn'),
    hasInsuranceCheck: document.getElementById('hasInsuranceCheck'),
    insuranceSection: document.getElementById('insuranceSection'),
    sigClear: document.getElementById('clearSignatureBtn'),
    hasRecordsCheck: document.getElementById('hasRecordsCheck'),
    recordsSection: document.getElementById('recordsSection'),
    medicalRecordsUpload: document.getElementById('medicalRecordsUpload'),
    fileList: document.getElementById('fileList')
};

// --- CORE FUNCTIONS ---

/**
 * Main function to initialize the app
 */
window.addEventListener('DOMContentLoaded', async () => {
    try {
        setupEventListeners();
        const urlParams = new URLSearchParams(window.location.search);
        eventId = urlParams.get('eventId');
        const campaignId = urlParams.get('campaignId');
        const facilityId = urlParams.get('facilityId');

        // Fetch event data needed for all modes
        [allEvents, allSlots] = await Promise.all([
            fetchCSV(EVENTS_CSV_URL),
            fetchCSV(SLOTS_CSV_URL)
        ]);

        if (eventId) {
            // --- STANDARD EVENT MODE ---
            const currentEvent = allEvents.find(event => event.EventID === eventId);
            if (!currentEvent) {
                handleError("Event not found.");
                return;
            }
            displayEventDetails(currentEvent);
            renderSlots();
        } else if (campaignId || facilityId) {
            // --- NEW: EVENT SELECTION MODE ---
            DOMElements.slotSection.classList.add('d-none'); // Hide slot view
            DOMElements.formSection.classList.add('d-none'); // Hide form view
            DOMElements.eventSelectionSection.classList.remove('d-none'); // Show event card view
            renderEventCards(campaignId, facilityId);
        } else {
            // --- WAITLIST MODE (No params) ---
            eventId = 'WAITLIST';
            isWaitlistSubmission = true;
            DOMElements.slotSection.classList.add('d-none');
            DOMElements.formSection.classList.remove('d-none');
            DOMElements.timer.classList.add('d-none');
            DOMElements.eventDetails.innerHTML = '<b>General Registration</b>';
            if (!signaturePad) {
                const canvas = document.getElementById('sigPad');
                signaturePad = new SignaturePad(canvas);
            }
        }
    } catch (error) {
        handleError("Failed to initialize the application.", error);
    } finally {
        hideLoading();
    }
});


/**
 * NEW: Filters, sorts, and displays events as cards based on campaign or facility ID.
 * @param {string|null} campaignId The ID of the campaign to filter by.
 * @param {string|null} facilityId The ID of the facility to filter by.
 */
function renderEventCards(campaignId, facilityId) {
    let filteredEvents = [];

    if (campaignId) {
        filteredEvents = allEvents.filter(event => event.CampaignID === campaignId);
    } else if (facilityId) {
        filteredEvents = allEvents.filter(event => event.FacilityID === facilityId);
    }

    if (filteredEvents.length === 0) {
        DOMElements.eventCardsGrid.innerHTML = `<div class="col-12"><p class="text-center">No upcoming events found for this selection.</p></div>`;
        return;
    }

    // Sort events by date, from soonest to latest
    filteredEvents.sort((a, b) => new Date(a.Date) - new Date(b.Date));

    // Get today's date at midnight for an accurate comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    DOMElements.eventCardsGrid.innerHTML = filteredEvents.map(event => {
        const eventDateObj = new Date(event.Date);
        const isPastEvent = eventDateObj < today;
        const eventDate = eventDateObj.toLocaleDateString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const eventLink = `${BASE_URL}?eventId=${event.EventID}`;

        // Define the inner content of the card
        const cardInnerHtml = `
            <div class="card-body">
                <h5 class="card-title">${event['Event Name']}</h5>
                <p class="card-text mb-1"><strong>Date:</strong> ${eventDate}</p>
                <p class="card-text"><strong>Time:</strong> ${event['Start Time']} - ${event['End Time']}</p>
            </div>
        `;

        // If the event is in the past, render a styled div. Otherwise, render a link.
        if (isPastEvent) {
            return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card event-card text-muted h-100 slot-taken">
                        ${cardInnerHtml}
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <a href="${eventLink}" class="event-card-link">
                        <div class="card event-card text-white h-100">
                            ${cardInnerHtml}
                        </div>
                    </a>
                </div>
            `;
        }
    }).join('');
}

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
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
  });

  // Check if the response is JSON before trying to parse it
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.indexOf("application/json") !== -1) {
      const result = await response.json();
      if (result.status === 'error') {
          throw new Error(result.message);
      }
      return result;
  } else {
      // If we get HTML or something else, log it for debugging
      const textResponse = await response.text();
      console.error("Received a non-JSON response from the server:", textResponse);
      throw new Error("An unexpected error occurred. The server sent an invalid response.");
  }
}

// --- UI AND EVENT HANDLING ---

function setupEventListeners() {
    DOMElements.regForm.addEventListener('submit', submitBooking);
    DOMElements.goBackButton.addEventListener('click', goBack);
    DOMElements.joinWaitlistBtn.addEventListener('click', joinWaitlist); // Add this
    document.getElementById('dob').addEventListener('change', checkAge);
    DOMElements.hasInsuranceCheck.addEventListener('change', toggleInsuranceSection); 
    DOMElements.sigClear.addEventListener('click', (e) => {
        signaturePad.clear();
    });
    DOMElements.hasRecordsCheck.addEventListener('change', toggleRecordsSection);
    DOMElements.medicalRecordsUpload.addEventListener('change', handleFileSelection);

    window.addEventListener('beforeunload', (e) => {
        if (selectedSlotTime) {
            const payload = { eventId, startTime: selectedSlotTime };
            const data = JSON.stringify({ action: 'releaseSlot', payload });
            navigator.sendBeacon(GAS_API_URL, data);
        }
    });

    const typedNameInput = document.getElementById('typedName');
    const typeCanvas = document.getElementById('typeCanvas');
    const typeTabButton = document.getElementById('type-tab');
    
    // This is our new, reliable function for drawing text to the canvas
    const renderTypedSignature = async () => {
        // Wait for any custom fonts on the page to finish loading
        await document.fonts.ready;
    
        const ctx = typeCanvas.getContext('2d');
        const text = typedNameInput.value;
    
        // Set canvas dimensions
        typeCanvas.width = 600;
        typeCanvas.height = 150;
    
        // Clear previous drawing
        ctx.clearRect(0, 0, typeCanvas.width, typeCanvas.height);
    
        // Set font style and draw the text
        ctx.font = "60px 'Caveat', cursive";
        ctx.fillStyle = "#000";
        ctx.textBaseline = "middle"; // Vertically center the text
        ctx.fillText(text, 20, typeCanvas.height / 2);
    };
    
    // Call the render function whenever the user types
    typedNameInput.addEventListener('input', renderTypedSignature);
    
    // Also, re-render the signature when the user clicks the "Type Signature" tab.
    // This ensures it's drawn correctly if they switch back and forth.
    typeTabButton.addEventListener('shown.bs.tab', renderTypedSignature);
}

function displayEventDetails(event) {
    if (event) {
        const eventDate = new Date(event.Date).toLocaleDateString(undefined, {
          year: 'numeric', month: '2-digit', day: '2-digit'
        });
        DOMElements.eventDetails.textContent = `${event['Event Name']} - ${eventDate}`;
    } else {
        DOMElements.eventDetails.textContent = "";
    }
}

function renderSlots() {
    const container = DOMElements.slotsGrid;
    container.innerHTML = '';
    
    const eventSlots = allSlots.filter(slot => slot.EventID === eventId);
    
    // Find the current event to get its date
    const currentEvent = allEvents.find(e => e.EventID === eventId);
    if (!currentEvent) {
        handleError("Event details could not be found to render slots.");
        return;
    }

    const now = new Date();
    const dateParts = currentEvent.Date.split('/');
    const eventDate = new Date(dateParts[2], dateParts[0] - 1, dateParts[1]);

    // THE FIX: First, determine which slots are actually available right now.
    const trulyAvailableSlots = eventSlots.filter(slot => {
        const timeParts = slot['Start Time'].split(':');
        const slotDateTime = new Date(
            eventDate.getFullYear(), 
            eventDate.getMonth(), 
            eventDate.getDate(), 
            timeParts[0], // hour
            timeParts[1]  // minute
        );
        const isPastSlot = slotDateTime < now;
        
        // A slot is only truly available if it's Open AND not in the past.
        return slot.Status === 'Open' && !isPastSlot;
    });

    // THE FIX: Now, base the decision on the truly available slots.
    if (trulyAvailableSlots.length === 0) {
        // If no slots are available (all are booked or expired), show waitlist.
        DOMElements.slotsGrid.classList.add('d-none');
        DOMElements.waitlistSection.classList.remove('d-none');
        return; // Exit the function
    }

    // If we get here, it means there are available slots, so render the full grid.
    DOMElements.slotsGrid.classList.remove('d-none');
    DOMElements.waitlistSection.classList.add('d-none');
    
    eventSlots.forEach(slot => {
        const pill = document.createElement('div');
        pill.classList.add('slot-item');
        pill.textContent = `${slot['Start Time']} – ${slot['End Time']}`;

        const timeParts = slot['Start Time'].split(':');
        const slotDateTime = new Date(
            eventDate.getFullYear(), 
            eventDate.getMonth(), 
            eventDate.getDate(), 
            timeParts[0],
            timeParts[1]
        );
        
        const isPastSlot = slotDateTime < now;

        if (slot.Status === 'Open' && !isPastSlot) {
            pill.classList.add('slot-open');
            pill.onclick = () => selectSlot(slot['Start Time'], pill);
        } else {
            pill.classList.add('slot-taken');
        }
        container.appendChild(pill);
    });
}

function startTimer() {
    const endTime = Date.now() + TIMEOUT_MS;

    // Make sure the timer element is visible
    DOMElements.timer.classList.remove('d-none');

    timerInterval = setInterval(() => {
        const msRemaining = endTime - Date.now();

        if (msRemaining <= 0) {
            clearInterval(timerInterval);
            // The goBack() function will handle resetting the UI
            goBack();
            alert('Your session has expired. The slot has been released.');
            return;
        }

        const minutes = Math.floor(msRemaining / 60000);
        const seconds = Math.floor((msRemaining % 60000) / 1000);
        
        // Update the timer element on the page
        DOMElements.timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

async function selectSlot(time) {
    if (selectedSlotTime) return; // Prevent double-clicking
    showLoading("Checking Availability...");

    try {
        await callAPI('bookSlot', { eventId, startTime: time });
        selectedSlotTime = time;
        updateLoadingMessage("Slot Selected!")

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
    showLoading("Releasing Time Slot...");

    try {
        // Only release a slot if one was actually selected
        if (selectedSlotTime) {
            await callAPI('releaseSlot', { eventId, startTime: selectedSlotTime });
        }
    } catch (error) {
        console.error("Failed to release slot, but proceeding with UI reset.", error);
    } finally {
        selectedSlotTime = null;
        isWaitlistSubmission = false; // Reset waitlist flag
        DOMElements.formSection.classList.add('d-none');
        DOMElements.slotSection.classList.remove('d-none');
        DOMElements.timer.classList.add('d-none'); // Hide the timer

        const currentEvent = allEvents.find(e => String(e.EventID) === String(eventId));
        displayEventDetails(currentEvent); // Reset event details text
        renderSlots(); // Re-render slots to ensure they are clickable again
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
    if (currentEvent) {
        DOMElements.eventDetails.innerHTML += `<br> <b>Joining the Waitlist</b>`;
    }

    if (!signaturePad) {
        const canvas = document.getElementById('sigPad');
        signaturePad = new SignaturePad(canvas);
    } else {
        signaturePad.clear();
    }
}

async function submitBooking(e) {
    e.preventDefault();
    const form = e.target;

    // --- VALIDATION FOR NEW CHECKBOXES ---
    if (!form.consentCalls.checked && !form.consentTexts.checked && !form.consentEmails.checked) {
        alert("Please consent to at least one method of contact to continue.");
        return; // Stop the submission
    }

    // --- NEW SIGNATURE LOGIC ---
    let signatureDataUrl = '';
    const isDrawTabActive = document.getElementById('draw-tab').classList.contains('active');

    if (isDrawTabActive) {
        if (signaturePad.isEmpty()) {
            alert("Please provide a signature by drawing it.");
            return;
        }
        signatureDataUrl = signaturePad.toDataURL();
    } else { // Type tab is active
        const typedName = document.getElementById('typedName').value;
        if (!typedName.trim()) {
            alert("Please provide a signature by typing your name.");
            return;
        }
        signatureDataUrl = document.getElementById('typeCanvas').toDataURL();
    }
    // --- END NEW SIGNATURE LOGIC ---

    showLoading("Preparing your files...");
    clearInterval(timerInterval);

    // --- ADD THIS BLOCK TO READ FILES ---
    const medicalRecords = DOMElements.hasRecordsCheck.checked 
        ? await readFilesAsBase64(DOMElements.medicalRecordsUpload) 
        : [];
    // --- END BLOCK ---

    const data = {
      eventId,
      slotTime: selectedSlotTime,
      isWaitlist: isWaitlistSubmission,
      demographics: {},
      insurance: {},
      medicalRecords: medicalRecords,
      screening: {}, // Object to hold screening answers
      signature: signatureDataUrl,
      // --- DATA COLLECTION FOR NEW CHECKBOXES ---
      consentCalls: form.consentCalls.checked, // Will be true or false
      consentTexts: form.consentTexts.checked, // Will be true or false
      consentEmails: form.consentEmails.checked,  // Will be true or false
      electronicConsent: form.electronicConsent.checked,
      vaxConsent: form.certifyConsent.checked
    };

    // Gather form data (same as before)
    ['firstName','middleName','lastName','dob','gender','race','ethnicity','fullAddress','street','city','state','zip','cell','home','email','ssn','parentName','parentRel','parentContact', 'school', 'grade'].forEach(id => data.demographics[id] = form[id]?.value || '');
    ['primaryIns','primaryPayer','primaryPlan','primaryId','primaryGroup','primaryPayerId','secondaryIns','secondaryPlan','secondaryId','secondaryGroup','secondaryPayerId'].forEach(id => data.insurance[id] = form[id]?.value || '');

    // --- NEW: GATHER SCREENING DATA ---
    for (let i = 1; i <= 14; i++) {
        const radioName = `screening${i}`;
        const selectedRadio = form.querySelector(`input[name="${radioName}"]:checked`);
        data.screening[radioName] = selectedRadio ? selectedRadio.value : '';
    }
    data.screening.screening9_explain = form.screening9_explain.value || '';
    // --- END NEW SECTION ---
    
    updateLoadingMessage("Submitting registration...");
    
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
    let eventName = '';
    let eventDate = '';

    // Handle display based on whether it's a general waitlist or a specific event
    if (eventId === 'WAITLIST') {
        eventName = 'General Registration / School Records Check';
        // Hide the date field since it's not applicable
        document.getElementById('confEventDate').parentElement.classList.add('d-none');
    } else {
        const currentEvent = allEvents.find(event => String(event.EventID) === String(eventId));
        eventName = currentEvent ? currentEvent['Event Name'] : 'Your Event';
        eventDate = currentEvent ? new Date(currentEvent['Date']).toLocaleDateString() : '';
        document.getElementById('confEventDate').textContent = eventDate;
    }
    
    document.getElementById('confPatientName').textContent = patientName;
    document.getElementById('confPatientDob').textContent = form.dob.value;
    document.getElementById('confEventName').textContent = eventName;
    document.querySelector('#confirmationSection h2').textContent = "Registration Confirmed";
    
    // This existing logic correctly handles the waitlist confirmation message
    if (isWaitlist) {
        document.getElementById('confApptId').parentElement.innerHTML = "Thanks for your registration! We'll update your chart in the background and reach out soon with next steps.";
        document.getElementById('confQrCode').style.display = 'none';
    } else {
        document.getElementById('confApptId').textContent = appointmentID;
        document.getElementById('confQrCode').src = `data:image/png;base64,${qrBase64}`;
        document.getElementById('confQrCode').style.display = 'block';
    }
}

// ... (keep the rest of your script.js file) ...


// --- UTILITY FUNCTIONS ---

function showLoading(message = "Please wait…") {
    DOMElements.loadingMessage.textContent = message;
    DOMElements.loadingOverlay.style.display = 'flex';
}

function hideLoading() { DOMElements.loadingOverlay.style.display = 'none'; }

function handleError(userMessage, error) {
    console.error(userMessage, error);
    alert(userMessage);
    hideLoading();
}

/**
 * Changes the Google Translate language by directly interacting with the widget.
 * This method is more reliable and avoids a page reload.
 * @param {string} lang The two-letter language code (e.g., 'es' for Spanish).
 */
function changeLanguage(lang) {
  // Find the <select> element that the Google Translate widget creates.
  const translateSelect = document.querySelector('#google_translate_element select');

  if (translateSelect) {
    // Set the value of the dropdown to the desired language.
    translateSelect.value = lang;
    
    // Dispatch a "change" event on the dropdown to trigger the translation.
    translateSelect.dispatchEvent(new Event('change'));
  } else {
    // This can happen if the widget hasn't finished loading yet.
    console.error("Google Translate dropdown not found. It may not have loaded yet.");
  }
}

function checkAge() {
    const dobVal = document.getElementById('dob').value;
    const parentDiv = document.getElementById('parentFields');
    const p1 = document.getElementById('parentName');
    const p2 = document.getElementById('parentRel');
    if (!dobVal) {
      parentDiv.classList.add('d-none');
      return;
    }
    const dob = new Date(dobVal);
    const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 18) {
      parentDiv.classList.remove('d-none');
      p1.required = true;
      p2.required = true;
    } else {
      parentDiv.classList.add('d-none');
      p1.required = false;
      p2.required = false;
    }
}

function toggleInsuranceSection() {
    if (DOMElements.hasInsuranceCheck.checked) {
        // If checked, show the insurance section
        DOMElements.insuranceSection.classList.remove('d-none');
    } else {
        // If unchecked, hide it
        DOMElements.insuranceSection.classList.add('d-none');
    }
}

function toggleRecordsSection() {
    DOMElements.recordsSection.classList.toggle('d-none', !DOMElements.hasRecordsCheck.checked);
}

function handleFileSelection(event) {
    const files = event.target.files;
    DOMElements.fileList.innerHTML = ''; // Clear previous list

    // --- NEW LOGIC TO CHECK TOTAL FILE SIZE ---
    const MAX_TOTAL_SIZE_MB = 25;
    const MAX_TOTAL_SIZE_BYTES = MAX_TOTAL_SIZE_MB * 1024 * 1024;

    const totalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0);

    if (totalSize > MAX_TOTAL_SIZE_BYTES) {
        alert(`The total file size cannot exceed ${MAX_TOTAL_SIZE_MB} MB. Please select smaller files.`);
        event.target.value = null; // Clear the selection
        return;
    }
    // --- END NEW LOGIC ---

    if (files.length > 0) {
        const totalSizeInMB = (totalSize / 1024 / 1024).toFixed(2);
        let fileNames = Array.from(files).map(file => file.name).join(', ');
        DOMElements.fileList.textContent = `Selected: ${fileNames} (${totalSizeInMB} MB)`;
    }
}

async function readFilesAsBase64(fileInput) {
    const files = fileInput.files;
    if (!files || files.length === 0) {
        return [];
    }

    const filePromises = Array.from(files).map(file => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                name: file.name,
                type: file.type,
                data: reader.result
            });
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    });

    return await Promise.all(filePromises);
}

function updateLoadingMessage(message) {
    DOMElements.loadingMessage.textContent = message;
}
