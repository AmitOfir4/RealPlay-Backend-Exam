// Swagger example dates, computed at boot so pre-filled payloads are valid.
const now = new Date();

const endOfTomorrow = new Date(now);
endOfTomorrow.setUTCDate(endOfTomorrow.getUTCDate() + 1);
endOfTomorrow.setUTCHours(23, 59, 59, 999);

export const EXAMPLE_NOW_ISO = now.toISOString();
export const EXAMPLE_END_OF_TOMORROW_ISO = endOfTomorrow.toISOString();
