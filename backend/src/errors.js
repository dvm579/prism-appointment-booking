/**
 * An error carrying a stable code through to the client.
 *
 * The page shows `message` to the patient and may branch on `code`, so both keep
 * the exact wording endpoints.gs used.
 */
export function coded(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}
