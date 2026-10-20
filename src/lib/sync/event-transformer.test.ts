import { describe, it, expect } from 'vitest';
import { transformGoogleEvent } from './event-transformer';

const baseGoogleEvent = {
  id: 'evt-123',
  summary: 'Team Sync',
  description: 'Weekly sync',
  location: 'Zoom',
  status: 'confirmed',
  start: { dateTime: '2024-06-15T09:00:00Z', timeZone: 'UTC' },
  end: { dateTime: '2024-06-15T10:00:00Z', timeZone: 'UTC' },
  created: '2024-06-01T00:00:00Z',
  updated: '2024-06-10T00:00:00Z',
  htmlLink: 'https://calendar.google.com/event?eid=abc',
  recurringEventId: 'rec-456',
  colorId: '3',
  etag: '"abc123"',
  sequence: 1,
  attendees: [{ email: 'alice@example.com', responseStatus: 'accepted' }],
};

describe('transformGoogleEvent', () => {
  it('maps all fields from a full event', () => {
    const result = transformGoogleEvent('user@example.com', 'cal-id', baseGoogleEvent);

    expect(result.user_email).toBe('user@example.com');
    expect(result.id).toBe('evt-123');
    expect(result.calendar_id).toBe('cal-id');
    expect(result.summary).toBe('Team Sync');
    expect(result.description).toBe('Weekly sync');
    expect(result.location).toBe('Zoom');
    expect(result.status).toBe('confirmed');
    expect(result.htmlLink).toBe('https://calendar.google.com/event?eid=abc');
    expect(result.recurringEventId).toBe('rec-456');
    expect(result.colorId).toBe('3');
    expect(result.etag).toBe('"abc123"');
    expect(result.sequence).toBe(1);
    expect(result.attendees).toHaveLength(1);
    expect(result.isAllDay).toBe(false);
  });

  it('uses (No title) when summary is missing', () => {
    const event = { ...baseGoogleEvent, summary: undefined };
    const result = transformGoogleEvent('user@example.com', 'cal-id', event);
    expect(result.summary).toBe('(No title)');
  });

  it('sets isAllDay=true for all-day events (date present, dateTime absent)', () => {
    const event = {
      ...baseGoogleEvent,
      start: { date: '2024-06-15' },
      end: { date: '2024-06-16' },
    };
    const result = transformGoogleEvent('user@example.com', 'cal-id', event);
    expect(result.isAllDay).toBe(true);
    expect(result.start).toEqual(new Date('2024-06-15'));
  });

  it('sets original_start to undefined when originalStartTime is absent', () => {
    const result = transformGoogleEvent('user@example.com', 'cal-id', baseGoogleEvent);
    expect(result.original_start).toBeUndefined();
  });

  it('parses original_start when originalStartTime is present', () => {
    const event = {
      ...baseGoogleEvent,
      originalStartTime: { dateTime: '2024-06-14T09:00:00Z' },
    };
    const result = transformGoogleEvent('user@example.com', 'cal-id', event);
    expect(result.original_start).toEqual(new Date('2024-06-14T09:00:00Z'));
  });

  it('parses created and updated as valid Date objects', () => {
    const result = transformGoogleEvent('user@example.com', 'cal-id', baseGoogleEvent);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.created_at.toISOString()).toBe('2024-06-01T00:00:00.000Z');
  });
});
