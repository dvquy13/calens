/**
 * IndexedDB Message Handlers
 * Handles database query requests from other parts of the extension
 */

import { CalendarDatabase } from '../lib/db/database';
import { EventStore, TagStore, SYNC_METADATA_KEYS } from '../types/database';
import { GoogleCalendarEvent } from '../types/calendar';
import { lastSyncToIso } from '../lib/last-sync';

/**
 * Transform EventStore to GoogleCalendarEvent format
 * Converts Date objects back to the format expected by the UI
 */
function transformEventStoreToGoogleEvent(eventStore: EventStore): GoogleCalendarEvent {
  const isAllDay = eventStore.isAllDay;

  return {
    id: eventStore.id,
    summary: eventStore.summary,
    description: eventStore.description,
    start: isAllDay
      ? { date: eventStore.start.toISOString().split('T')[0] }
      : { dateTime: eventStore.start.toISOString() },
    end: isAllDay
      ? { date: eventStore.end.toISOString().split('T')[0] }
      : { dateTime: eventStore.end.toISOString() },
    location: eventStore.location,
    status: eventStore.status,
    htmlLink: eventStore.htmlLink,
    recurringEventId: eventStore.recurringEventId,
    attendees: eventStore.attendees?.map(a => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: a.responseStatus as 'needsAction' | 'declined' | 'tentative' | 'accepted' | undefined,
    })),
  };
}

export async function handleGetCalendars(
  message: any,
  sendResponse: (response: any) => void,
  db: CalendarDatabase
): Promise<void> {
  try {
    const calendars = await db.getUserCalendars(message.userEmail);
    sendResponse({ success: true, data: calendars });
  } catch (error) {
    console.error('[Background] GET_CALENDARS error:', error);

    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function handleGetEventsByRange(
  message: any,
  sendResponse: (response: any) => void,
  db: CalendarDatabase
): Promise<void> {
  try {
    const events = await db.getUserEventsByDateRange(
      message.userEmail,
      new Date(message.startDate),
      new Date(message.endDate)
    );
    sendResponse({ success: true, data: events });
  } catch (error) {
    console.error('[Background] GET_EVENTS_BY_RANGE error:', error);

    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function handleGetEvent(
  message: any,
  sendResponse: (response: any) => void,
  db: CalendarDatabase
): Promise<void> {
  try {
    const eventStore = await db.getEvent(message.eventId);

    if (!eventStore) {
      sendResponse({ success: false, error: 'Event not found' });
      return;
    }

    const event = transformEventStoreToGoogleEvent(eventStore);

    sendResponse({
      success: true,
      data: {
        event,
        selectedCalendarId: eventStore.calendar_id,
      }
    });
  } catch (error) {
    console.error('[Background] GET_EVENT error:', error);

    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function handleGetCalendarEvents(
  message: any,
  sendResponse: (response: any) => void,
  db: CalendarDatabase
): Promise<void> {
  try {
    const events = await db.getCalendarEvents(message.userEmail, message.calendarId);
    sendResponse({ success: true, events });
  } catch (error) {
    console.error('[Background] GET_CALENDAR_EVENTS error:', error);

    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function handleGetEventTags(
  message: any,
  sendResponse: (response: any) => void,
  db: CalendarDatabase
): Promise<void> {
  try {
    if (!message.eventIds || !Array.isArray(message.eventIds)) {
      sendResponse({ success: false, error: 'Invalid eventIds' });
      return;
    }

    const tags: TagStore[][] = await Promise.all(
      message.eventIds.map((id: string) => db.getEventTags(id))
    );

    // Flatten and return as map: eventId -> tag names
    const tagMap: Record<string, string[]> = {};
    message.eventIds.forEach((eventId: string, idx: number) => {
      tagMap[eventId] = tags[idx].map(t => t.tag_name);
    });

    sendResponse({ success: true, data: tagMap });
  } catch (error) {
    console.error('[Background] GET_EVENT_TAGS error:', error);

    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Diagnostics-only read: most recent per-calendar sync timestamp for a user,
 * across all calendars ever synced. Used by the Diagnostics panel.
 */
export async function handleGetLastSyncTime(
  message: any,
  sendResponse: (response: any) => void,
  db: CalendarDatabase
): Promise<void> {
  try {
    const allMetadata = await db.getAllUserMetadata(message.userEmail);
    const lastSyncTimes = allMetadata
      .filter(m => m.key.startsWith(SYNC_METADATA_KEYS.LAST_SYNC_PREFIX))
      .map(m => lastSyncToIso(m.value?.last_sync))
      .filter((t): t is string => t !== null);

    const mostRecent = lastSyncTimes.length > 0
      ? lastSyncTimes.reduce((latest, t) => (t > latest ? t : latest))
      : null;

    sendResponse({ success: true, data: mostRecent });
  } catch (error) {
    console.error('[Background] GET_LAST_SYNC_TIME error:', error);
    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
