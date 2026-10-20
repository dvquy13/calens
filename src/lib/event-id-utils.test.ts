import { describe, it, expect } from 'vitest';
import { resolveCalendarId } from './event-id-utils';

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
