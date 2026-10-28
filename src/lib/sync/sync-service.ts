/**
 * Sync Service for Calendar Data
 * Handles initial sync and incremental updates of calendar data from Google Calendar API to IndexedDB
 */

import { CalendarService } from '../calendar-service';
import { CalendarDatabase } from '../db/database';
import { CalendarStore, EventStore, SYNC_METADATA_KEYS } from '@/types/database';
import { transformGoogleEvent } from './event-transformer';
import { extractTagsForEvent } from './tag-extractor';
import { syncCalendarFull } from './calendar-reconciler';
import { resolveCalendarId } from '../event-id-utils';
import { diag } from '../diag-log';

export class SyncService {
  // Incremental syncs run strictly one at a time, in call order.
  private syncChain: Promise<void> = Promise.resolve();

  constructor(
    private calendarService: CalendarService,
    private db: CalendarDatabase
  ) {}

  /**
   * Run one sync with a start entry, a complete entry (counts and duration) or a
   * failure entry. Logs only IDs and counts, never titles or account data.
   */
  private async runLogged(
    kind: 'initial' | 'incremental',
    meta: Record<string, unknown>,
    body: () => Promise<{ calendars: number; events: number }>
  ): Promise<void> {
    const startedAt = Date.now();
    diag('sync', 'info', `${kind} sync start`, meta);
    try {
      const summary = await body();
      diag('sync', 'info', `${kind} sync complete`, {
        calendars: summary.calendars,
        eventsUpdated: summary.events,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      diag('sync', 'error', `${kind} sync failed`, {
        reason: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  /**
   * Perform initial full sync for a user
   * Fetches all calendars and events from the last year
   */
  performInitialSync(
    userEmail: string,
    onProgress?: (message: string, percent: number) => void
  ): Promise<void> {
    // Share the chain with incremental syncs so the two never interleave.
    const run = this.syncChain.then(() =>
      this.runLogged('initial', { mode: 'all' }, () => this.doInitialSync(userEmail, onProgress))
    );
    this.syncChain = run.catch(() => {});
    return run;
  }

  private async doInitialSync(
    userEmail: string,
    onProgress?: (message: string, percent: number) => void
  ): Promise<{ calendars: number; events: number }> {
    console.log('[SyncService] Starting initial sync for', userEmail);
    onProgress?.('Fetching calendars...', 5);

    // Step 1: Fetch and store calendars
    const googleCalendars = await this.calendarService.getCalendars();
    const calendarStores: CalendarStore[] = googleCalendars.map(cal => ({
      user_email: userEmail,
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      primary: cal.primary || false,
      selected: cal.selected !== false, // Default to true unless explicitly false
      backgroundColor: cal.backgroundColor,
      accessRole: cal.accessRole,
      created_at: new Date()
    }));

    await this.db.batchCreateCalendars(calendarStores);
    console.log(`[SyncService] Stored ${calendarStores.length} calendars`);

    // Step 2: Fetch events from selected calendars (1 year past to 1 year future)
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const oneYearAhead = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    const selectedCalendars = calendarStores.filter(c => c.selected);
    let totalEvents = 0;
    let completed = 0;

    for (const calendar of selectedCalendars) {
      onProgress?.(
        `Syncing ${calendar.summary}...`,
        5 + (completed / selectedCalendars.length) * 90
      );

      const response = await this.calendarService.getEvents(calendar.id, {
        timeMin: oneYearAgo.toISOString(),
        timeMax: oneYearAhead.toISOString(),
        singleEvents: true,
        maxResults: 2500 // Google Calendar API limit
      });

      const eventStores: EventStore[] = (response.items || []).map((event: any) =>
        transformGoogleEvent(userEmail, calendar.id, event)
      );

      await this.db.batchCreateEvents(eventStores);
      totalEvents += eventStores.length;
      completed++;

      // Extract and store tags for all events in this calendar
      const allTags = eventStores.flatMap(event =>
        extractTagsForEvent(userEmail, event.id, event.calendar_id, event.description)
      );

      if (allTags.length > 0) {
        await this.db.batchCreateTags(allTags);
        console.log(`[SyncService] Extracted ${allTags.length} tags from ${eventStores.length} events`);
      }

      // Store sync metadata for this calendar
      await this.db.setUserMetadata(userEmail, `${SYNC_METADATA_KEYS.LAST_SYNC_PREFIX}${calendar.id}`, {
        calendar_id: calendar.id,
        calendar_name: calendar.summary,
        events_updated: eventStores.length,
        last_sync: now
      });

      console.log(`[SyncService] Stored ${eventStores.length} events from ${calendar.summary}`);
    }

    // Step 3: Store global sync timestamp
    await this.db.setUserMetadata(userEmail, SYNC_METADATA_KEYS.LAST_FULL_SYNC, {
      timestamp: now,
      calendars_synced: selectedCalendars.length,
      events_updated: totalEvents
    });

    onProgress?.('Sync complete!', 100);
    console.log(`[SyncService] Initial sync complete: ${totalEvents} total events`);
    return { calendars: selectedCalendars.length, events: totalEvents };
  }

  /**
   * Perform incremental sync for a user
   * Fetches only events updated since last sync
   * @param userEmail - User email to sync for
   * @param targetCalendarIds - Optional array of calendar IDs to sync. If not provided, syncs all selected calendars
   */
  performIncrementalSync(userEmail: string, targetCalendarIds?: string[]): Promise<void> {
    const meta = { mode: targetCalendarIds ? 'targeted' : 'all', targets: targetCalendarIds?.length ?? 'all' };
    const run = this.syncChain.then(() =>
      this.runLogged('incremental', meta, () => this._doIncrementalSync(userEmail, targetCalendarIds))
    );
    // The caller sees this sync's failure; later syncs still run.
    this.syncChain = run.catch(() => {});
    return run;
  }

  private async _doIncrementalSync(
    userEmail: string,
    targetCalendarIds?: string[]
  ): Promise<{ calendars: number; events: number }> {
    console.log('[SyncService] Starting incremental sync for', userEmail, targetCalendarIds ? `(targeted: ${targetCalendarIds.join(', ')})` : '(all calendars)');

    const calendars = await this.db.getUserCalendars(userEmail);
    let totalUpdated = 0;

    // Targets come from data-eventid and are abbreviated (e.g. `user@m`).
    // If any can't be resolved, sync every selected calendar rather than
    // silently skipping the one that changed.
    const selected = calendars.filter(c => c.selected);
    let calendarsToSync = selected;
    if (targetCalendarIds) {
      const calendarIds = calendars.map(c => c.id);
      const resolved = targetCalendarIds.map(id => resolveCalendarId(id, calendarIds));
      const unresolved = targetCalendarIds.filter((_, i) => resolved[i] === null);
      if (unresolved.length > 0) {
        console.warn('[SyncService] Could not resolve target calendars, syncing all selected:', unresolved);
        diag('sync', 'warn', 'unresolved sync targets, syncing all selected', { unresolvedCalendarIds: unresolved });
      } else {
        calendarsToSync = selected.filter(c => resolved.includes(c.id));
      }
    }

    for (const calendar of calendarsToSync) {
      console.log(`[SyncService] Syncing calendar: ${calendar.summary} (targeted: ${!!targetCalendarIds})`);

      const lastSyncMeta = await this.db.getUserMetadata(
        userEmail,
        `${SYNC_METADATA_KEYS.LAST_SYNC_PREFIX}${calendar.id}`
      );

      const lastSyncTime = lastSyncMeta?.value?.last_sync;

      if (!lastSyncTime) {
        console.log(`[SyncService] No sync history for ${calendar.summary}, performing full sync`);
        await syncCalendarFull(userEmail, calendar, this.calendarService, this.db);
        diag('sync', 'info', 'calendar full sync', { calendarId: calendar.id });
        continue;
      }

      // Fetch only events updated since last sync
      const response = await this.calendarService.getEvents(calendar.id, {
        updatedMin: new Date(lastSyncTime).toISOString(),
        orderBy: 'updated',
        singleEvents: true,
        maxResults: 500
      });

      const updatedGoogleEvents = response.items || [];
      console.log(`[SyncService] ${calendar.summary}: ${updatedGoogleEvents.length} updated events`);

      // Process updates: created, modified, or deleted
      for (const googleEvent of updatedGoogleEvents) {
        if (googleEvent.status === 'cancelled') {
          // A move keeps the event ID, so the old calendar's tombstone can arrive
          // after the new calendar stored the event. Keep that copy.
          const existing = await this.db.getEvent(googleEvent.id);
          if (existing && existing.calendar_id !== calendar.id) {
            diag('sync', 'info', 'cancelled copy skipped: event lives in another calendar', {
              eventId: googleEvent.id,
              calendarId: calendar.id,
            });
            continue;
          }
          // Event was deleted - remove event and its tags
          await this.db.deleteEvent(googleEvent.id);
          await this.db.deleteEventTags(googleEvent.id);
          console.log(`[SyncService] Deleted event: ${googleEvent.id}`);
        } else {
          const existingEvent = await this.db.getEvent(googleEvent.id);
          const eventStore = transformGoogleEvent(userEmail, calendar.id, googleEvent);

          if (existingEvent) {
            await this.db.updateEvent(eventStore);
            console.log(`[SyncService] Updated event: ${googleEvent.id}`);
          } else {
            await this.db.createEvent(eventStore);
            console.log(`[SyncService] Created event: ${googleEvent.id}`);
          }

          // Update tags (delete old, insert new)
          await this.db.deleteEventTags(eventStore.id);
          const tags = extractTagsForEvent(
            userEmail,
            eventStore.id,
            eventStore.calendar_id,
            eventStore.description
          );
          if (tags.length > 0) {
            await this.db.batchCreateTags(tags);
          }
        }
      }

      totalUpdated += updatedGoogleEvents.length;
      diag('sync', 'info', 'calendar synced', { calendarId: calendar.id, mode: 'incremental', updated: updatedGoogleEvents.length });

      // Update sync timestamp. Known gap: this is the client clock *after* the
      // fetch, so an event saved during the request (or under clock skew) falls
      // before the next updatedMin and is skipped until a full sync. A proper
      // fix is the API's syncToken.
      await this.db.setUserMetadata(userEmail, `${SYNC_METADATA_KEYS.LAST_SYNC_PREFIX}${calendar.id}`, {
        calendar_id: calendar.id,
        calendar_name: calendar.summary,
        events_updated: updatedGoogleEvents.length,
        last_sync: new Date()
      });
    }

    // Update global sync timestamp
    await this.db.setUserMetadata(userEmail, SYNC_METADATA_KEYS.LAST_FULL_SYNC, {
      timestamp: new Date(),
      calendars_synced: calendars.filter(c => c.selected).length,
      events_updated: totalUpdated
    });

    console.log(`[SyncService] Incremental sync complete: ${totalUpdated} events updated`);
    return { calendars: calendarsToSync.length, events: totalUpdated };
  }
}
