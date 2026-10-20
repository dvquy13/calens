/**
 * Tag Sync Utilities for Bulk Tag Update Feature
 *
 * Provides functions to find matching events and bulk update their tags
 * using IndexedDB cache and Google Calendar API.
 */

import { MessageType } from './message-types';
import { stripTagsFromDescription, mergeTagsIntoDescription } from './tag-utils';
import type { GoogleCalendarEvent } from '../types/calendar';

/**
 * Finds all events in the specified calendar that match the given summary,
 * excluding the current event.
 *
 * @param summary - Event summary to match
 * @param calendarId - Calendar ID to search within
 * @param currentEventId - Current event ID to exclude from results
 * @param userEmail - User email for IndexedDB query
 * @returns Array of matching events from IndexedDB cache
 */
export async function findMatchingEvents(
  summary: string,
  calendarId: string,
  currentEventId: string,
  userEmail: string
): Promise<GoogleCalendarEvent[]> {
  try {
    // Query IndexedDB cache via background service worker
    const response = await chrome.runtime.sendMessage({
      type: MessageType.GET_CALENDAR_EVENTS,
      userEmail,
      calendarId,
    });

    if (!response.success) {
      console.error('[findMatchingEvents] Failed to get calendar events:', response.error);
      return [];
    }

    // Filter: same summary AND exclude current event
    const matches = (response.events || []).filter(
      (e: GoogleCalendarEvent) =>
        e.summary === summary && e.id !== currentEventId
    );

    return matches;
  } catch (error) {
    console.error('[findMatchingEvents] Error:', error);
    return [];
  }
}

/**
 * Bulk updates tags for multiple events using Google Calendar API.
 * Updates are rate-limited to 100ms per event to avoid API quota issues.
 *
 * @param events - Array of events to update
 * @param tagsInput - Comma-separated tags string
 * @param createCalendarService - Function to create calendar service instance
 * @returns Object with success and failed counts
 */
export async function bulkUpdateEventTags(
  events: GoogleCalendarEvent[],
  tagsInput: string,
  createCalendarService: () => any
): Promise<{ success: number; failed: number }> {
  const calendarService = createCalendarService();
  if (!calendarService) {
    console.error('[bulkUpdateEventTags] Calendar service not available');
    return { success: 0, failed: events.length };
  }

  let success = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const existingDescription = event.description || '';
      const descriptionWithoutTags = stripTagsFromDescription(existingDescription);
      const newDescription = mergeTagsIntoDescription(descriptionWithoutTags, tagsInput);

      // Need to get calendarId from the event (stored in IndexedDB)
      // Events from IndexedDB have calendar_id field
      const calendarId = (event as any).calendar_id || event.id?.split('/')[0];

      if (!calendarId) {
        console.error(`[bulkUpdateEventTags] No calendarId for event ${event.id}`);
        failed++;
        continue;
      }

      await calendarService.events.update(calendarId, event.id, {
        description: newDescription,
      });

      success++;

      // Rate limiting: 100ms delay between updates
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[bulkUpdateEventTags] Failed to update event ${event.id}:`, error);
      failed++;
    }
  }

  return { success, failed };
}
