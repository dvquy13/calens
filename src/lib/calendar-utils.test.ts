import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseEventDateTime,
  calculateDuration,
  isEventCompleted,
  formatDuration,
  formatDateLocal,
  convertToTimeEntry,
} from './calendar-utils';
import type { GoogleCalendarEvent } from '../types/calendar';

describe('parseEventDateTime', () => {
  it('parses dateTime string to Date', () => {
    const result = parseEventDateTime('2024-06-15T09:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2024-06-15T09:00:00.000Z');
  });

  it('parses date-only string for all-day events', () => {
    const result = parseEventDateTime(undefined, '2024-06-15');
    expect(result).toBeInstanceOf(Date);
  });

  it('throws when neither dateTime nor date is provided', () => {
    expect(() => parseEventDateTime(undefined, undefined)).toThrow();
  });

  it('prefers dateTime over date when both present', () => {
    const result = parseEventDateTime('2024-06-15T09:00:00Z', '2024-06-15');
    expect(result.toISOString()).toBe('2024-06-15T09:00:00.000Z');
  });
});

describe('calculateDuration', () => {
  it('calculates duration in minutes', () => {
    const start = new Date('2024-06-15T09:00:00Z');
    const end = new Date('2024-06-15T10:30:00Z');
    expect(calculateDuration(start, end)).toBe(90);
  });

  it('returns 0 for zero duration', () => {
    const t = new Date('2024-06-15T09:00:00Z');
    expect(calculateDuration(t, t)).toBe(0);
  });

  it('handles overnight events', () => {
    const start = new Date('2024-06-15T22:00:00Z');
    const end = new Date('2024-06-16T06:00:00Z');
    expect(calculateDuration(start, end)).toBe(480);
  });
});

describe('isEventCompleted', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when end time is in the past', () => {
    expect(isEventCompleted(new Date('2024-06-15T11:00:00Z'))).toBe(true);
  });

  it('returns false when end time is in the future', () => {
    expect(isEventCompleted(new Date('2024-06-15T13:00:00Z'))).toBe(false);
  });
});

describe('formatDuration', () => {
  it('formats hours only', () => {
    expect(formatDuration(2)).toBe('2h');
  });

  it('formats minutes only for sub-hour durations', () => {
    expect(formatDuration(0.5)).toBe('30m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(1.75)).toBe('1h45m');
  });

  it('formats zero duration', () => {
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('formatDateLocal', () => {
  it('formats date as YYYY-MM-DD', () => {
    const date = new Date(2024, 0, 5); // Jan 5, 2024 local time
    expect(formatDateLocal(date)).toBe('2024-01-05');
  });

  it('zero-pads month and day', () => {
    const date = new Date(2024, 2, 3); // March 3 local time
    expect(formatDateLocal(date)).toBe('2024-03-03');
  });
});

describe('convertToTimeEntry', () => {
  const baseEvent: GoogleCalendarEvent = {
    id: 'evt-1',
    summary: 'Team Sync',
    start: { dateTime: '2024-06-15T09:00:00Z', timeZone: 'UTC' },
    end: { dateTime: '2024-06-15T10:00:00Z', timeZone: 'UTC' },
    organizer: { email: 'org@example.com' },
    creator: { email: 'creator@example.com' },
    attendees: [{ email: 'a@example.com' }],
    location: 'Zoom',
  };

  it('converts a full event correctly', () => {
    const entry = convertToTimeEntry(baseEvent, 'My Calendar', '#ff0000');
    expect(entry.eventId).toBe('evt-1');
    expect(entry.title).toBe('Team Sync');
    expect(entry.calendarName).toBe('My Calendar');
    expect(entry.calendarColor).toBe('#ff0000');
    expect(entry.durationMinutes).toBe(60);
    expect(entry.isAllDay).toBe(false);
    expect(entry.hasAttendees).toBe(true);
    expect(entry.attendeeCount).toBe(1);
    expect(entry.location).toBe('Zoom');
  });

  it('uses organizer email as calendarId', () => {
    const entry = convertToTimeEntry(baseEvent, 'My Calendar');
    expect(entry.calendarId).toBe('org@example.com');
  });

  it('falls back to creator email when organizer is absent', () => {
    const event = { ...baseEvent, organizer: undefined };
    const entry = convertToTimeEntry(event, 'My Calendar');
    expect(entry.calendarId).toBe('creator@example.com');
  });

  it('uses empty string when both organizer and creator are absent', () => {
    const event = { ...baseEvent, organizer: undefined, creator: undefined };
    const entry = convertToTimeEntry(event, 'My Calendar');
    expect(entry.calendarId).toBe('');
  });

  it('sets isAllDay=true for all-day event', () => {
    const event: GoogleCalendarEvent = {
      ...baseEvent,
      start: { date: '2024-06-15' },
      end: { date: '2024-06-16' },
    };
    const entry = convertToTimeEntry(event, 'My Calendar');
    expect(entry.isAllDay).toBe(true);
  });
});
