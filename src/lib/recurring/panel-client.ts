/**
 * Side-panel adapter from the Calendar API client (google-auth.ts) to the
 * RecurringClient interface used by recurring-edit.ts. Type-only import of
 * google-auth so this module stays importable from tests and never pulls
 * the panel's runtime code into other bundles.
 */
import type { createCalendarClient } from '../google-auth';
import type { RecurringClient } from './recurring-edit';

export type CalendarEventsClient = ReturnType<typeof createCalendarClient>['events'];

export function toRecurringClient(events: CalendarEventsClient): RecurringClient {
  return {
    get: (calendarId, eventId) => events.get(calendarId, eventId),
    patch: (calendarId, eventId, body) =>
      events.update(calendarId, eventId, body as Record<string, unknown>),
    insert: (calendarId, body) => events.insert(calendarId, body as Record<string, unknown>),
    instances: (calendarId, seriesId, params) => events.instances(calendarId, seriesId, params),
  };
}

export interface SyncWindow {
  timeMin: string;
  timeMax: string;
}

/**
 * The window the initial sync fetches: 1 year back to 1 year ahead, measured
 * from the same calendar day (see doInitialSync in sync/sync-service.ts).
 */
export function syncWindow(now: Date = new Date()): SyncWindow {
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const oneYearAhead = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  return { timeMin: oneYearAgo.toISOString(), timeMax: oneYearAhead.toISOString() };
}
