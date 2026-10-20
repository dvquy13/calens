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

export async function handleUpdateEventStartOptimistic(
  encodedEventId: string,
  minutesShift: number,
  originalTop: number,
  originalHeight: number,
  getDatabase: () => Promise<CalendarDatabase>,
  tabId?: number
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
    const calendarId = await resolveFullCalendarId(shortCalendarId, getDatabase);
    console.log('[Background] Decoded - eventId:', eventId, 'calendarId:', shortCalendarId, '->', calendarId);

    console.log(`[Background] Updating event ${eventId} on calendar ${calendarId} by ${minutesShift} minutes`);
    diag('drag', 'info', 'update start', { eventId, calendarId, minutesShift });

    // 1. Fetch event to get current start time
    const event = await fetchEvent(token, calendarId, eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // 2. Calculate new start time
    const start = event.start.dateTime || event.start.date;

    if (!start) {
      throw new Error('Event has no start time');
    }

    const startDate = new Date(start);
    const newStartDate = new Date(startDate.getTime() + minutesShift * 60000);

    // Only update start time (dragging top keeps end fixed, changing duration)
    const updateBody = {
      start: {
        dateTime: newStartDate.toISOString(),
        timeZone: event.start.timeZone
      }
    };

    // 3. Patch event
    await patchEvent(token, calendarId, eventId, updateBody);

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
 * Calendar API rejects with 404; map it to the user's real calendar ID.
 */
async function resolveFullCalendarId(
  shortCalendarId: string,
  getDatabase: () => Promise<CalendarDatabase>
): Promise<string> {
  const storage = await chrome.storage.local.get('google_user');
  const userEmail = storage.google_user ? JSON.parse(storage.google_user).email : null;
  if (!userEmail) {
    throw new Error('No signed-in user; cannot resolve calendar for this event');
  }

  const db = await getDatabase();
  const calendars = await db.getUserCalendars(userEmail);
  const calendarId = resolveCalendarId(shortCalendarId, calendars.map(c => c.id));
  if (!calendarId) {
    throw new Error(`Calendar "${shortCalendarId}" not found among synced calendars; try syncing and retry`);
  }
  return calendarId;
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
