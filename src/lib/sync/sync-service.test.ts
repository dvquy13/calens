import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from './sync-service';
import { SyncTokenExpiredError, type CalendarService } from '../calendar-service';
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
    // Every calendar has synced before, so the incremental (syncToken) path runs.
    getUserMetadata: vi.fn().mockResolvedValue({
      value: { last_sync: new Date(Date.now() - 3600_000), sync_token: 'stored-token' },
    }),
    createCalendar: vi.fn().mockResolvedValue(undefined),
    batchCreateEvents: vi.fn().mockResolvedValue(undefined),
    getCalendarEvents: vi.fn().mockResolvedValue([]),
    deleteTagsForEvents: vi.fn().mockResolvedValue(undefined),
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

/**
 * Regression: moving an event to another calendar keeps its ID. The old
 * calendar's incremental run returns a `cancelled` tombstone for that ID, and
 * deleting by ID wiped the copy the new calendar had just stored.
 */
function makeStoringDb(calendars: ReturnType<typeof makeCalendar>[]) {
  const events = new Map<string, { id: string; calendar_id: string }>();
  return {
    events,
    getUserCalendars: vi.fn().mockResolvedValue(calendars),
    getUserMetadata: vi.fn().mockResolvedValue({
      value: { last_sync: new Date(Date.now() - 3600_000), sync_token: 'stored-token' },
    }),
    createCalendar: vi.fn().mockResolvedValue(undefined),
    getCalendarEvents: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn(async (id: string) => events.get(id)),
    createEvent: vi.fn(async (e: { id: string; calendar_id: string }) => { events.set(e.id, e); }),
    updateEvent: vi.fn(async (e: { id: string; calendar_id: string }) => { events.set(e.id, e); }),
    deleteEvent: vi.fn(async (id: string) => { events.delete(id); }),
    deleteEventTags: vi.fn().mockResolvedValue(undefined),
    deleteTagsForEvents: vi.fn().mockResolvedValue(undefined),
    batchCreateTags: vi.fn().mockResolvedValue(undefined),
    setUserMetadata: vi.fn().mockResolvedValue(undefined),
  };
}

const MOVED_ID = 'moved-event-1';

function googleEvent(id: string, status: string) {
  return {
    id,
    status,
    summary: 'Moved',
    start: { dateTime: '2026-10-28T10:00:00Z' },
    end: { dateTime: '2026-10-28T11:00:00Z' },
    created: '2026-10-01T00:00:00Z',
    updated: '2026-10-28T09:00:00Z',
  };
}

describe('SyncService.performIncrementalSync moved events', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('keeps an event moved to another calendar when the old calendar sends a cancelled tombstone', async () => {
    // Group calendar first, so its confirmed copy is stored before the primary's tombstone.
    const db = makeStoringDb([makeCalendar(GROUP_ID, 'Produce'), makeCalendar(PRIMARY_ID, 'someone@gmail.com')]);
    const calendarService = {
      getCalendars: vi.fn().mockResolvedValue([
        { id: GROUP_ID, summary: 'Produce', selected: true },
        { id: PRIMARY_ID, summary: 'someone@gmail.com', selected: true },
      ]),
      getEvents: vi.fn(async (calendarId: string) =>
        calendarId === GROUP_ID
          ? { items: [googleEvent(MOVED_ID, 'confirmed')] }
          : { items: [googleEvent(MOVED_ID, 'cancelled')] }
      ),
    };
    const service = new SyncService(
      calendarService as unknown as CalendarService,
      db as unknown as CalendarDatabase
    );

    await service.performIncrementalSync(USER);

    expect(db.events.get(MOVED_ID)?.calendar_id).toBe(GROUP_ID);
    expect(db.deleteEvent).not.toHaveBeenCalled();
    // One call comes from the confirmed upsert (delete old tags, insert new); the tombstone adds none.
    expect(db.deleteEventTags).toHaveBeenCalledTimes(1);
  });

  it('still deletes a cancelled event that is stored in the calendar that cancelled it', async () => {
    const db = makeStoringDb([makeCalendar(PRIMARY_ID, 'someone@gmail.com')]);
    db.events.set(MOVED_ID, { id: MOVED_ID, calendar_id: PRIMARY_ID });
    const calendarService = {
      getCalendars: vi.fn().mockResolvedValue([{ id: PRIMARY_ID, summary: 'someone@gmail.com', selected: true }]),
      getEvents: vi.fn().mockResolvedValue({ items: [googleEvent(MOVED_ID, 'cancelled')] }),
    };
    const service = new SyncService(
      calendarService as unknown as CalendarService,
      db as unknown as CalendarDatabase
    );

    await service.performIncrementalSync(USER);

    expect(db.events.has(MOVED_ID)).toBe(false);
    expect(db.deleteEvent).toHaveBeenCalledWith(MOVED_ID);
    expect(db.deleteEventTags).toHaveBeenCalledWith(MOVED_ID);
  });
});

/**
 * Regression: performInitialSync bypassed syncChain, so it could interleave with
 * an incremental sync that was already running.
 */
describe('SyncService initial and incremental syncs', () => {
  it('runs an initial sync and a following incremental sync one at a time', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const db = {
      ...makeStoringDb([makeCalendar(PRIMARY_ID, 'someone@gmail.com')]),
      batchCreateCalendars: vi.fn().mockResolvedValue(undefined),
      batchCreateEvents: vi.fn().mockResolvedValue(undefined),
    };
    let inFlight = 0;
    let maxInFlight = 0;
    const track = async <T,>(value: T): Promise<T> => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return value;
    };
    const calendarService = {
      getCalendars: vi.fn(() => track([{ id: PRIMARY_ID, summary: 'someone@gmail.com', primary: true, selected: true }])),
      getEvents: vi.fn((_calendarId: string) => track({ items: [] })),
    };
    const service = new SyncService(
      calendarService as unknown as CalendarService,
      db as unknown as CalendarDatabase
    );

    await Promise.all([
      service.performInitialSync(USER),
      service.performIncrementalSync(USER),
    ]);

    // The initial sync lists calendars and full-syncs one; the untargeted incremental
    // sync lists them again and token-syncs it.
    expect(calendarService.getCalendars).toHaveBeenCalledTimes(2);
    expect(calendarService.getEvents).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
  });
});

/**
 * Regression: the tags store auto-increments its IDs, and the initial sync only
 * appended tags. Every re-run (sign-in, the resync after an update) added another
 * copy, and aggregateByTag counted the event's hours once per copy.
 */
describe('SyncService.performInitialSync tags', () => {
  it('keeps one tag row per event and tag across repeated initial syncs', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const tags: { event_id: string; tag_name: string }[] = [];
    const db = {
      ...makeStoringDb([makeCalendar(PRIMARY_ID, 'someone@gmail.com')]),
      batchCreateCalendars: vi.fn().mockResolvedValue(undefined),
      batchCreateEvents: vi.fn().mockResolvedValue(undefined),
      batchCreateTags: vi.fn(async (rows: { event_id: string; tag_name: string }[]) => { tags.push(...rows); }),
      deleteTagsForEvents: vi.fn(async (eventIds: string[]) => {
        for (let i = tags.length - 1; i >= 0; i--) if (eventIds.includes(tags[i].event_id)) tags.splice(i, 1);
      }),
    };
    const tagged = { ...googleEvent('tagged-1', 'confirmed'), description: '---\ntags: work, deep\n---\nNotes' };
    const calendarService = {
      getCalendars: vi.fn().mockResolvedValue([{ id: PRIMARY_ID, summary: 'someone@gmail.com', primary: true }]),
      getEvents: vi.fn().mockResolvedValue({ items: [tagged] }),
    };
    const service = new SyncService(
      calendarService as unknown as CalendarService,
      db as unknown as CalendarDatabase
    );

    await service.performInitialSync(USER);
    await service.performInitialSync(USER);

    expect(tags.map(t => t.tag_name).sort()).toEqual(['deep', 'work']);
  });
});

/**
 * Incremental sync runs on the calendar's sync token. A calendar without one (new,
 * or upgraded from the updatedMin scheme) or whose token expired gets a full sync.
 */
function makeMemoryDb(calendars: ReturnType<typeof makeCalendar>[], tokens: Record<string, string> = {}) {
  const metadata = new Map<string, any>(
    Object.entries(tokens).map(([id, sync_token]) => [`last_sync_${id}`, { last_sync: new Date(), sync_token }])
  );
  const events = new Map<string, any>();
  return {
    events,
    metadata,
    calendars,
    getUserCalendars: vi.fn(async () => calendars),
    getUserMetadata: vi.fn(async (_u: string, key: string) => (metadata.has(key) ? { value: metadata.get(key) } : undefined)),
    setUserMetadata: vi.fn(async (_u: string, key: string, value: unknown) => { metadata.set(key, value); }),
    createCalendar: vi.fn(async (c: ReturnType<typeof makeCalendar>) => {
      if (!calendars.some(x => x.id === c.id)) calendars.push(c);
    }),
    updateCalendar: vi.fn().mockResolvedValue(undefined),
    batchCreateEvents: vi.fn(async (rows: any[]) => { rows.forEach(r => events.set(r.id, r)); }),
    getCalendarEvents: vi.fn(async (_u: string, calendarId: string) =>
      [...events.values()].filter(e => e.calendar_id === calendarId)),
    getEvent: vi.fn(async (id: string) => events.get(id)),
    createEvent: vi.fn(async (e: any) => { events.set(e.id, e); }),
    updateEvent: vi.fn(async (e: any) => { events.set(e.id, e); }),
    deleteEvent: vi.fn(async (id: string) => { events.delete(id); }),
    deleteEventTags: vi.fn().mockResolvedValue(undefined),
    deleteTagsForEvents: vi.fn().mockResolvedValue(undefined),
    batchCreateTags: vi.fn().mockResolvedValue(undefined),
  };
}

function liveEvent(id: string) {
  return { ...googleEvent(id, 'confirmed'), start: { dateTime: new Date(Date.now() - 86_400_000).toISOString() }, end: { dateTime: new Date().toISOString() } };
}

describe('SyncService.performIncrementalSync sync tokens', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  function setup(db: ReturnType<typeof makeMemoryDb>, getEvents: ReturnType<typeof vi.fn>, getCalendars = vi.fn()) {
    const calendarService = { getEvents, getCalendars };
    const service = new SyncService(
      calendarService as unknown as CalendarService,
      db as unknown as CalendarDatabase
    );
    return { service, calendarService };
  }

  it('runs a windowed full sync when the calendar has no token, and stores the token it returns', async () => {
    const db = makeMemoryDb([makeCalendar(PRIMARY_ID, 'someone@gmail.com')]);
    const getEvents = vi.fn().mockResolvedValue({ items: [liveEvent('e1')], nextSyncToken: 'tok-1' });
    const { service } = setup(db, getEvents);

    await service.performIncrementalSync(USER, ['someone@m']);

    expect(getEvents).toHaveBeenCalledTimes(1);
    const params = getEvents.mock.calls[0][1];
    expect(params.syncToken).toBeUndefined();
    expect(params.timeMin).toBeDefined();
    expect(params.timeMax).toBeDefined();
    expect(db.events.has('e1')).toBe(true);
    expect(db.metadata.get(`last_sync_${PRIMARY_ID}`).sync_token).toBe('tok-1');
  });

  it('fetches with the stored token and stores the next one', async () => {
    const db = makeMemoryDb([makeCalendar(PRIMARY_ID, 'someone@gmail.com')], { [PRIMARY_ID]: 'tok-old' });
    const getEvents = vi.fn().mockResolvedValue({ items: [liveEvent('e2')], nextSyncToken: 'tok-new' });
    const { service } = setup(db, getEvents);

    await service.performIncrementalSync(USER, ['someone@m']);

    expect(getEvents).toHaveBeenCalledTimes(1);
    const params = getEvents.mock.calls[0][1];
    expect(params.syncToken).toBe('tok-old');
    for (const name of ['timeMin', 'timeMax', 'updatedMin', 'orderBy']) expect(params[name]).toBeUndefined();
    expect(db.events.has('e2')).toBe(true);
    expect(db.metadata.get(`last_sync_${PRIMARY_ID}`).sync_token).toBe('tok-new');
  });

  it('falls back to a full sync with a fresh token when the stored token expired', async () => {
    const db = makeMemoryDb([makeCalendar(PRIMARY_ID, 'someone@gmail.com')], { [PRIMARY_ID]: 'tok-stale' });
    const getEvents = vi.fn()
      .mockRejectedValueOnce(new SyncTokenExpiredError(PRIMARY_ID))
      .mockResolvedValueOnce({ items: [liveEvent('e3')], nextSyncToken: 'tok-fresh' });
    const { service } = setup(db, getEvents);

    await service.performIncrementalSync(USER, ['someone@m']);

    expect(getEvents).toHaveBeenCalledTimes(2);
    expect(getEvents.mock.calls[0][1].syncToken).toBe('tok-stale');
    expect(getEvents.mock.calls[1][1].syncToken).toBeUndefined();
    expect(getEvents.mock.calls[1][1].timeMin).toBeDefined();
    expect(db.events.has('e3')).toBe(true);
    expect(db.metadata.get(`last_sync_${PRIMARY_ID}`).sync_token).toBe('tok-fresh');
  });

  it('propagates errors other than an expired token', async () => {
    const db = makeMemoryDb([makeCalendar(PRIMARY_ID, 'someone@gmail.com')], { [PRIMARY_ID]: 'tok' });
    const { service } = setup(db, vi.fn().mockRejectedValue(new Error('boom')));

    await expect(service.performIncrementalSync(USER, ['someone@m'])).rejects.toThrow('boom');
    expect(db.metadata.get(`last_sync_${PRIMARY_ID}`).sync_token).toBe('tok');
  });

  it('full-syncs a newly selected calendar on an untargeted sync', async () => {
    const NEW_ID = 'fresh@group.calendar.google.com';
    const db = makeMemoryDb([makeCalendar(PRIMARY_ID, 'someone@gmail.com')], { [PRIMARY_ID]: 'tok-p' });
    const getEvents = vi.fn(async (_id: string, params: { syncToken?: string; timeMin?: string }) =>
      ({ items: [], nextSyncToken: params.syncToken ? 'tok-next' : 'tok-first' }));
    const getCalendars = vi.fn().mockResolvedValue([
      { id: PRIMARY_ID, summary: 'someone@gmail.com', selected: true },
      { id: NEW_ID, summary: 'Fresh', selected: true },
    ]);
    const { service } = setup(db, getEvents, getCalendars);

    await service.performIncrementalSync(USER);

    const newCalendarCalls = getEvents.mock.calls.filter(c => c[0] === NEW_ID);
    expect(newCalendarCalls[0][1].timeMin).toBeDefined();
    expect(newCalendarCalls[0][1].syncToken).toBeUndefined();
    expect(db.metadata.get(`last_sync_${NEW_ID}`).sync_token).toBeDefined();
    const primaryCalls = getEvents.mock.calls.filter(c => c[0] === PRIMARY_ID);
    expect(primaryCalls).toHaveLength(1);
    expect(primaryCalls[0][1].syncToken).toBe('tok-p');
  });

  it('does not list calendars on a targeted sync', async () => {
    const db = makeMemoryDb([makeCalendar(PRIMARY_ID, 'someone@gmail.com')], { [PRIMARY_ID]: 'tok-p' });
    const getCalendars = vi.fn();
    const { service } = setup(db, vi.fn().mockResolvedValue({ items: [], nextSyncToken: 'tok-n' }), getCalendars);

    await service.performIncrementalSync(USER, ['someone@m']);

    expect(getCalendars).not.toHaveBeenCalled();
  });
});
