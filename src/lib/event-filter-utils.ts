import { TimeEntry } from '../types/calendar';

/**
 * Filter events by selected calendars (OR logic)
 * @param events - All events to filter
 * @param selectedCalendarIds - Calendar IDs to match (OR logic - match ANY)
 * @returns Filtered events matching any selected calendar
 */
export function filterEventsByCalendars(
  events: TimeEntry[],
  selectedCalendarIds: string[]
): TimeEntry[] {
  if (selectedCalendarIds.length === 0) return events;
  return events.filter(e => selectedCalendarIds.includes(e.calendarId));
}

/**
 * Extract unique calendars from events
 * @param events - All events to extract calendars from
 * @returns Array of unique calendars with id, name, and color
 */
export function getUniqueCalendars(events: TimeEntry[]): Array<{
  id: string;
  name: string;
  color: string;
}> {
  const seen = new Map<string, { name: string; color: string }>();
  events.forEach(e => {
    if (!seen.has(e.calendarId)) {
      seen.set(e.calendarId, { name: e.calendarName, color: e.calendarColor ?? '' });
    }
  });
  return Array.from(seen.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    color: data.color,
  }));
}

/**
 * Filter events by selected tags (AND logic)
 * @param events - All events to filter
 * @param selectedTags - Tags to match (AND logic - match ALL)
 * @param eventTagsMap - Map of eventId to tag names
 * @returns Filtered events matching all selected tags
 */
export function filterEventsByTags(
  events: TimeEntry[],
  selectedTags: string[],
  eventTagsMap: Map<string, string[]>
): TimeEntry[] {
  if (selectedTags.length === 0) return events;

  return events.filter(event => {
    const eventTags = eventTagsMap.get(event.eventId) || [];
    // Event must have ALL selected tags (AND logic)
    return selectedTags.every(tag => eventTags.includes(tag));
  });
}

/**
 * Filter events by selected event name (exact match)
 * @param events - All events to filter
 * @param selectedEventName - Event name to match exactly (null for no filter)
 * @returns Filtered events matching the exact event name
 */
export function filterEventsByName(
  events: TimeEntry[],
  selectedEventName: string | null
): TimeEntry[] {
  if (!selectedEventName) return events;
  return events.filter(e => e.title === selectedEventName);
}

/**
 * Combined filter: calendars AND tags AND event name
 * @param events - All events to filter
 * @param selectedCalendarIds - Calendar IDs to match (OR logic)
 * @param selectedTags - Tags to match (AND logic)
 * @param eventTagsMap - Map of eventId to tag names
 * @param selectedEventName - Event name to match exactly (null for no filter)
 * @returns Filtered events matching calendar filter AND tag filter AND event name filter
 */
export function filterEvents(
  events: TimeEntry[],
  selectedCalendarIds: string[],
  selectedTags: string[],
  eventTagsMap: Map<string, string[]>,
  selectedEventName: string | null = null
): TimeEntry[] {
  let filtered = events;

  if (selectedCalendarIds.length > 0) {
    filtered = filterEventsByCalendars(filtered, selectedCalendarIds);
  }

  if (selectedTags.length > 0) {
    filtered = filterEventsByTags(filtered, selectedTags, eventTagsMap);
  }

  if (selectedEventName) {
    filtered = filterEventsByName(filtered, selectedEventName);
  }

  return filtered;
}

/**
 * Extract unique tags from event tags map
 * @param eventTagsMap - Map of eventId to tag names
 * @returns Sorted array of unique tag names
 */
export function getUniqueTags(eventTagsMap: Map<string, string[]>): string[] {
  const allTags = new Set<string>();
  eventTagsMap.forEach(tags => tags.forEach(tag => allTags.add(tag)));
  return Array.from(allTags).sort();
}

/**
 * Extract unique event names from events
 * @param events - All events to extract names from
 * @returns Sorted array of unique event names
 */
export function getUniqueEventNames(events: TimeEntry[]): string[] {
  const names = new Set<string>();
  events.forEach(e => names.add(e.title));
  return Array.from(names).sort();
}

/**
 * Detect if all events share the same calendar color
 * @param events - Events to check
 * @returns The unified color if all events share it, undefined otherwise
 */
export function getUnifiedColor(events: TimeEntry[]): string | undefined {
  if (events.length === 0) return undefined;

  const firstColor = events[0].calendarColor;
  const allSameColor = events.every(e => e.calendarColor === firstColor);

  return allSameColor ? firstColor : undefined;
}
