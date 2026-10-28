import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncCalendarFull, syncWindow } from './calendar-reconciler';
import type { CalendarService } from '../calendar-service';
import type { CalendarDatabase } from '../db/database';
import type { CalendarStore } from '@/types/database';

vi.mock('../diag-log', () => ({ diag: vi.fn() }));

const USER = 'someone@gmail.com';
const CAL = 'abc123@group.calendar.google.com';
const OTHER_CAL = 'other@group.calendar.google.com';

const calendar: CalendarStore = {
  user_email: USER, id: CAL, summary: 'Produce', primary: false, selected: true, accessRole: 'owner', created_at: new Date(),
};

const DAY = 86_400_000;

function googleEvent(id: string, start: Date, description?: string) {
  return {
    id,
    status: 'confirmed',
    summary: 'Event',
    description,
    start: { dateTime: start.toISOString() },
    end: { dateTime: new Date(start.getTime() + 3600_000).toISOString() },
    created: '2026-10-01T00:00:00Z',
    updated: '2026-10-28T09:00:00Z',
  };
}

/** In-memory stand-in for the slice of CalendarDatabase a full sync touches. */
function makeMemoryDb() {
  type Row = { id: string; calendar_id: string; start: Date };
  const events = new Map<string, Row>();
  const tags: { event_id: string; tag_name: string }[] = [];
  const metadata = new Map<string, any>();
  return {
    events,
    tags,
    metadata,
    createCalendar: vi.fn().mockResolvedValue(undefined),
    batchCreateEvents: vi.fn(async (rows: Row[]) => { rows.forEach(r => events.set(r.id, r)); }),
    getCalendarEvents: vi.fn(async (_u: string, calendarId: string) =>
      [...events.values()].filter(e => e.calendar_id === calendarId)),
    deleteEvent: vi.fn(async (id: string) => { events.delete(id); }),
    deleteTagsForEvents: vi.fn(async (ids: string[]) => {
      for (let i = tags.length - 1; i >= 0; i--) if (ids.includes(tags[i].event_id)) tags.splice(i, 1);
    }),
    batchCreateTags: vi.fn(async (rows: { event_id: string; tag_name: string }[]) => { tags.push(...rows); }),
    setUserMetadata: vi.fn(async (_u: string, key: string, value: unknown) => { metadata.set(key, value); }),
  };
}

describe('syncWindow', () => {
  it('spans one calendar year back and ahead', () => {
    const { timeMin, timeMax } = syncWindow(new Date(2026, 9, 28));
    expect(timeMin).toEqual(new Date(2025, 9, 28));
    expect(timeMax).toEqual(new Date(2027, 9, 28));
  });
});

describe('syncCalendarFull', () => {
  let db: ReturnType<typeof makeMemoryDb>;
  let getEvents: ReturnType<typeof vi.fn>;
  let service: CalendarService;

  const run = () => syncCalendarFull(USER, calendar, service, db as unknown as CalendarDatabase);

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    db = makeMemoryDb();
    getEvents = vi.fn();
    service = { getEvents } as unknown as CalendarService;
  });

  it('prunes in-window rows Google did not return, with their tags, and keeps everything else', async () => {
    const inWindow = new Date(Date.now() - 30 * DAY);
    const outOfWindow = new Date(Date.now() - 3 * 365 * DAY);
    db.events.set('gone', { id: 'gone', calendar_id: CAL, start: inWindow });
    db.events.set('old', { id: 'old', calendar_id: CAL, start: outOfWindow });
    db.events.set('moved', { id: 'moved', calendar_id: OTHER_CAL, start: inWindow });
    db.tags.push({ event_id: 'gone', tag_name: 'stale' }, { event_id: 'old', tag_name: 'keep' });
    getEvents.mockResolvedValue({ items: [googleEvent('kept', inWindow)], nextSyncToken: 'tok' });

    const stored = await run();

    expect(stored).toBe(1);
    expect([...db.events.keys()].sort()).toEqual(['kept', 'moved', 'old']);
    expect(db.tags).toEqual([{ event_id: 'old', tag_name: 'keep' }]);
  });

  it('keeps a row of the same id that now belongs to another calendar', async () => {
    const start = new Date(Date.now() - 30 * DAY);
    // Moved here from OTHER_CAL: Google returns it for this calendar, the old row is overwritten.
    db.events.set('moved', { id: 'moved', calendar_id: OTHER_CAL, start });
    getEvents.mockResolvedValue({ items: [googleEvent('moved', start)], nextSyncToken: 'tok' });
    await run();
    expect(db.events.get('moved')?.calendar_id).toBe(CAL);

    // Moved away from here: this calendar no longer returns it, the other calendar's row stays.
    db.events.set('left', { id: 'left', calendar_id: OTHER_CAL, start });
    await run();
    expect(db.events.has('left')).toBe(true);
    expect(db.deleteEvent).not.toHaveBeenCalledWith('left');
  });

  it('keeps one tag row per event and tag across repeated full syncs', async () => {
    const tagged = googleEvent('tagged', new Date(Date.now() - DAY), '---\ntags: work, deep\n---\nNotes');
    getEvents.mockResolvedValue({ items: [tagged], nextSyncToken: 'tok' });

    await run();
    await run();

    expect(db.tags.map(t => t.tag_name).sort()).toEqual(['deep', 'work']);
  });

  it('requests the sync window and stores the sync token', async () => {
    getEvents.mockResolvedValue({ items: [], nextSyncToken: 'tok-1' });

    await run();

    const params = getEvents.mock.calls[0][1];
    const { timeMin, timeMax } = syncWindow();
    expect(params).toMatchObject({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      maxResults: 2500,
    });
    expect(db.metadata.get(`last_sync_${CAL}`)).toMatchObject({ calendar_id: CAL, sync_token: 'tok-1' });
  });

  it('stores no sync token when Google returned none', async () => {
    getEvents.mockResolvedValue({ items: [] });

    await run();

    expect(db.metadata.get(`last_sync_${CAL}`).sync_token).toBeUndefined();
  });
});
