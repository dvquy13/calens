/**
 * Event ID Utilities
 * Consolidated logic for decoding Google Calendar event IDs
 */

export interface DecodedEventId {
  eventId: string;
  calendarId: string;
}

/**
 * Decode event ID from Google Calendar's data-eventid attribute
 * Format: base64("eventId calendarId")
 *
 * The calendar part is Google's abbreviated form, NOT a usable calendar ID
 * (e.g. `user@gmail.com` -> `user@m`, `x@group.calendar.google.com` -> `x@g`;
 * the Calendar API 404s on these). Pass it through `resolveCalendarId` before
 * using it.
 *
 * @param encodedEventId - Base64 encoded event ID from data-eventid attribute
 * @returns Object containing decoded eventId and (abbreviated) calendarId
 */
export function decodeEventId(encodedEventId: string): DecodedEventId {
  try {
    const decoded = atob(encodedEventId);
    const parts = decoded.split(' ');
    return { eventId: parts[0], calendarId: parts[1] || 'primary' };
  } catch (error) {
    console.warn('[Event ID] Failed to decode, using fallback:', error);
    return { eventId: encodedEventId, calendarId: 'primary' };
  }
}

/**
 * Encode an event ID the way Google Calendar's `data-eventid` attribute does.
 * Inverse of `decodeEventId`. Pass the abbreviated calendar part (the one
 * `decodeEventId` returns), not a full calendar ID.
 */
export function encodeEventId(eventId: string, shortCalendarId: string): string {
  return btoa(`${eventId} ${shortCalendarId}`);
}

/**
 * Resolve an abbreviated calendar ID from `data-eventid` to one of the user's
 * full calendar IDs.
 *
 * Google only shortens the domain (`@m`, `@g`, `@v`, ...), so match on the
 * part before `@` instead of hard-coding a suffix table. Returns null when
 * nothing or more than one calendar matches.
 */
export function resolveCalendarId(shortId: string, calendarIds: string[]): string | null {
  if (calendarIds.includes(shortId)) return shortId;

  const localPart = shortId.split('@')[0];
  const matches = calendarIds.filter((id) => id.split('@')[0] === localPart);
  return matches.length === 1 ? matches[0] : null;
}
