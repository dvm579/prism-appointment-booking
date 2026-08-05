// Cached references to the static elements in index.html.

const byId = id => document.getElementById(id);

export const dom = {
    // Chrome
    loadingOverlay: byId('loadingOverlay'),
    loadingMessage: byId('loadingMessage'),
    appAlert: byId('appAlert'),
    appAlertMessage: byId('appAlertMessage'),
    translationButtons: byId('translationButtons'),

    // Sections
    eventDetails: byId('eventDetails'),
    eventSelectionSection: byId('eventSelectionSection'),
    eventCardsGrid: byId('eventCardsGrid'),
    slotSection: byId('slotSection'),
    slotsGrid: byId('slotsGrid'),
    waitlistSection: byId('waitlistSection'),
    joinWaitlistBtn: byId('joinWaitlistBtn'),
    formSection: byId('formSection'),
    confirmationSection: byId('confirmationSection'),

    // Form
    regForm: byId('regForm'),
    submitButton: byId('submitButton'),
    goBackButton: byId('goBackButton'),
    timer: byId('timer'),
    dob: byId('dob'),
    parentFields: byId('parentFields'),
    parentName: byId('parentName'),
    parentRel: byId('parentRel'),
    hasRecordsCheck: byId('hasRecordsCheck'),
    recordsSection: byId('recordsSection'),
    medicalRecordsUpload: byId('medicalRecordsUpload'),
    fileList: byId('fileList'),
    dynamicFormsContainer: byId('dynamicFormsContainer'),

    // Insurance (mounted from a template when a form asks for it)
    insuranceMount: byId('insuranceMount'),
    insuranceTemplate: byId('insuranceTemplate'),

    // Consent
    consentAccordion: byId('consentAccordion'),
    consentBody: byId('consent-body'),
    certifyConsentRow: byId('certifyConsentRow'),
    certifyConsent: byId('certifyConsent'),

    // Signature
    consentSignatureBlock: byId('consentSignatureBlock'),
    additionalSignatures: byId('additionalSignatures'),
    drawTab: byId('draw-tab'),
    typeTab: byId('type-tab'),
    sigPad: byId('sigPad'),
    clearSignatureBtn: byId('clearSignatureBtn'),
    typedName: byId('typedName'),
    typeCanvas: byId('typeCanvas'),

    // Confirmation
    confEventName: byId('confEventName'),
    confEventDate: byId('confEventDate'),
    confEventDateRow: byId('confEventDateRow'),
    confPatientName: byId('confPatientName'),
    confPatientDob: byId('confPatientDob'),
    confApptIdRow: byId('confApptIdRow'),
    confApptId: byId('confApptId'),
    confWaitlistMessage: byId('confWaitlistMessage'),
    confQrCode: byId('confQrCode')
};
