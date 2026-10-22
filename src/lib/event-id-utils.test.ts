import { describe, it, expect } from 'vitest';
import { decodeEventId, encodeEventId, resolveCalendarId } from './event-id-utils';

const CALENDARS = [
  'someone@gmail.com',
  'abc123@group.calendar.google.com',
  'en.singapore#holiday@group.v.calendar.google.com',
  'name@company.com',
];

describe('resolveCalendarId', () => {
  it('returns an already-full ID unchanged', () => {
    expect(resolveCalendarId('name@company.com', CALENDARS)).toBe('name@company.com');
  });

  it('resolves the abbreviated primary gmail calendar (`@m`)', () => {
    expect(resolveCalendarId('someone@m', CALENDARS)).toBe('someone@gmail.com');
  });

  it('resolves an abbreviated group calendar (`@g`)', () => {
    expect(resolveCalendarId('abc123@g', CALENDARS)).toBe('abc123@group.calendar.google.com');
  });

  it('resolves an abbreviated holiday calendar', () => {
    expect(resolveCalendarId('en.singapore#holiday@v', CALENDARS)).toBe(
      'en.singapore#holiday@group.v.calendar.google.com'
    );
  });

  it('returns null when no calendar matches', () => {
    expect(resolveCalendarId('stranger@m', CALENDARS)).toBeNull();
  });

  it('returns null when the abbreviation is ambiguous', () => {
    expect(resolveCalendarId('name@x', [...CALENDARS, 'name@gmail.com'])).toBeNull();
  });
});

describe('encodeEventId', () => {
  it('round-trips through decodeEventId', () => {
    const encoded = encodeEventId('abc123_20261102T090000Z', 'someone@m');
    expect(decodeEventId(encoded)).toEqual({
      eventId: 'abc123_20261102T090000Z',
      calendarId: 'someone@m',
    });
  });

  it('produces the same base64 shape Google emits in data-eventid', () => {
    expect(encodeEventId('evt1', 'name@g')).toBe(btoa('evt1 name@g'));
  });
});
