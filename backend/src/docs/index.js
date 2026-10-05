// FormID -> filler, and the clinical-sheet rows. A form with no filler here is
// still documented by Apps Script, which is why the page only sends an event to
// this service once every one of its services is covered (see RUN_SERVICES in
// src/config.js of the page).

import { shcFillers } from './shc/index.js';
import { wowClinicalRows, wowFillers } from './wow/index.js';

export const fillers = {
    ...wowFillers,
    ...shcFillers
};

export async function clinicalRows(job, sheets) {
    await wowClinicalRows(job, sheets);
}
