/**
 * Calendar Reconciler
 * Handles calendar list synchronization and full reconciliation
 */

import { CalendarService } from '../calendar-service';
import { CalendarDatabase } from '../db/database';
import { CalendarStore, EventStore, SYNC_METADATA_KEYS } from '@/types/database';
import { transformGoogleEvent } from './event-transformer';
import { extractTagsForEvent } from './tag-extractor';

/**
 * Sync calendar list to detect selection changes
 */
export async function syncCalendarList(
  userEmail: string,
  calendarService: CalendarService,
  db: CalendarDatabase
): Promise<void> {
  const googleCalendars = await calendarService.getCalendars();
  const localCalendars = await db.getUserCalendars(userEmail);

  // Detect newly selected calendars
  for (const gcal of googleCalendars) {
    const local = localCalendars.find(c => c.id === gcal.id);

    if (!local && gcal.selected !== false) {
      // New calendar selected - do full sync for it
      console.log(`[SyncService] New calendar detected: ${gcal.summary}`);
      await syncCalendarFull(userEmail, {
        user_email: userEmail,
        id: gcal.id,
        summary: gcal.summary,
        description: gcal.description,
        primary: gcal.primary || false,
        selected: true,
        backgroundColor: gcal.backgroundColor,
        accessRole: gcal.accessRole,
        created_at: new Date()
      }, calendarService, db);
    } else if (local && gcal.selected === false && local.selected) {
      // Calendar deselected - mark as not selected (keep data for re-enable)
      await db.updateCalendar({ ...local, selected: false });
      console.log(`[SyncService] Calendar deselected: ${gcal.summary}`);
    } else if (local && gcal.selected !== local.selected) {
      // Selection changed
      await db.updateCalendar({ ...local, selected: gcal.selected !== false });
      console.log(`[SyncService] Calendar selection changed: ${gcal.summary}`);
    }
  }
}

/**
 * Full reconciliation to clean up orphaned events
 */
export async function performFullReconciliation(
  userEmail: string,
  calendarId: string,
  calendarService: CalendarService,
  db: CalendarDatabase
): Promise<void> {
  console.log(`[SyncService] Starting full reconciliation for calendar ${calendarId}`);

  // Fetch all event IDs currently in Google Calendar
  const googleEventIds = new Set<string>();

  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const response = await calendarService.getEvents(calendarId, {
    timeMin: oneYearAgo.toISOString(),
    timeMax: now.toISOString(),
    singleEvents: true,
    maxResults: 2500
  });

  for (const event of response.items || []) {
    googleEventIds.add(event.id);
  }

  // Get all local event IDs for this calendar
  const localEvents = await db.getCalendarEvents(userEmail, calendarId);

  // Delete events that no longer exist in Google
  let orphanedCount = 0;
  for (const localEvent of localEvents) {
    if (!googleEventIds.has(localEvent.id)) {
      await db.deleteEvent(localEvent.id);
      await db.deleteEventTags(localEvent.id);
      orphanedCount++;
      console.log(`[SyncService] Removed orphaned event and tags: ${localEvent.id}`);
    }
  }

  console.log(`[SyncService] Full reconciliation complete: ${orphanedCount} orphaned events removed`);
}

/**
 * Perform full sync for a single calendar
 */
export async function syncCalendarFull(
  userEmail: string,
  calendar: CalendarStore,
  calendarService: CalendarService,
  db: CalendarDatabase
): Promise<void> {
  // Store calendar
  await db.createCalendar(calendar);

  // Fetch all events for this calendar
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const response = await calendarService.getEvents(calendar.id, {
    timeMin: oneYearAgo.toISOString(),
    timeMax: now.toISOString(),
    singleEvents: true,
    maxResults: 2500
  });

  const eventStores: EventStore[] = (response.items || []).map((event: any) =>
    transformGoogleEvent(userEmail, calendar.id, event)
  );

  // Clear all existing tags for this calendar to ensure clean state
  await db.deleteCalendarTags(calendar.id);

  await db.batchCreateEvents(eventStores);

  // Extract and store tags for all events
  const allTags = eventStores.flatMap(event =>
    extractTagsForEvent(userEmail, event.id, event.calendar_id, event.description)
  );

  if (allTags.length > 0) {
    await db.batchCreateTags(allTags);
    console.log(`[SyncService] Extracted ${allTags.length} tags for calendar ${calendar.summary}`);
  }

  // Store sync metadata
  await db.setUserMetadata(userEmail, `${SYNC_METADATA_KEYS.LAST_SYNC_PREFIX}${calendar.id}`, {
    calendar_id: calendar.id,
    calendar_name: calendar.summary,
    events_updated: eventStores.length,
    last_sync: now
  });

  console.log(`[SyncService] Full sync for ${calendar.summary}: ${eventStores.length} events`);
}
