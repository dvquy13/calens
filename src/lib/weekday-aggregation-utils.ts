import { startOfWeek, endOfWeek, format } from 'date-fns';
import type { DayContribution } from './contribution-aggregator';

export interface WeekdayContribution {
  weekday: number; // 0=Mon, 1=Tue, ..., 6=Sun
  weekdayLabel: string; // "Mon", "Tue", etc.
  totalHours: number;
  eventCount: number;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Aggregate contributions for a week, grouped by weekday.
 * Returns data for each weekday (Mon-Sun) with total hours and event count.
 * @param contributions - Array of daily contributions
 * @param referenceDate - Optional date to determine which week to show (defaults to current week)
 */
export function aggregateCurrentWeekByWeekday(
  contributions: DayContribution[],
  referenceDate?: Date
): WeekdayContribution[] {
  const targetDate = referenceDate ?? new Date();
  const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 }); // Sunday

  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

  // Filter to current week only
  const currentWeekContributions = contributions.filter(
    (c) => c.date >= weekStartStr && c.date <= weekEndStr
  );

  // Initialize weekday data
  const weekdayData: WeekdayContribution[] = WEEKDAY_LABELS.map((label, index) => ({
    weekday: index,
    weekdayLabel: label,
    totalHours: 0,
    eventCount: 0,
  }));

  // Aggregate by weekday
  currentWeekContributions.forEach((contrib) => {
    const data = weekdayData[contrib.weekday];
    data.totalHours += contrib.totalHours;
    data.eventCount += contrib.eventCount;
  });

  return weekdayData;
}
