/**
 * Event Update Handler
 * Handles optimistic event updates with rollback on failure
 */

import { MessageType } from '../lib/message-types';
import { decodeEventId, resolveCalendarId } from '../lib/event-id-utils';
import { handleApiError } from '../lib/error-utils';
import { diag } from '../lib/diag-log';
import { GoogleCalendarEvent } from '../types/calendar';
import type { CalendarDatabase } from '../lib/db/database';
import type { CalendarStore } from '../types/database';
import {
  applyRecurringEdit,
  canEditSeries,
  type EditScope,
  type RecurringClient,
} from '../lib/recurring/recurring-edit';

const EDIT_SCOPES: readonly EditScope[] = ['this', 'following', 'all'];

/**
 * A drag of a recurring instance without `scope` writes nothing: it asks the tab
 * which scope to use (UPDATE_EVENT_NEEDS_SCOPE), and the tab resends with the choice.
 */
export async function handleUpdateEventStartOptimistic(
  encodedEventId: string,
  minutesShift: number,
  originalTop: number,
  originalHeight: number,
  getDatabase: () => Promise<CalendarDatabase>,
  tabId?: number,
  scope?: EditScope
): Promise<void> {
  try {
    console.log(`[Background] Starting optimistic update for event ${encodedEventId}`);

    const token = await getAuthToken();
    if (!token) {
      throw new Error('No auth token available');
    }

    // Decode event ID
    console.log('[Background] Raw encodedEventId:', encodedEventId);
    const { eventId, calendarId: shortCalendarId } = decodeEventId(encodedEventId);
    const calendar = await resolveCalendar(shortCalendarId, getDatabase);
    const calendarId = calendar.id;
    console.log('[Background] Decoded - eventId:', eventId, 'calendarId:', shortCalendarId, '->', calendarId);

    console.log(`[Background] Updating event ${eventId} on calendar ${calendarId} by ${minutesShift} minutes`);
    diag('drag', 'info', 'update start', { eventId, calendarId, minutesShift });

    if (scope !== undefined && !EDIT_SCOPES.includes(scope)) {
      throw new Error(`Unknown edit scope: ${scope}`);
    }

    // 1. Fetch event to get current start time
    const event = await fetchEvent(token, calendarId, eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // 2. Recurring instance without a chosen scope: ask the tab, write nothing yet
    if (event.recurringEventId && scope === undefined) {
      const master = await fetchEvent(token, calendarId, event.recurringEventId);
      const seriesAllowed = canEditSeries(master, calendar.accessRole);
      diag('drag', 'info', 'needs scope', { eventId, canEditSeries: seriesAllowed });
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: MessageType.UPDATE_EVENT_NEEDS_SCOPE,
          eventId: encodedEventId,
          canEditSeries: seriesAllowed
        }).catch((err) => {
          // Tab might be closed, ignore
          console.log('[Background] Could not ask tab for scope (probably closed):', err);
        });
      }
      return;
    }

    // Only the start moves (dragging top keeps end fixed, changing duration)
    const shiftStart = (base: GoogleCalendarEvent): Partial<GoogleCalendarEvent> => {
      const start = base.start.dateTime || base.start.date;
      if (!start) {
        throw new Error('Event has no start time');
      }
      return {
        start: {
          dateTime: new Date(new Date(start).getTime() + minutesShift * 60000).toISOString(),
          timeZone: base.start.timeZone
        }
      };
    };

    // 3. Patch event
    if (event.recurringEventId && scope !== undefined) {
      await applyRecurringEdit(createSeriesClient(token), {
        calendarId,
        instance: event,
        scope,
        buildPatch: shiftStart,
      });
    } else {
      await patchEvent(token, calendarId, eventId, shiftStart(event));
    }

    // SUCCESS: Notify content script
    console.log('[Background] Event updated successfully');
    diag('drag', 'info', 'update ok', { eventId, calendarId });

    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: MessageType.UPDATE_EVENT_SUCCESS,
        eventId: encodedEventId,
        calendarId: calendarId
      }).catch((err) => {
        // Tab might be closed, ignore
        console.log('[Background] Could not notify tab (probably closed):', err);
      });
    }

  } catch (error) {
    // FAILURE: Notify content script to rollback
    console.error('[Background] Failed to update event (optimistic):', error);
    diag('drag', 'error', 'handleUpdateEventStartOptimistic:catch', {
      error: error instanceof Error ? error.message : 'Unknown error',
      eventId: encodedEventId,
      minutesShift,
    });

    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: MessageType.UPDATE_EVENT_FAILED,
        eventId: encodedEventId,
        originalTop: originalTop,
        originalHeight: originalHeight,
        error: error instanceof Error ? error.message : 'Unknown error'
      }).catch((err) => {
        // Tab might be closed, ignore
        console.log('[Background] Could not notify tab about failure (probably closed):', err);
      });
    }
  }
}

/**
 * data-eventid carries an abbreviated calendar ID (e.g. `user@m`) that the
 * Calendar API rejects with 404; map it to the user's real calendar row.
 */
async function resolveCalendar(
  shortCalendarId: string,
  getDatabase: () => Promise<CalendarDatabase>
): Promise<CalendarStore> {
  const storage = await chrome.storage.local.get('google_user');
  const userEmail = storage.google_user ? JSON.parse(storage.google_user).email : null;
  if (!userEmail) {
    throw new Error('No signed-in user; cannot resolve calendar for this event');
  }

  const db = await getDatabase();
  const calendars = await db.getUserCalendars(userEmail);
  const calendarId = resolveCalendarId(shortCalendarId, calendars.map(c => c.id));
  const calendar = calendars.find(c => c.id === calendarId);
  if (!calendar) {
    throw new Error(`Calendar "${shortCalendarId}" not found among synced calendars; try syncing and retry`);
  }
  return calendar;
}

function getAuthToken(): Promise<string | undefined> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] Auth error:', chrome.runtime.lastError);
        diag('auth', 'error', 'getAuthToken failed', { reason: chrome.runtime.lastError.message });
        resolve(undefined);
      } else {
        resolve(token);
      }
    });
  });
}

async function fetchEvent(token: string, calendarId: string, eventId: string): Promise<GoogleCalendarEvent> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  console.log('[Background] Fetching event from:', url);

  const response = await fetch(
    url,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    await handleApiError(response, 'Fetch event');
  }

  return response.json();
}

async function patchEvent(token: string, calendarId: string, eventId: string, body: any): Promise<GoogleCalendarEvent> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  console.log('[Background] Patching event at:', url);

  const response = await fetch(
    url,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    await handleApiError(response, 'Patch event');
  }

  return response.json();
}

/** Calendar API adapter for applyRecurringEdit. Shares the token and error handling of fetchEvent/patchEvent. */
function createSeriesClient(token: string): RecurringClient {
  return {
    get: (calendarId, eventId) => fetchEvent(token, calendarId, eventId),
    patch: (calendarId, eventId, body) => patchEvent(token, calendarId, eventId, body),
    insert: (calendarId, body) => insertEvent(token, calendarId, body),
    instances: (calendarId, seriesId, params) => listInstances(token, calendarId, seriesId, params),
  };
}

async function insertEvent(token: string, calendarId: string, body: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  console.log('[Background] Inserting event at:', url);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handleApiError(response, 'Insert event');
  }

  return response.json();
}

/**
 * Lists instances of a series. Without maxResults every page is followed; with it
 * a single page is fetched, so an unbounded series is never walked to the end.
 */
async function listInstances(
  token: string,
  calendarId: string,
  seriesId: string,
  params: { timeMin?: string; timeMax?: string; maxResults?: number; showDeleted?: boolean } = {}
): Promise<GoogleCalendarEvent[]> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(seriesId)}/instances`;
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams();
    if (params.timeMin) query.set('timeMin', params.timeMin);
    if (params.timeMax) query.set('timeMax', params.timeMax);
    if (params.maxResults) query.set('maxResults', String(params.maxResults));
    if (params.showDeleted) query.set('showDeleted', 'true');
    if (pageToken) query.set('pageToken', pageToken);

    const response = await fetch(`${url}?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      await handleApiError(response, 'List instances');
    }

    const page: { items?: GoogleCalendarEvent[]; nextPageToken?: string } = await response.json();
    events.push(...(page.items ?? []));
    pageToken = params.maxResults ? undefined : page.nextPageToken;
  } while (pageToken);

  return events;
}
