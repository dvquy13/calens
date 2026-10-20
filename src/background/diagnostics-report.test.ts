import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildDiagnosticsReport, compareCalendarLabels } from './diagnostics-report';
import { appendDiagEntry, clearDiag } from '../lib/diag-log';

const EMAIL = 'me@gmail.com';
const GROUP = 'abc123@group.calendar.google.com';

beforeEach(async () => {
  const store: Record<string, unknown> = {
    google_user: JSON.stringify({ email: EMAIL }),
    google_access_token: 'secret-token',
    google_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  };
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ version: '9.9.9' }) },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const ks = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(ks.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
        }),
        set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(store, structuredClone(items)); }),
        remove: vi.fn(async (k: string) => { delete store[k]; }),
      },
    },
  });
  // The SW always has navigator; Node only has it from v21 (CI runs 20), so stub it.
  vi.stubGlobal('navigator', { userAgent: 'test-agent', language: 'en-US' });
  await clearDiag();
});

const db = {
  getUserCalendars: vi.fn().mockResolvedValue([
    { id: EMAIL, primary: true, selected: true, summary: 'My Private Cal' },
    { id: GROUP, primary: false, selected: false, summary: 'Team' },
  ]),
  getUserMetadata: vi.fn(async (_u: string, key: string) =>
    key === `last_sync_${EMAIL}` ? { value: { last_sync: new Date('2026-05-01T10:00:00Z'), events_updated: 4 } } : undefined),
  getCalendarEvents: vi.fn(async (_u: string, id: string) => (id === EMAIL ? [{}, {}, {}] : [])),
};

describe('compareCalendarLabels', () => {
  it('orders primary first, then cal-N numerically', () => {
    const labels = ['cal-10 (group)', 'cal-2', 'cal-1 (group)', 'primary', 'cal-11', 'other'];
    expect(labels.sort(compareCalendarLabels)).toEqual(['primary', 'cal-1 (group)', 'cal-2', 'cal-10 (group)', 'cal-11', 'other']);
  });
});

describe('buildDiagnosticsReport', () => {
  it('has the documented shape with labelled calendars and a correct ISO last_sync', async () => {
    const report = await buildDiagnosticsReport({ selectedEventId: 'e1' }, db as never);
    expect(report.env).toMatchObject({ version: '9.9.9' });
    expect(['development', 'production']).toContain(report.env.mode);
    expect(report.user.email).toBe(EMAIL);
    expect(report.auth).toMatchObject({ hasToken: true, tokenExpired: false });
    expect(report.calendars).toEqual([
      { label: 'primary', selected: true, last_sync: '2026-05-01T10:00:00.000Z', events_updated: 4, stored_events: 3 },
      { label: 'cal-1 (group)', selected: false, last_sync: null, events_updated: null, stored_events: 0 },
    ]);
    expect(report.panelState).toEqual({ selectedEventId: 'e1' });
  });

  it('redacts calendar IDs and emails in the log; email only in the header', async () => {
    await appendDiagEntry('sw', 'sync', 'error', `sync failed for ${GROUP}`, { cal: 'abc123@g', who: EMAIL, other: 'x@y.org', title: 'Private' });
    const report = await buildDiagnosticsReport({}, db as never);
    expect(report.log).toHaveLength(1);
    expect(report.log[0].msg).toBe('sync failed for cal-1 (group)');
    expect(report.log[0].data).toEqual({ cal: 'cal-1 (group)', who: 'primary', other: 'x***@y.org' });
    const text = JSON.stringify({ ...report, user: undefined });
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('Private');
    expect(text).not.toContain('My Private Cal');
  });
});
