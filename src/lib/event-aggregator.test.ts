import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aggregateByCalendar, aggregateByTitle, aggregateByTag } from './event-aggregator';
import type { TimeEntry } from '../types/calendar';

// Fixed "now": 2024-06-15T12:00:00Z
const NOW = new Date('2024-06-15T12:00:00Z');

function makeEntry(overrides: Partial<TimeEntry> & Pick<TimeEntry, 'eventId' | 'startTime' | 'endTime'>): TimeEntry {
  const durationMinutes = (overrides.endTime.getTime() - overrides.startTime.getTime()) / 60000;
  return {
    calendarId: 'org@example.com',
    calendarName: 'Work',
    calendarColor: '#4285f4',
    title: 'Meeting',
    date: '2024-06-15',
    isAllDay: false,
    hasAttendees: false,
    attendeeCount: 0,
    durationMinutes,
    ...overrides,
  };
}

// Completed (end before now)
const completed1 = makeEntry({
  eventId: 'c1',
  calendarName: 'Work',
  calendarColor: '#4285f4',
  title: 'Standup',
  startTime: new Date('2024-06-15T08:00:00Z'),
  endTime: new Date('2024-06-15T08:30:00Z'), // 30m
});

const completed2 = makeEntry({
  eventId: 'c2',
  calendarName: 'Work',
  calendarColor: '#4285f4',
  title: 'Design Review',
  startTime: new Date('2024-06-15T09:00:00Z'),
  endTime: new Date('2024-06-15T10:00:00Z'), // 60m
});

const completed3 = makeEntry({
  eventId: 'c3',
  calendarName: 'Personal',
  calendarColor: '#0f9d58',
  title: 'Lunch',
  startTime: new Date('2024-06-15T11:00:00Z'),
  endTime: new Date('2024-06-15T11:45:00Z'), // 45m
});

// In-progress (start < now < end)
const inProgress = makeEntry({
  eventId: 'ip1',
  calendarName: 'Work',
  calendarColor: '#4285f4',
  title: 'Team Sync',
  startTime: new Date('2024-06-15T11:00:00Z'),
  endTime: new Date('2024-06-15T13:00:00Z'), // 120m total; 60m elapsed + 60m remaining at noon
});

// Planned (start after now)
const planned1 = makeEntry({
  eventId: 'p1',
  calendarName: 'Personal',
  calendarColor: '#0f9d58',
  title: 'Gym',
  startTime: new Date('2024-06-15T14:00:00Z'),
  endTime: new Date('2024-06-15T15:00:00Z'), // 60m
});

const planned2 = makeEntry({
  eventId: 'p2',
  calendarName: 'Work',
  calendarColor: '#4285f4',
  title: 'Standup',
  startTime: new Date('2024-06-16T08:00:00Z'),
  endTime: new Date('2024-06-16T08:30:00Z'), // 30m
});

const fixtures = [completed1, completed2, completed3, inProgress, planned1, planned2];

beforeEach(() => {
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('aggregateByCalendar', () => {
  it('groups events by calendarName', () => {
    const result = aggregateByCalendar(fixtures);
    const categories = result.map(r => r.category);
    expect(categories).toContain('Work');
    expect(categories).toContain('Personal');
  });

  it('sums completed hours correctly', () => {
    const result = aggregateByCalendar(fixtures);
    const work = result.find(r => r.category === 'Work')!;
    // completed1 (30m) + completed2 (60m) = 90m = 1.5h; plus in-progress elapsed 60m = 1h
    expect(work.completed).toBeCloseTo(2.5, 2);

    const personal = result.find(r => r.category === 'Personal')!;
    // completed3 (45m = 0.75h)
    expect(personal.completed).toBeCloseTo(0.75, 2);
  });

  it('sums planned hours correctly', () => {
    const result = aggregateByCalendar(fixtures);
    const work = result.find(r => r.category === 'Work')!;
    // in-progress remaining 60m + planned2 30m = 90m = 1.5h
    expect(work.planned).toBeCloseTo(1.5, 2);

    const personal = result.find(r => r.category === 'Personal')!;
    // planned1 60m = 1h
    expect(personal.planned).toBeCloseTo(1, 2);
  });
});

describe('aggregateByTitle', () => {
  it('groups events by title', () => {
    const result = aggregateByTitle(fixtures);
    const titles = result.map(r => r.category);
    expect(titles).toContain('Standup');
    expect(titles).toContain('Team Sync');
    expect(titles).toContain('Lunch');
  });

  it('sums Standup: one completed + one planned', () => {
    const result = aggregateByTitle(fixtures);
    const standup = result.find(r => r.category === 'Standup')!;
    expect(standup.completed).toBeCloseTo(0.5, 2); // 30m
    expect(standup.planned).toBeCloseTo(0.5, 2);   // 30m
  });

  it('splits in-progress Team Sync correctly', () => {
    const result = aggregateByTitle(fixtures);
    const sync = result.find(r => r.category === 'Team Sync')!;
    expect(sync.completed).toBeCloseTo(1, 2);
    expect(sync.planned).toBeCloseTo(1, 2);
  });
});

describe('aggregateByTag', () => {
  it('event with multiple tags appears in both groups', () => {
    const tagsMap = new Map([['c1', ['work', 'daily']]]);
    const result = aggregateByTag([completed1], tagsMap);
    const tags = result.map(r => r.category);
    expect(tags).toContain('work');
    expect(tags).toContain('daily');
    const workEntry = result.find(r => r.category === 'work')!;
    expect(workEntry.completed).toBeCloseTo(0.5, 2);
  });

  it('untagged events appear under "Untagged" key', () => {
    const result = aggregateByTag([completed1], new Map());
    expect(result[0].category).toBe('Untagged');
    expect(result[0].completed).toBeCloseTo(0.5, 2);
  });

  it('uniform color is kept; mixed colors use gray fallback', () => {
    const tagsMap = new Map([
      ['c1', ['shared']],
      ['c2', ['shared']],
      ['c3', ['shared']], // different calendarColor
    ]);
    const result = aggregateByTag([completed1, completed2, completed3], tagsMap);
    const shared = result.find(r => r.category === 'shared')!;
    // c1 and c2 have #4285f4, c3 has #0f9d58 — mixed
    expect(shared.color).toBe('#6b7280');
  });

  it('uniform color is preserved when all events share it', () => {
    const tagsMap = new Map([
      ['c1', ['work']],
      ['c2', ['work']],
    ]);
    const result = aggregateByTag([completed1, completed2], tagsMap);
    const work = result.find(r => r.category === 'work')!;
    expect(work.color).toBe('#4285f4');
  });

  it('empty eventTagsMap puts all events under Untagged', () => {
    const result = aggregateByTag(fixtures, new Map());
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Untagged');
  });
});
