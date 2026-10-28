/**
 * Calendar Reconciler
 * Handles calendar list synchronization and per-calendar full sync
 */

import { CalendarService } from '../calendar-service';
import { CalendarDatabase } from '../db/database';
import { CalendarStore, EventStore, SYNC_METADATA_KEYS } from '@/types/database';
import { transformGoogleEvent } from './event-transformer';
import { extractTagsForEvent } from './tag-extractor';
import { diag } from '../diag-log';

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
 * The span a full sync covers: one calendar year back and ahead of `now`.
 * Sync tokens issued for a windowed list keep reporting changes outside it.
 */
export function syncWindow(now: Date = new Date()): { timeMin: Date; timeMax: Date } {
  return {
    timeMin: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    timeMax: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()),
  };
}

/**
 * Perform full sync for a single calendar: store the window's events, drop
 * stored in-window events Google no longer returns, and keep the sync token
 * that lets later syncs fetch only changes. Returns the number of events stored.
 */
export async function syncCalendarFull(
  userEmail: string,
  calendar: CalendarStore,
  calendarService: CalendarService,
  db: CalendarDatabase
): Promise<number> {
  // Store calendar
  await db.createCalendar(calendar);

  const { timeMin, timeMax } = syncWindow();
  const response = await calendarService.getEvents(calendar.id, {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    maxResults: 2500
  });

  const eventStores: EventStore[] = (response.items || []).map((event: any) =>
    transformGoogleEvent(userEmail, calendar.id, event)
  );
  await db.batchCreateEvents(eventStores);

  // Prune events deleted while no token covered them. Only this calendar's rows
  // are considered, so an event now owned by another calendar is never touched,
  // and rows outside the window stay (the list didn't ask about them).
  const returnedIds = new Set(eventStores.map(event => event.id));
  const pruned = (await db.getCalendarEvents(userEmail, calendar.id)).filter(
    event => event.start >= timeMin && event.start <= timeMax && !returnedIds.has(event.id)
  );
  for (const event of pruned) {
    await db.deleteEvent(event.id);
  }

  // Tag IDs auto-increment, so replace these events' tags rather than appending.
  const allTags = eventStores.flatMap(event =>
    extractTagsForEvent(userEmail, event.id, event.calendar_id, event.description)
  );
  await db.deleteTagsForEvents([...returnedIds, ...pruned.map(event => event.id)]);
  if (allTags.length > 0) {
    await db.batchCreateTags(allTags);
    console.log(`[SyncService] Extracted ${allTags.length} tags for calendar ${calendar.summary}`);
  }

  if (!response.nextSyncToken) {
    diag('sync', 'warn', 'full sync returned no sync token', { calendarId: calendar.id });
  }

  // Store sync metadata
  await db.setUserMetadata(userEmail, `${SYNC_METADATA_KEYS.LAST_SYNC_PREFIX}${calendar.id}`, {
    calendar_id: calendar.id,
    calendar_name: calendar.summary,
    events_updated: eventStores.length,
    last_sync: new Date(),
    sync_token: response.nextSyncToken
  });

  console.log(`[SyncService] Full sync for ${calendar.summary}: ${eventStores.length} events, ${pruned.length} pruned`);
  return eventStores.length;
}
