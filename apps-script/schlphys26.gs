function generateSchoolPhys26PDF(data, sigBlob, info) {
  const answers = createAnswerMap(data);
  const mainDB = SpreadsheetApp.openById(SPREADSHEET_ID);
  const physSheet = mainDB.getSheetByName('School Physicals');

  const currentServiceID = info.serviceMap ? info.serviceMap['schlphys26'] : "MANUAL_ENTRY";
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM-dd-yyyy");

  // Mapping CSV QuestionIDs (schlphys26-X) to your Spreadsheet Columns
  const rowData = [
    currentServiceID,
    info.aid,
    info.fid,
    info.pid,
    info.ds,
    get(data, 'demographics.lastName', ''),
    get(data, 'demographics.firstName', ''),
    get(data, 'demographics.middleName', ''),
    get(data, 'demographics.dob', ''),
    answers['schlphys26-2'] || get(data, 'demographics.gender', ''), // Sex at Birth
    get(data, 'demographics.street', ''),
    get(data, 'demographics.city', ''),
    get(data, 'demographics.state', ''),
    get(data, 'demographics.zip', ''),
    get(data, 'demographics.race', ''),
    get(data, 'demographics.ethnicity', ''),
    answers['schlphys26-56'], // School
    answers['schlphys26-57'], // Grade
    answers['schlphys26-1'] || '', // Student ID
    get(data, 'demographics.parentName', ''),
    get(data, 'demographics.parentContact', ''),
    get(data, 'demographics.parentRel', ''),

    // Medical History (IDs 3-55)
    answers['schlphys26-3'] || '', answers['schlphys26-4'] || '', // Allergies
    answers['schlphys26-5'] || '', answers['schlphys26-6'] || '', // Meds
    answers['schlphys26-7'] || '', answers['schlphys26-8'] || '', // Asthma
    answers['schlphys26-9'] || '', answers['schlphys26-10'] || '', // Cough
    answers['schlphys26-11'] || '', answers['schlphys26-12'] || '', // Organs
    answers['schlphys26-13'] || '', answers['schlphys26-14'] || '', // Birth Defects
    answers['schlphys26-15'] || '', answers['schlphys26-16'] || '', // Hosp
    answers['schlphys26-17'] || '', answers['schlphys26-18'] || '', // Dev Delay
    answers['schlphys26-19'] || '', answers['schlphys26-20'] || '', // Blood
    answers['schlphys26-21'] || '', answers['schlphys26-22'] || '', // Surgery
    answers['schlphys26-23'] || '', answers['schlphys26-24'] || '', // Diabetes
    answers['schlphys26-25'] || '', answers['schlphys26-26'] || '', // Serious Illness
    answers['schlphys26-27'] || '', answers['schlphys26-28'] || '', // Head Injury
    answers['schlphys26-29'] || '', answers['schlphys26-30'] || '', // TB Skin
    answers['schlphys26-31'] || '', answers['schlphys26-32'] || '', // TB Disease
    answers['schlphys26-33'] || '', answers['schlphys26-34'] || '', // Seizures
    answers['schlphys26-35'] || '', answers['schlphys26-36'] || '', // Heart/Breath
    answers['schlphys26-37'] || '', answers['schlphys26-38'] || '', // Tobacco
    answers['schlphys26-39'] || '', answers['schlphys26-40'] || '', // Alcohol/Drug
    answers['schlphys26-41'] || '', answers['schlphys26-42'] || '', // Heart Murmur
    answers['schlphys26-43'] || '', answers['schlphys26-44'] || '', // Dizziness
    answers['schlphys26-45'] || '', answers['schlphys26-46'] || '', // Sudden Death
    answers['schlphys26-47'] || '', // History eye
    answers['schlphys26-48'] || '', // Glasses contacts
    answers['schlphys26-49'] || '', // Last eye exam
    answers['schlphys26-50'] || '', // Other eye concerns
    answers['schlphys26-51'] || '', // Dental braces bridge plate
    answers['schlphys26-52'] || '', answers['schlphys26-53'] || '', // Ear/Hearing
    answers['schlphys26-54'] || '', answers['schlphys26-55'] || '', // Bone/Joint

    get(data, 'demographics.parentName', '') || fullName(data),
    info.sigUrl || '', // Signature URL passed from Code.gs
    dateStr,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
    "Normal", "Normal", , 20, 20, "Normal", "Normal", "Normal", "Normal", "Normal", "Normal", "No",
    "Normal", "Normal", "Normal", , "Normal", "Normal", "Normal", "Normal", "Normal",
  ];

  physSheet.appendRow(rowData);
}
