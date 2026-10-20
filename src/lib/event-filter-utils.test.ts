import { describe, it, expect } from 'vitest';
import {
  filterEventsByCalendars,
  filterEventsByTags,
  filterEventsByName,
  filterEvents,
  getUniqueCalendars,
  getUniqueTags,
  getUniqueEventNames,
  getUnifiedColor,
} from './event-filter-utils';
import type { TimeEntry } from '../types/calendar';

function makeEntry(overrides: Partial<TimeEntry> & { eventId: string }): TimeEntry {
  return {
    calendarId: 'cal-1',
    calendarName: 'Calendar 1',
    calendarColor: '#ff0000',
    title: 'Event',
    startTime: new Date('2024-06-15T09:00:00'),
    endTime: new Date('2024-06-15T10:00:00'),
    durationMinutes: 60,
    date: '2024-06-15',
    isAllDay: false,
    hasAttendees: false,
    attendeeCount: 0,
    ...overrides,
  };
}

const e1 = makeEntry({ eventId: 'e1', calendarId: 'cal-1', title: 'Alpha', calendarColor: '#ff0000' });
const e2 = makeEntry({ eventId: 'e2', calendarId: 'cal-2', title: 'Beta', calendarColor: '#00ff00' });
const e3 = makeEntry({ eventId: 'e3', calendarId: 'cal-1', title: 'Gamma', calendarColor: '#ff0000' });
const e4 = makeEntry({ eventId: 'e4', calendarId: 'cal-3', title: 'Alpha', calendarColor: '#0000ff' });

const allEvents = [e1, e2, e3, e4];

describe('filterEventsByCalendars', () => {
  it('returns all events when selectedCalendarIds is empty', () => {
    expect(filterEventsByCalendars(allEvents, [])).toEqual(allEvents);
  });

  it('filters by single calendar ID', () => {
    const result = filterEventsByCalendars(allEvents, ['cal-1']);
    expect(result).toEqual([e1, e3]);
  });

  it('filters by multiple calendar IDs (OR logic)', () => {
    const result = filterEventsByCalendars(allEvents, ['cal-1', 'cal-2']);
    expect(result).toEqual([e1, e2, e3]);
  });

  it('returns empty array when no events match', () => {
    expect(filterEventsByCalendars(allEvents, ['cal-999'])).toEqual([]);
  });
});

describe('filterEventsByTags', () => {
  const tagsMap: Map<string, string[]> = new Map([
    ['e1', ['work', 'important']],
    ['e2', ['work']],
    ['e3', ['personal']],
  ]);

  it('returns all events when selectedTags is empty', () => {
    expect(filterEventsByTags(allEvents, [], tagsMap)).toEqual(allEvents);
  });

  it('filters events that have a single tag', () => {
    const result = filterEventsByTags(allEvents, ['work'], tagsMap);
    expect(result).toEqual([e1, e2]);
  });

  it('AND logic: event must have all selected tags', () => {
    const result = filterEventsByTags(allEvents, ['work', 'important'], tagsMap);
    expect(result).toEqual([e1]);
  });

  it('returns empty when no event has all required tags', () => {
    const result = filterEventsByTags(allEvents, ['work', 'personal'], tagsMap);
    expect(result).toEqual([]);
  });

  it('excludes events not in tagsMap when tags are selected', () => {
    const result = filterEventsByTags(allEvents, ['work'], tagsMap);
    expect(result.find(e => e.eventId === 'e4')).toBeUndefined();
  });
});

describe('filterEventsByName', () => {
  it('returns all events when selectedEventName is null', () => {
    expect(filterEventsByName(allEvents, null)).toEqual(allEvents);
  });

  it('filters by exact title match', () => {
    const result = filterEventsByName(allEvents, 'Alpha');
    expect(result).toEqual([e1, e4]);
  });

  it('returns empty array when no title matches', () => {
    expect(filterEventsByName(allEvents, 'Nonexistent')).toEqual([]);
  });
});

describe('filterEvents (combined pipeline)', () => {
  const tagsMap: Map<string, string[]> = new Map([
    ['e1', ['work']],
    ['e2', ['work']],
  ]);

  it('applies all filters simultaneously', () => {
    const result = filterEvents(allEvents, ['cal-1', 'cal-2'], ['work'], tagsMap, 'Alpha');
    expect(result).toEqual([e1]);
  });

  it('returns all events when no filters are active', () => {
    expect(filterEvents(allEvents, [], [], new Map(), null)).toEqual(allEvents);
  });
});

describe('getUniqueCalendars', () => {
  it('deduplicates by calendarId, preserving insertion order', () => {
    const result = getUniqueCalendars(allEvents);
    expect(result.map(c => c.id)).toEqual(['cal-1', 'cal-2', 'cal-3']);
  });

  it('returns correct name and color for each calendar', () => {
    const result = getUniqueCalendars([e1, e2]);
    expect(result[0]).toEqual({ id: 'cal-1', name: 'Calendar 1', color: '#ff0000' });
    expect(result[1]).toEqual({ id: 'cal-2', name: 'Calendar 1', color: '#00ff00' });
  });
});

describe('getUniqueTags', () => {
  it('returns sorted unique tags from map', () => {
    const tagsMap: Map<string, string[]> = new Map([
      ['e1', ['work', 'important']],
      ['e2', ['personal', 'work']],
    ]);
    expect(getUniqueTags(tagsMap)).toEqual(['important', 'personal', 'work']);
  });

  it('returns empty array for empty map', () => {
    expect(getUniqueTags(new Map())).toEqual([]);
  });
});

describe('getUniqueEventNames', () => {
  it('returns sorted unique titles', () => {
    expect(getUniqueEventNames(allEvents)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

describe('getUnifiedColor', () => {
  it('returns the color when all events share the same color', () => {
    expect(getUnifiedColor([e1, e3])).toBe('#ff0000');
  });

  it('returns undefined when events have mixed colors', () => {
    expect(getUnifiedColor([e1, e2])).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(getUnifiedColor([])).toBeUndefined();
  });
});
