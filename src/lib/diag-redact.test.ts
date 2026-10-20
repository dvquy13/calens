import { describe, it, expect } from 'vitest';
import { buildCalendarLabels, classifyCalendar, maskEmail, Redactor } from './diag-redact';

const calendars = [
  { id: 'me@gmail.com', primary: true },
  { id: 'abc123@group.calendar.google.com', primary: false },
  { id: 'colleague@work.com', primary: false },
  { id: 'en.usa#holiday@group.v.calendar.google.com', primary: false },
];
const labels = buildCalendarLabels(calendars);
const r = new Redactor(labels);

describe('calendar labels', () => {
  it('labels primary and others by type', () => {
    expect(labels.get('me@gmail.com')).toBe('primary');
    expect(labels.get('abc123@group.calendar.google.com')).toMatch(/^cal-\d \(group\)$/);
    expect(labels.get('colleague@work.com')).toMatch(/^cal-\d \(user\)$/);
    expect(labels.get('en.usa#holiday@group.v.calendar.google.com')).toMatch(/^cal-\d \(holiday\)$/);
    expect(classifyCalendar('weird')).toBe('other');
  });
});

describe('Redactor', () => {
  it('replaces full and shortened calendar IDs with labels', () => {
    const group = labels.get('abc123@group.calendar.google.com')!;
    expect(r.string('sync abc123@group.calendar.google.com ok')).toBe(`sync ${group} ok`);
    expect(r.string('resolve abc123@g failed')).toBe(`resolve ${group} failed`);
    expect(r.string('me@m and me@gmail.com')).toBe('primary and primary');
  });

  it('masks unknown emails', () => {
    expect(r.string('from stranger@example.com')).toBe('from s***@example.com');
    expect(maskEmail('a@b.c')).toBe('a***@b.c');
  });

  it('relabels base64 data-eventid and keeps it correlatable', () => {
    const enc = btoa('evt123 abc123@g').replace(/=+$/, '');
    const out = r.string(`select ${enc}`);
    expect(out).not.toContain(enc);
    const token = out.split(' ')[1];
    expect(atob(token)).toBe(`evt123 ${labels.get('abc123@group.calendar.google.com')}`);
    // the same transformation yields the same token for panel state
    expect(r.value({ selectedEventId: enc })).toEqual({ selectedEventId: token });
  });

  it('leaves ordinary long words alone', () => {
    expect(r.string('handleUpdateEventStartOptimistic')).toBe('handleUpdateEventStartOptimistic');
  });

  it('redacts nested data and keys, and whole entries', () => {
    const out = r.entry({
      t: 1, ctx: 'sw', cat: 'sync', level: 'error', msg: 'failed for me@gmail.com',
      data: { 'x@work.org': ['colleague@work.com'] },
    });
    expect(JSON.stringify(out)).not.toMatch(/me@gmail|colleague@work|x@work/);
    expect(out.msg).toBe('failed for primary');
  });
});
