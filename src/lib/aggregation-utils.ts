import type { TimeEntry, AggregatedEvent } from '../types/calendar';

/**
 * Aggregate events by title, summing durations
 */
export function aggregateEventsByTitle(events: TimeEntry[]): AggregatedEvent[] {
  const titleMap = new Map<string, { totalMinutes: number; calendarColor: string }>();

  events.forEach((event) => {
    const titleKey = event.title;
    const existing = titleMap.get(titleKey) || { totalMinutes: 0, calendarColor: event.calendarColor || '#4285f4' };
    existing.totalMinutes += event.durationMinutes;
    titleMap.set(titleKey, existing);
  });

  return Array.from(titleMap.entries())
    .map(([title, data]) => ({
      title,
      totalHours: data.totalMinutes / 60,
      calendarColor: data.calendarColor,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}