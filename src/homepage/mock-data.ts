import { CategoryTimeStats, TimeEntry } from '@/types/calendar';
import { DayContribution } from '@/lib/contribution-aggregator';
import { WeeklyContribution } from '@/lib/weekly-aggregation-utils';
import { eachDayOfInterval, format, getDay, addHours, startOfWeek, subWeeks } from 'date-fns';

// Single source of truth for mock calendars
export const MOCK_CALENDARS = [
  { id: 'cal-work', label: 'Work', color: '#039be5' },
  { id: 'cal-personal', label: 'Personal', color: '#7986cb' },
  { id: 'cal-learning', label: 'Learning', color: '#33b679' },
  { id: 'cal-sideprojects', label: 'Side Projects', color: '#f6bf26' },
];

// Mock calendar data for TimeChart (derived from MOCK_CALENDARS)
export const mockTimeChartData: CategoryTimeStats[] = [
  {
    category: MOCK_CALENDARS[0].label,
    completed: 28,
    planned: 12,
    color: MOCK_CALENDARS[0].color,
    aggregatedEvents: [
      { title: 'Meetings', totalHours: 15, calendarColor: MOCK_CALENDARS[0].color },
      { title: 'Development', totalHours: 18, calendarColor: MOCK_CALENDARS[0].color },
      { title: 'Code Review', totalHours: 7, calendarColor: MOCK_CALENDARS[0].color },
    ],
  },
  {
    category: MOCK_CALENDARS[1].label,
    completed: 12,
    planned: 8,
    color: MOCK_CALENDARS[1].color,
    aggregatedEvents: [
      { title: 'Exercise', totalHours: 8, calendarColor: MOCK_CALENDARS[1].color },
      { title: 'Reading', totalHours: 6, calendarColor: MOCK_CALENDARS[1].color },
      { title: 'Hobbies', totalHours: 6, calendarColor: MOCK_CALENDARS[1].color },
    ],
  },
  {
    category: MOCK_CALENDARS[2].label,
    completed: 8,
    planned: 4,
    color: MOCK_CALENDARS[2].color,
    aggregatedEvents: [
      { title: 'Online Courses', totalHours: 7, calendarColor: MOCK_CALENDARS[2].color },
      { title: 'Practice', totalHours: 5, calendarColor: MOCK_CALENDARS[2].color },
    ],
  },
  {
    category: MOCK_CALENDARS[3].label,
    completed: 6,
    planned: 10,
    color: MOCK_CALENDARS[3].color,
    aggregatedEvents: [
      { title: 'Project Planning', totalHours: 4, calendarColor: MOCK_CALENDARS[3].color },
      { title: 'Implementation', totalHours: 12, calendarColor: MOCK_CALENDARS[3].color },
    ],
  },
];

// Calculate totals for TimeChart
export const mockTotalHours = mockTimeChartData.reduce(
  (sum, item) => sum + item.completed + item.planned,
  0
);
export const mockTotalCompleted = mockTimeChartData.reduce(
  (sum, item) => sum + item.completed,
  0
);
export const mockTotalPlanned = mockTimeChartData.reduce(
  (sum, item) => sum + item.planned,
  0
);

// Mock color scale based on #1173ba
export const mockColorScale = [
  '#ebedf0', // 0 - very light gray (no activity)
  '#c6e1f5', // 1 - light blue
  '#6bb6e8', // 2 - medium blue
  '#1173ba', // 3 - primary blue
  '#0d5a94', // 4 - dark blue
];

// Generate mock contributions for 13 weeks
export function generateMockContributions(): Array<DayContribution & { intensity: number }> {
  const endDate = new Date();
  const startDate = subWeeks(endDate, 13);

  const allDays = eachDayOfInterval({ start: startDate, end: endDate });

  return allDays.map((date) => {
    // Random activity level (biased towards some activity)
    const hasActivity = Math.random() > 0.2; // 80% chance of having some activity
    const totalHours = hasActivity ? Math.random() * 8 : 0; // 0-8 hours
    const eventCount = hasActivity ? Math.floor(Math.random() * 5) + 1 : 0; // 1-5 events

    // Calculate intensity (0-4) based on hours
    let intensity = 0;
    if (totalHours > 0) {
      if (totalHours < 1.5) intensity = 1;
      else if (totalHours < 3) intensity = 2;
      else if (totalHours < 5) intensity = 3;
      else intensity = 4;
    }

    // Convert JS getDay (0=Sun) to our format (0=Mon)
    const jsDay = getDay(date);
    const weekday = jsDay === 0 ? 6 : jsDay - 1; // Mon=0, Sun=6

    // Generate mock aggregated events
    const aggregatedEvents = hasActivity
      ? [
          { title: 'Meetings', totalHours: totalHours * 0.4, calendarColor: '#039be5' },
          { title: 'Focus Time', totalHours: totalHours * 0.6, calendarColor: '#7986cb' },
        ]
      : [];

    return {
      date: format(date, 'yyyy-MM-dd'),
      totalHours,
      eventCount,
      weekday,
      month: format(date, 'MMM'),
      dayOfMonth: date.getDate(),
      aggregatedEvents,
      intensity,
    };
  });
}

// Mock filter tags for Activity Lens demo (derived from MOCK_CALENDARS)
export const mockFilterTags = MOCK_CALENDARS.map((cal) => ({
  id: cal.id,
  label: cal.label,
  color: cal.color,
}));

// Mock event titles per calendar
const mockEventTitles: Record<string, string[]> = {
  'cal-work': ['Meetings', 'Development', 'Code Review', 'Planning'],
  'cal-personal': ['Exercise', 'Reading', 'Hobbies', 'Family Time'],
  'cal-learning': ['Online Courses', 'Practice', 'Research', 'Writing'],
  'cal-sideprojects': ['Project Planning', 'Implementation', 'Design', 'Testing'],
};

// Simple seeded random for deterministic mock data
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Static date range for demo: 13 weeks ending on a Friday (Dec 20, 2024)
// This ensures the "last week" always shows Mon-Fri with data
const DEMO_START_DATE = new Date(2024, 8, 23); // Mon, Sep 23, 2024
const DEMO_END_DATE = new Date(2024, 11, 20);  // Fri, Dec 20, 2024
const DEMO_LAST_WEEK_START = new Date(2024, 11, 16); // Mon, Dec 16, 2024

// Generate mock TimeEntry data for UnifiedFilter (static date range)
export function generateMockTimeEntries(): TimeEntry[] {
  const allDays = eachDayOfInterval({ start: DEMO_START_DATE, end: DEMO_END_DATE });
  const events: TimeEntry[] = [];
  let eventId = 0;

  allDays.forEach((date) => {
    // Use date components as seed for deterministic randomness
    const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    const rand1 = seededRandom(seed);
    const rand2 = seededRandom(seed + 1);

    // Check if this day is in the last week
    const isLastWeek = date >= DEMO_LAST_WEEK_START;
    const dayOfWeek = getDay(date); // 0=Sun, 1=Mon, etc.

    // For last week: Mon-Fri always have activity for demo variety
    // For other weeks: 80% chance of activity
    let hasActivity: boolean;
    if (isLastWeek) {
      hasActivity = dayOfWeek >= 1 && dayOfWeek <= 5; // Mon-Fri
    } else {
      hasActivity = rand1 > 0.2;
    }

    if (!hasActivity) return;

    // Generate 1-3 events per day (deterministic)
    const eventCount = Math.floor(rand2 * 3) + 1;

    for (let i = 0; i < eventCount; i++) {
      const eventSeed = seed * 10 + i;
      const calendarIndex = Math.floor(seededRandom(eventSeed) * MOCK_CALENDARS.length);
      const calendar = MOCK_CALENDARS[calendarIndex];
      const titles = mockEventTitles[calendar.id];
      const titleIndex = Math.floor(seededRandom(eventSeed + 1) * titles.length);
      const title = titles[titleIndex];

      const startHour = 9 + Math.floor(seededRandom(eventSeed + 2) * 8);
      const duration = 0.5 + seededRandom(eventSeed + 3) * 2;
      const startTime = addHours(date, startHour);
      const endTime = addHours(startTime, duration);

      events.push({
        eventId: `event-${eventId++}`,
        calendarId: calendar.id,
        calendarName: calendar.label,
        calendarColor: calendar.color,
        title,
        startTime,
        endTime,
        durationMinutes: duration * 60,
        date: format(date, 'yyyy-MM-dd'),
        isAllDay: false,
        hasAttendees: seededRandom(eventSeed + 4) > 0.7,
        attendeeCount: seededRandom(eventSeed + 5) > 0.7 ? Math.floor(seededRandom(eventSeed + 6) * 5) + 1 : 0,
      });
    }
  });

  return events;
}

// Export static date range for use in ActivityLensDemo
export const DEMO_DATE_RANGE = {
  startDate: DEMO_START_DATE,
  endDate: DEMO_END_DATE,
};

export const DEMO_WEEK_DATE_RANGE = {
  start: DEMO_LAST_WEEK_START,
  end: new Date(2024, 11, 22), // Sun, Dec 22, 2024
};

// Generate mock event tags map (some events have tags) - deterministic
export function generateMockEventTagsMap(events: TimeEntry[]): Map<string, string[]> {
  const tagsMap = new Map<string, string[]>();
  const possibleTags = ['Important', 'Recurring', 'Personal', 'Work'];

  events.forEach((event, index) => {
    // Use index as seed for deterministic behavior
    const seed = index * 7;
    // 30% chance of having tags
    if (seededRandom(seed) > 0.7) {
      const numTags = Math.floor(seededRandom(seed + 1) * 2) + 1;
      const tags: string[] = [];
      for (let i = 0; i < numTags; i++) {
        const tagIndex = Math.floor(seededRandom(seed + 2 + i) * possibleTags.length);
        const tag = possibleTags[tagIndex];
        if (!tags.includes(tag)) tags.push(tag);
      }
      tagsMap.set(event.eventId, tags);
    }
  });

  return tagsMap;
}

// Generate weekly aggregation from contributions
export function generateMockWeeklyData(
  contributions: Array<DayContribution & { intensity: number }>,
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
      weekLabel: format(data.weekStart, 'MMM d'),
      totalHours: data.totalHours,
      eventCount: data.eventCount,
    }))
    .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));

  // Slice to last visibleWeeks entries to match contribution graph
  return weeklyData.slice(-visibleWeeks);
}
