import { differenceInMinutes } from 'date-fns';
import type { TimeEntry, CategoryTimeStats } from '../types/calendar';
import { aggregateEventsByTitle } from './aggregation-utils';

export type AggregationMode = 'calendar' | 'title' | 'tag';

/**
 * Aggregate events by calendar name, calculating completed and planned hours
 */
export function aggregateByCalendar(events: TimeEntry[]): CategoryTimeStats[] {
  // Group events by calendar name
  const calendarMap = new Map<string, {
    completed: number;
    planned: number;
    color?: string;
    events: TimeEntry[];
  }>();

  const now = new Date();

  for (const event of events) {
    const existing = calendarMap.get(event.calendarName) || {
      completed: 0,
      planned: 0,
      color: event.calendarColor, // Capture color from first event
      events: [],
    };

    const durationHours = event.durationMinutes / 60;

    // Three-way logic: completed, in-progress, or planned
    if (event.endTime < now) {
      // Event has ended - fully completed
      existing.completed += durationHours;
    } else if (event.startTime > now) {
      // Event hasn't started - fully planned
      existing.planned += durationHours;
    } else {
      // Event is in progress - split at current time
      const totalMinutes = event.durationMinutes;
      const elapsedMinutes = differenceInMinutes(now, event.startTime);
      const remainingMinutes = totalMinutes - elapsedMinutes;

      existing.completed += elapsedMinutes / 60;
      existing.planned += remainingMinutes / 60;
    }

    existing.events.push(event);

    calendarMap.set(event.calendarName, existing);
  }

  // Convert to array format for chart
  return Array.from(calendarMap.entries()).map(([category, stats]) => {
    // Use shared utility to aggregate events by title
    const aggregatedEvents = aggregateEventsByTitle(stats.events);

    return {
      category,
      completed: Math.round(stats.completed * 100) / 100, // Round to 2 decimal places
      planned: Math.round(stats.planned * 100) / 100,
      color: stats.color, // Include color in output
      aggregatedEvents,
    };
  });
}

/**
 * Aggregate events by event title, calculating completed and planned hours
 */
export function aggregateByTitle(events: TimeEntry[]): CategoryTimeStats[] {
  const titleMap = new Map<string, {
    completed: number;
    planned: number;
    color?: string;
    events: TimeEntry[];
  }>();

  const now = new Date();

  for (const event of events) {
    const existing = titleMap.get(event.title) || {
      completed: 0,
      planned: 0,
      color: event.calendarColor,
      events: [],
    };

    const durationHours = event.durationMinutes / 60;

    if (event.endTime < now) {
      existing.completed += durationHours;
    } else if (event.startTime > now) {
      existing.planned += durationHours;
    } else {
      const totalMinutes = event.durationMinutes;
      const elapsedMinutes = differenceInMinutes(now, event.startTime);
      const remainingMinutes = totalMinutes - elapsedMinutes;

      existing.completed += elapsedMinutes / 60;
      existing.planned += remainingMinutes / 60;
    }

    existing.events.push(event);

    titleMap.set(event.title, existing);
  }

  return Array.from(titleMap.entries()).map(([category, stats]) => {
    const aggregatedEvents = aggregateEventsByTitle(stats.events);

    return {
      category,
      completed: Math.round(stats.completed * 100) / 100,
      planned: Math.round(stats.planned * 100) / 100,
      color: stats.color,
      aggregatedEvents,
    };
  });
}

const TAG_COLOR_FALLBACK = '#6b7280'; // Neutral gray when events have mixed colors
const UNTAGGED_KEY = 'Untagged';

/**
 * Aggregate events by tag, calculating completed and planned hours.
 * Events with multiple tags contribute full time to each tag.
 * Events without tags appear as "Untagged".
 * Uses calendar color if all events with a tag share the same color.
 */
export function aggregateByTag(
  events: TimeEntry[],
  eventTagsMap: Map<string, string[]>
): CategoryTimeStats[] {
  const tagMap = new Map<string, {
    completed: number;
    planned: number;
    colors: Set<string>;
    events: TimeEntry[];
  }>();

  const now = new Date();

  for (const event of events) {
    const tags = eventTagsMap.get(event.eventId) || [];
    const targetTags = tags.length > 0 ? tags : [UNTAGGED_KEY];

    const durationHours = event.durationMinutes / 60;
    let completedHours = 0;
    let plannedHours = 0;

    if (event.endTime < now) {
      completedHours = durationHours;
    } else if (event.startTime > now) {
      plannedHours = durationHours;
    } else {
      const totalMinutes = event.durationMinutes;
      const elapsedMinutes = differenceInMinutes(now, event.startTime);
      const remainingMinutes = totalMinutes - elapsedMinutes;
      completedHours = elapsedMinutes / 60;
      plannedHours = remainingMinutes / 60;
    }

    for (const tag of targetTags) {
      const existing = tagMap.get(tag) || {
        completed: 0,
        planned: 0,
        colors: new Set<string>(),
        events: [],
      };

      existing.completed += completedHours;
      existing.planned += plannedHours;
      if (event.calendarColor) {
        existing.colors.add(event.calendarColor);
      }
      existing.events.push(event);

      tagMap.set(tag, existing);
    }
  }

  return Array.from(tagMap.entries()).map(([category, stats]) => {
    const aggregatedEvents = aggregateEventsByTitle(stats.events);
    // Use calendar color if all events share the same color, otherwise fallback to gray
    const color = stats.colors.size === 1
      ? Array.from(stats.colors)[0]
      : TAG_COLOR_FALLBACK;

    return {
      category,
      completed: Math.round(stats.completed * 100) / 100,
      planned: Math.round(stats.planned * 100) / 100,
      color,
      aggregatedEvents,
    };
  });
}
