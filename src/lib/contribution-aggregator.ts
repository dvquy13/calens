import { eachDayOfInterval, format, getDay } from 'date-fns';
import { TimeEntry, AggregatedEvent } from '../types/calendar';
import { aggregateEventsByTitle } from './aggregation-utils';

export interface DayContribution {
  date: string; // YYYY-MM-DD
  totalHours: number;
  eventCount: number;
  weekday: number; // 0=Mon, 1=Tue, ..., 6=Sun
  month: string; // "Jan", "Feb", etc.
  dayOfMonth: number; // 1-31
  aggregatedEvents: AggregatedEvent[];
}

/**
 * Aggregate events by date, sum durations
 * Fills in missing dates with zero hours
 */
export function aggregateByDate(
  events: TimeEntry[],
  startDate: Date,
  endDate: Date
): DayContribution[] {
  // Create map of date -> aggregated data
  const aggregateMap = new Map<string, {
    totalMinutes: number;
    eventCount: number;
    events: TimeEntry[];
  }>();

  // Aggregate events
  events.forEach((event) => {
    const dateKey = event.date; // Already in YYYY-MM-DD format
    const existing = aggregateMap.get(dateKey) || {
      totalMinutes: 0,
      eventCount: 0,
      events: []
    };

    // Update total
    existing.totalMinutes += event.durationMinutes;
    existing.eventCount += 1;
    existing.events.push(event);

    aggregateMap.set(dateKey, existing);
  });

  // Generate full date range
  const allDates = eachDayOfInterval({ start: startDate, end: endDate });

  // Map to DayContribution with missing dates filled
  return allDates.map((date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const aggregate = aggregateMap.get(dateKey) || {
      totalMinutes: 0,
      eventCount: 0,
      events: []
    };

    // Use shared utility to aggregate events by title
    const aggregatedEvents = aggregateEventsByTitle(aggregate.events);

    // Convert getDay (0=Sun, 1=Mon, ..., 6=Sat) to our format (0=Mon, 1=Tue, ..., 6=Sun)
    const jsDay = getDay(date); // 0=Sun, 1=Mon, ..., 6=Sat
    const weekday = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon, 1=Tue, ..., 6=Sun

    return {
      date: dateKey,
      totalHours: aggregate.totalMinutes / 60,
      eventCount: aggregate.eventCount,
      weekday,
      month: format(date, 'MMM'),
      dayOfMonth: date.getDate(),
      aggregatedEvents,
    };
  });
}

/**
 * Calculate relative color intensity (0-4 like GitHub)
 * 0: 0 hours (no events)
 * 1-4: Quartiles based on max value in dataset
 */
export function calculateColorIntensity(
  contributions: DayContribution[]
): Array<DayContribution & { intensity: number }> {
  // Find max hours (excluding 0)
  const nonZeroHours = contributions
    .map((c) => c.totalHours)
    .filter((h) => h > 0);

  if (nonZeroHours.length === 0) {
    // All zeros
    return contributions.map((c) => ({ ...c, intensity: 0 }));
  }

  const maxHours = Math.max(...nonZeroHours);

  // Calculate quartile thresholds
  const q1 = maxHours * 0.25;
  const q2 = maxHours * 0.5;
  const q3 = maxHours * 0.75;

  return contributions.map((c) => {
    let intensity: number;
    if (c.totalHours === 0) {
      intensity = 0;
    } else if (c.totalHours <= q1) {
      intensity = 1;
    } else if (c.totalHours <= q2) {
      intensity = 2;
    } else if (c.totalHours <= q3) {
      intensity = 3;
    } else {
      intensity = 4;
    }

    return { ...c, intensity };
  });
}
