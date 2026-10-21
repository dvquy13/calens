import { describe, it, expect } from 'vitest';
import { parseIcalDate, splitRecurrence } from './rrule-split';

describe('splitRecurrence (timed series)', () => {
  const splitAt = new Date('2026-11-02T09:00:00Z');

  it('bounds the old RRULE with UNTIL one second before the split and keeps the original UNTIL on the new side', () => {
    const result = splitRecurrence(
      ['RRULE:FREQ=WEEKLY;UNTIL=20261231T000000Z'],
      splitAt,
      false
    );
    expect(result.oldRecurrence).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261102T085959Z']);
    expect(result.newRecurrence).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261231T000000Z']);
  });

  it('adds UNTIL to an open-ended RRULE and leaves the new side open-ended', () => {
    const result = splitRecurrence(['RRULE:FREQ=WEEKLY'], splitAt, false);
    expect(result.oldRecurrence).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261102T085959Z']);
    expect(result.newRecurrence).toEqual(['RRULE:FREQ=WEEKLY']);
  });

  it('replaces an existing UNTIL on the old side when it is later than the split', () => {
    const result = splitRecurrence(['RRULE:FREQ=DAILY;UNTIL=20270101T000000Z'], splitAt, false);
    expect(result.oldRecurrence).toEqual(['RRULE:FREQ=DAILY;UNTIL=20261102T085959Z']);
  });

  it('removes COUNT from the old side and splits it on the new side', () => {
    const result = splitRecurrence(['RRULE:FREQ=DAILY;COUNT=10'], splitAt, false, 3);
    expect(result.oldRecurrence).toEqual(['RRULE:FREQ=DAILY;UNTIL=20261102T085959Z']);
    expect(result.newRecurrence).toEqual(['RRULE:FREQ=DAILY;COUNT=7']);
  });

  it('throws when COUNT is present but countBefore is missing', () => {
    expect(() => splitRecurrence(['RRULE:FREQ=DAILY;COUNT=10'], splitAt, false)).toThrow(/countBefore/);
  });

  it('throws when countBefore leaves no occurrences on the new side', () => {
    expect(() => splitRecurrence(['RRULE:FREQ=DAILY;COUNT=3'], splitAt, false, 3)).toThrow(/no occurrences/);
  });

  it('throws on a malformed COUNT, even when countBefore is provided', () => {
    expect(() => splitRecurrence(['RRULE:FREQ=DAILY;COUNT=abc'], splitAt, false, 1)).toThrow(/COUNT/);
    expect(() => splitRecurrence(['RRULE:FREQ=DAILY;COUNT=0'], splitAt, false, 0)).toThrow(/COUNT/);
    expect(() => splitRecurrence(['RRULE:FREQ=DAILY;COUNT=-2'], splitAt, false, 0)).toThrow(/COUNT/);
  });

  it('keeps BYDAY lists intact on both sides', () => {
    const result = splitRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'], splitAt, false);
    expect(result.oldRecurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261102T085959Z']);
    expect(result.newRecurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR']);
  });

  it('partitions EXDATE values by instant between old and new', () => {
    const result = splitRecurrence(
      ['RRULE:FREQ=WEEKLY', 'EXDATE:20261019T090000Z,20261109T090000Z'],
      splitAt,
      false
    );
    expect(result.oldRecurrence).toContain('EXDATE:20261019T090000Z');
    expect(result.oldRecurrence).not.toContain('EXDATE:20261019T090000Z,20261109T090000Z');
    expect(result.newRecurrence).toEqual(['RRULE:FREQ=WEEKLY', 'EXDATE:20261109T090000Z']);
  });

  it('puts an EXDATE equal to the split instant on the new side', () => {
    const result = splitRecurrence(['RRULE:FREQ=WEEKLY', 'EXDATE:20261102T090000Z'], splitAt, false);
    expect(result.oldRecurrence).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261102T085959Z']);
    expect(result.newRecurrence).toEqual(['RRULE:FREQ=WEEKLY', 'EXDATE:20261102T090000Z']);
  });

  it('partitions TZID-qualified EXDATEs using the zone rules, not the wall-clock string', () => {
    // 2026-11-02 09:00 New York (EST, after DST ends on Nov 1) is 14:00Z.
    const tzSplit = new Date('2026-11-02T14:00:00Z');
    const result = splitRecurrence(
      ['RRULE:FREQ=WEEKLY', 'EXDATE;TZID=America/New_York:20261026T090000,20261102T090000'],
      tzSplit,
      false
    );
    expect(result.oldRecurrence).toEqual([
      'RRULE:FREQ=WEEKLY;UNTIL=20261102T135959Z',
      'EXDATE;TZID=America/New_York:20261026T090000',
    ]);
    expect(result.newRecurrence).toEqual([
      'RRULE:FREQ=WEEKLY',
      'EXDATE;TZID=America/New_York:20261102T090000',
    ]);
  });

  it('drops an EXDATE line whose values all end up on the other side', () => {
    const result = splitRecurrence(['RRULE:FREQ=WEEKLY', 'EXDATE:20261019T090000Z'], splitAt, false);
    expect(result.newRecurrence).toEqual(['RRULE:FREQ=WEEKLY']);
  });

  it('partitions RDATE values the same way and reads PERIOD values by their start', () => {
    const result = splitRecurrence(
      ['RRULE:FREQ=WEEKLY', 'RDATE;VALUE=PERIOD:20261019T090000Z/PT1H,20261109T090000Z/PT1H'],
      splitAt,
      false
    );
    expect(result.oldRecurrence).toContain('RDATE;VALUE=PERIOD:20261019T090000Z/PT1H');
    expect(result.newRecurrence).toContain('RDATE;VALUE=PERIOD:20261109T090000Z/PT1H');
  });

  it('passes unknown lines through to both sides', () => {
    const result = splitRecurrence(['RRULE:FREQ=WEEKLY', 'X-CUSTOM:keep'], splitAt, false);
    expect(result.oldRecurrence).toContain('X-CUSTOM:keep');
    expect(result.newRecurrence).toContain('X-CUSTOM:keep');
  });
});

describe('splitRecurrence (all-day series)', () => {
  // All-day occurrences are UTC midnight of their date.
  const splitAt = new Date('2026-11-02T00:00:00Z');

  it('sets UNTIL to the date before the split, without a time part', () => {
    const result = splitRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=MO'], splitAt, true);
    expect(result.oldRecurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261101']);
    expect(result.newRecurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
  });

  it('crosses a month boundary correctly for UNTIL', () => {
    const result = splitRecurrence(['RRULE:FREQ=DAILY'], new Date('2026-03-01T00:00:00Z'), true);
    expect(result.oldRecurrence).toEqual(['RRULE:FREQ=DAILY;UNTIL=20260228']);
  });

  it('partitions VALUE=DATE EXDATEs by date', () => {
    const result = splitRecurrence(
      ['RRULE:FREQ=WEEKLY', 'EXDATE;VALUE=DATE:20261026,20261102'],
      splitAt,
      true
    );
    expect(result.oldRecurrence).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261101', 'EXDATE;VALUE=DATE:20261026']);
    expect(result.newRecurrence).toEqual(['RRULE:FREQ=WEEKLY', 'EXDATE;VALUE=DATE:20261102']);
  });

  it('splits COUNT for all-day series too', () => {
    const result = splitRecurrence(['RRULE:FREQ=WEEKLY;COUNT=5'], splitAt, true, 2);
    expect(result.newRecurrence).toEqual(['RRULE:FREQ=WEEKLY;COUNT=3']);
  });
});

describe('parseIcalDate', () => {
  it('parses UTC values as instants', () => {
    expect(parseIcalDate('20261102T090000Z')).toBe(Date.UTC(2026, 10, 2, 9));
  });

  it('parses all-day values as UTC midnight', () => {
    expect(parseIcalDate('20261102')).toBe(Date.UTC(2026, 10, 2));
  });

  it('parses TZID wall-clock values in that zone', () => {
    expect(parseIcalDate('20261102T090000', 'America/New_York')).toBe(Date.UTC(2026, 10, 2, 14));
    expect(parseIcalDate('20260702T090000', 'America/New_York')).toBe(Date.UTC(2026, 6, 2, 13));
  });
});
