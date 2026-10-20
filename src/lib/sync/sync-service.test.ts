import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from './sync-service';
import type { CalendarService } from '../calendar-service';
import type { CalendarDatabase } from '../db/database';

vi.mock('../diag-log', () => ({ diag: vi.fn() }));

/**
 * Regression: targeted incremental sync must resolve the abbreviated calendar
 * IDs Google Calendar puts in `data-eventid`.
 *
 * Google encodes `data-eventid` as base64("<eventId> <calendarId>") but with
 * the calendar's domain abbreviated (observed live 2026-10-13):
 *   - primary calendar `someone@gmail.com`                      -> `someone@m`
 *   - group calendar   `abc123@group.calendar.google.com`       -> `abc123@g`
 * calendar-observer.ts forwards these abbreviated IDs as TRIGGER_SYNC
 * `targetCalendarIds`. Only `@g` was expanded, so a sync targeted at the
 * primary calendar matched nothing, fetched nothing, and still broadcast
 * SYNC_COMPLETE -- leaving the side panel on "Event not found" for a newly
 * created primary-calendar event until the 15-minute alarm sync.
 */

const USER = 'someone@gmail.com';
const PRIMARY_ID = 'someone@gmail.com';
const GROUP_ID = 'abc123@group.calendar.google.com';

function makeCalendar(id: string, summary: string) {
  return { user_email: USER, id, summary, selected: true, accessRole: 'owner', created_at: new Date() };
}

function makeFakeDb() {
  return {
    getUserCalendars: vi.fn().mockResolvedValue([
      makeCalendar(PRIMARY_ID, 'someone@gmail.com'),
      makeCalendar(GROUP_ID, 'Produce'),
    ]),
    // Every calendar has synced before, so the incremental (updatedMin) path runs.
    getUserMetadata: vi.fn().mockResolvedValue({
      value: { last_sync: new Date(Date.now() - 3600_000) },
    }),
    getEvent: vi.fn().mockResolvedValue(undefined),
    createEvent: vi.fn().mockResolvedValue(undefined),
    updateEvent: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    deleteEventTags: vi.fn().mockResolvedValue(undefined),
    batchCreateTags: vi.fn().mockResolvedValue(undefined),
    setUserMetadata: vi.fn().mockResolvedValue(undefined),
  };
}

describe('SyncService.performIncrementalSync targeted at abbreviated calendar IDs', () => {
  let db: ReturnType<typeof makeFakeDb>;
  let calendarService: { getEvents: ReturnType<typeof vi.fn> };
  let service: SyncService;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    db = makeFakeDb();
    calendarService = { getEvents: vi.fn().mockResolvedValue({ items: [] }) };
    service = new SyncService(
      calendarService as unknown as CalendarService,
      db as unknown as CalendarDatabase
    );
  });

  it('syncs the group calendar when targeted as `<id>@g`', async () => {
    await service.performIncrementalSync(USER, ['abc123@g']);

    const syncedIds = calendarService.getEvents.mock.calls.map((c) => c[0]);
    expect(syncedIds).toEqual([GROUP_ID]);
  });

  it('syncs the primary gmail calendar when targeted as `<user>@m`', async () => {
    await service.performIncrementalSync(USER, ['someone@m']);

    const syncedIds = calendarService.getEvents.mock.calls.map((c) => c[0]);
    expect(syncedIds).toEqual([PRIMARY_ID]);
  });

  it('syncs every selected calendar when a target cannot be resolved', async () => {
    await service.performIncrementalSync(USER, ['stranger@m']);

    const syncedIds = calendarService.getEvents.mock.calls.map((c) => c[0]);
    expect(syncedIds.sort()).toEqual([GROUP_ID, PRIMARY_ID].sort());
  });
});

/**
 * Regression: concurrent incremental syncs used a hand-rolled queue that
 * drained only one waiter and ran it without the in-progress flag, so a third
 * concurrent sync never ran (and never broadcast SYNC_COMPLETE).
 */
describe('SyncService.performIncrementalSync concurrency', () => {
  it('runs every concurrent sync, one at a time, in call order', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const db = makeFakeDb();
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];
    const calendarService = {
      getEvents: vi.fn(async (calendarId: string) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        order.push(calendarId);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { items: [] };
      }),
    };
    const service = new SyncService(
      calendarService as unknown as CalendarService,
      db as unknown as CalendarDatabase
    );

    await Promise.all([
      service.performIncrementalSync(USER, ['abc123@g']),
      service.performIncrementalSync(USER, ['someone@m']),
      service.performIncrementalSync(USER, ['abc123@g']),
    ]);

    expect(order).toEqual([GROUP_ID, PRIMARY_ID, GROUP_ID]);
    expect(maxInFlight).toBe(1);
  });

  it('keeps running later syncs after one fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const db = makeFakeDb();
    const calendarService = {
      getEvents: vi.fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue({ items: [] }),
    };
    const service = new SyncService(
      calendarService as unknown as CalendarService,
      db as unknown as CalendarDatabase
    );

    const first = service.performIncrementalSync(USER, ['abc123@g']);
    const second = service.performIncrementalSync(USER, ['someone@m']);

    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBeUndefined();
    expect(calendarService.getEvents).toHaveBeenCalledTimes(2);
  });
});
