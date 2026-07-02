// Swagger "Try it out" example dates, computed once when the API boots so the
// pre-filled payloads are always valid at test time. Restart the API to refresh
// them. (Swagger bakes examples into the OpenAPI document at startup, so they
// reflect server-start time rather than each page load.)
const now = new Date();

// End of tomorrow (23:59:59.999 UTC) — gives the tester a comfortably open window.
const endOfTomorrow = new Date(now);
endOfTomorrow.setUTCDate(endOfTomorrow.getUTCDate() + 1);
endOfTomorrow.setUTCHours(23, 59, 59, 999);

export const EXAMPLE_NOW_ISO = now.toISOString();
export const EXAMPLE_END_OF_TOMORROW_ISO = endOfTomorrow.toISOString();
