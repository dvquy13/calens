import { startOfWeek, format } from 'date-fns';
import { DayContribution } from './contribution-aggregator';

export interface WeeklyContribution {
  weekStartDate: string;      // YYYY-MM-DD (Monday of week)
  weekLabel: string;          // "Jan 1", "Jan 8", etc.
  totalHours: number;         // Sum of all hours in the week
  eventCount: number;         // Sum of all events in the week
}

/**
 * Aggregate daily contributions by week
 * Groups by week starting on Monday, sums hours and events
 */
export function aggregateByWeek(
  contributions: DayContribution[],
  visibleWeeks: number
): WeeklyContribution[] {
  if (contributions.length === 0) {
    return [];
  }

  // Group contributions by week (Monday as week start)
  const weekMap = new Map<string, {
    totalHours: number;
    eventCount: number;
    weekStart: Date;
  }>();

  contributions.forEach((day) => {
    const dayDate = new Date(day.date);
    const weekStart = startOfWeek(dayDate, { weekStartsOn: 1 }); // Monday = 1
    const weekKey = format(weekStart, 'yyyy-MM-dd');

    const existing = weekMap.get(weekKey) || {
      totalHours: 0,
      eventCount: 0,
      weekStart,
    };

    existing.totalHours += day.totalHours;
    existing.eventCount += day.eventCount;
    weekMap.set(weekKey, existing);
  });

  // Convert map to array and sort chronologically
  const weeklyData = Array.from(weekMap.entries())
    .map(([weekStartDate, data]) => ({
      weekStartDate,
      weekLabel: format(data.weekStart, 'MMM d'), // "Jan 1", "Feb 5", etc.
      totalHours: data.totalHours,
      eventCount: data.eventCount,
    }))
    .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));

  // Slice to last visibleWeeks entries to match contribution graph
  return weeklyData.slice(-visibleWeeks);
}
