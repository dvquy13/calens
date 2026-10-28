import { describe, it, expect } from 'vitest';
import { extractStartTime, extractStartOnlyTime, addMinutes, formatTimeAs } from './time-parser';

describe('extractStartTime', () => {
  describe('24h with minutes', () => {
    it('parses "17:30 – 21:00"', () => {
      const result = extractStartTime('17:30 – 21:00');
      expect(result).toEqual({ match: '17:30', hours: 17, minutes: 30, is12h: false });
    });

    it('parses "9:00 – 10:00"', () => {
      const result = extractStartTime('9:00 – 10:00');
      expect(result).toEqual({ match: '9:00', hours: 9, minutes: 0, is12h: false });
    });
  });

  describe('12h with minutes', () => {
    it('parses "5:30 PM – 9:00 PM"', () => {
      const result = extractStartTime('5:30 PM – 9:00 PM');
      expect(result).toEqual({ match: '5:30 PM', hours: 17, minutes: 30, is12h: true });
    });

    it('parses "12:00 PM – 1:00 PM" (noon)', () => {
      const result = extractStartTime('12:00 PM – 1:00 PM');
      expect(result).toEqual({ match: '12:00 PM', hours: 12, minutes: 0, is12h: true });
    });

    it('parses "12:00 AM – 1:00 AM" (midnight)', () => {
      const result = extractStartTime('12:00 AM – 1:00 AM');
      expect(result).toEqual({ match: '12:00 AM', hours: 0, minutes: 0, is12h: true });
    });
  });

  describe('12h without minutes (short form)', () => {
    it('parses "9am – 12pm"', () => {
      const result = extractStartTime('9am – 12pm');
      expect(result).not.toBeNull();
      expect(result!.hours).toBe(9);
      expect(result!.minutes).toBe(0);
      expect(result!.is12h).toBe(true);
    });

    it('parses "9 AM – 12 PM"', () => {
      const result = extractStartTime('9 AM – 12 PM');
      expect(result).not.toBeNull();
      expect(result!.hours).toBe(9);
      expect(result!.minutes).toBe(0);
      expect(result!.is12h).toBe(true);
    });

    it('parses "2pm – 3pm"', () => {
      const result = extractStartTime('2pm – 3pm');
      expect(result).not.toBeNull();
      expect(result!.hours).toBe(14);
      expect(result!.minutes).toBe(0);
      expect(result!.is12h).toBe(true);
    });

    it('parses "12pm – 1pm" (noon, short form)', () => {
      const result = extractStartTime('12pm – 1pm');
      expect(result).not.toBeNull();
      expect(result!.hours).toBe(12);
      expect(result!.minutes).toBe(0);
      expect(result!.is12h).toBe(true);
    });

    it('parses "12am – 1am" (midnight, short form)', () => {
      const result = extractStartTime('12am – 1am');
      expect(result).not.toBeNull();
      expect(result!.hours).toBe(0);
      expect(result!.minutes).toBe(0);
      expect(result!.is12h).toBe(true);
    });
  });

  // Google omits the start's meridiem when it matches the end's (report y0HcwDYJZGE8TmQpRv7T)
  describe('12h with meridiem only on the end', () => {
    it('parses "1 – 4:45pm"', () => {
      const result = extractStartTime('1 – 4:45pm');
      expect(result).toEqual({ match: '1', hours: 13, minutes: 0, is12h: true });
    });

    it('parses "10 – 11am"', () => {
      const result = extractStartTime('10 – 11am');
      expect(result).toEqual({ match: '10', hours: 10, minutes: 0, is12h: true });
    });

    it('parses "1:30 – 4:45pm" as 12h, not 24h', () => {
      const result = extractStartTime('1:30 – 4:45pm');
      expect(result).toEqual({ match: '1:30', hours: 13, minutes: 30, is12h: true });
    });

    it('parses "12 – 1pm" (noon)', () => {
      const result = extractStartTime('12 – 1pm');
      expect(result).toEqual({ match: '12', hours: 12, minutes: 0, is12h: true });
    });
  });

  describe('unrecognized formats', () => {
    it('returns null for empty string', () => {
      expect(extractStartTime('')).toBeNull();
    });

    it('returns null for all-day event text', () => {
      expect(extractStartTime('LO v4')).toBeNull();
    });

    it('returns null for a bare hour with no meridiem anywhere', () => {
      expect(extractStartTime('9 – 10')).toBeNull();
    });

    // e2e/recurring-event-save-error-badge.spec.ts relies on this label being unparseable
    it('returns null for "10:30-11a" (hyphen separator)', () => {
      expect(extractStartTime('10:30-11a')).toBeNull();
    });
  });
});

describe('extractStartOnlyTime', () => {
  it('parses 24h "18:00" and "9:05"', () => {
    expect(extractStartOnlyTime('18:00')).toEqual({ match: '18:00', hours: 18, minutes: 0, is12h: false });
    expect(extractStartOnlyTime('9:05')).toEqual({ match: '9:05', hours: 9, minutes: 5, is12h: false });
  });

  it('parses 12h "6pm" and "6:30pm"', () => {
    expect(extractStartOnlyTime('6pm')).toEqual({ match: '6pm', hours: 18, minutes: 0, is12h: true });
    expect(extractStartOnlyTime('6:30pm')).toEqual({ match: '6:30pm', hours: 18, minutes: 30, is12h: true });
  });

  it('maps "12am" to 0:00 and "12pm" to 12:00', () => {
    expect(extractStartOnlyTime('12am')).toEqual({ match: '12am', hours: 0, minutes: 0, is12h: true });
    expect(extractStartOnlyTime('12pm')).toEqual({ match: '12pm', hours: 12, minutes: 0, is12h: true });
  });

  it('returns null for a bare hour with no meridiem', () => {
    expect(extractStartOnlyTime('9')).toBeNull();
  });

  it('returns null for ranges and empty text', () => {
    expect(extractStartOnlyTime('10:30-11a')).toBeNull();
    expect(extractStartOnlyTime('18:00 – 19:00')).toBeNull();
    expect(extractStartOnlyTime('')).toBeNull();
  });
});

describe('formatTimeAs', () => {
  it('formats 12h short-form hour correctly after delta', () => {
    // Simulates dragging a "9am" event by 15 minutes
    const { hours, minutes } = addMinutes(9, 0, 15);
    expect(formatTimeAs(hours, minutes, true)).toBe('9:15 AM');
  });
});
