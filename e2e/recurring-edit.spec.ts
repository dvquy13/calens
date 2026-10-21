import { test, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { seedExtensionState, withExtension } from './fixtures/harness';
import { encodeEventId, eventBlockHtml } from './fixtures/gcal-dom';

/**
 * Recurring-event editing end-to-end: side-panel scope control (cases 1-5) and
 * the drag scope picker (cases 6-7). Google's Calendar API is replaced by an
 * in-memory fake (below) that mirrors the live facts in
 * docs/google-calendar-dom.md "Recurring events": instance IDs are
 * `<seriesId>_<UTC start>`, a master PATCH overwrites every occurrence's
 * description, a split cuts the old series with UNTIL and the removed
 * occurrences come back as `cancelled`. Every write is recorded so the tests
 * assert on the exact method, path and body the extension sent.
 */

const CAL = 'e2e-test@gmail.com';
const CAL_SHORT = 'e2e-test@m';
const SUMMARY = 'Weekly sync';
const SERIES_ID = 'recseries0001';
const OCCURRENCE_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HORIZON_WEEKS = 8;
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/**';
const EVENTS_PATH = `/calendar/v3/calendars/${CAL}/events`;

type AppendWindow = Window & { appendToGrid: (html: string) => void };

// Loose JSON for Calendar API payloads: the fake reads and writes arbitrary Google fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

interface RecordedRequest {
  method: string;
  /** Decoded pathname, e.g. /calendar/v3/calendars/<cal>/events/<id> */
  path: string;
  query: Record<string, string>;
  body: Json | undefined;
}

/** In-memory Calendar API. Masters, instances and single events are stored by ID. */
class FakeCalendarApi {
  readonly requests: RecordedRequest[] = [];
  private readonly events = new Map<string, Json>();
  private seq = 0;

  async install(context: BrowserContext) {
    await context.route(CALENDAR_API, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const body = request.postData() ? (JSON.parse(request.postData()!) as Json) : undefined;
      const query = Object.fromEntries(url.searchParams.entries());
      this.requests.push({ method: request.method(), path: decodeURIComponent(url.pathname), query, body });

      const { status, json } = this.handle(request.method(), decodeURIComponent(url.pathname), query, body);
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    });
  }

  /** Writes only (GET/list excluded), in request order. */
  writes(): RecordedRequest[] {
    return this.requests.filter((r) => r.method !== 'GET');
  }

  /** Current stored state of one event, for checking what the API now holds. */
  stored(id: string): Json | undefined {
    return this.events.get(id);
  }

  /** Adds a weekly series whose master starts at `start` (ms). `overrides` edits single occurrences by index. */
  seedWeeklySeries(opts: { start: number; overrides?: Record<number, Json> }) {
    const master: Json = {
      id: SERIES_ID,
      summary: SUMMARY,
      status: 'confirmed',
      start: { dateTime: iso(opts.start) },
      end: { dateTime: iso(opts.start + OCCURRENCE_MS) },
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
      organizer: { email: CAL, self: true },
      created: iso(opts.start - WEEK_MS),
      updated: iso(opts.start - WEEK_MS),
      etag: '"1"',
      sequence: 0,
    };
    this.events.set(SERIES_ID, master);
    this.generateInstances(master);
    for (const [index, patch] of Object.entries(opts.overrides ?? {})) {
      const instance = this.events.get(instanceId(SERIES_ID, opts.start + Number(index) * WEEK_MS))!;
      Object.assign(instance, patch);
    }
  }

  /** Adds a non-recurring event. */
  seedSingle(id: string, start: number) {
    this.events.set(id, {
      id,
      summary: 'Standalone',
      status: 'confirmed',
      start: { dateTime: iso(start) },
      end: { dateTime: iso(start + OCCURRENCE_MS) },
      organizer: { email: CAL, self: true },
      created: iso(start),
      updated: iso(start),
      etag: '"1"',
      sequence: 0,
    });
  }

  private handle(method: string, path: string, query: Record<string, string>, body: Json | undefined): { status: number; json: Json } {
    const rest = path.startsWith(EVENTS_PATH) ? path.slice(EVENTS_PATH.length) : null;
    if (rest === null) return notFound();

    if (method === 'POST' && rest === '') return { status: 200, json: this.insert(body!) };
    if (method === 'GET' && rest === '') return { status: 200, json: { items: this.listSingleEvents() } };

    const [, eventId, sub] = rest.split('/');
    const event = this.events.get(eventId);
    if (!event) return notFound();

    if (sub === 'instances' && method === 'GET') {
      return { status: 200, json: { items: this.instancesOf(eventId, query) } };
    }
    if (sub === undefined && method === 'GET') return { status: 200, json: event };
    if (sub === undefined && method === 'PATCH') return { status: 200, json: this.patch(event, body!) };
    return notFound();
  }

  /** Like `events.list?singleEvents=true`: expanded instances and single events, cancelled ones included; masters are not returned. */
  private listSingleEvents(): Json[] {
    return [...this.events.values()].filter((e) => !e.recurrence);
  }

  private instancesOf(seriesId: string, query: Record<string, string>): Json[] {
    const timeMin = query.timeMin ? Date.parse(query.timeMin) : -Infinity;
    const timeMax = query.timeMax ? Date.parse(query.timeMax) : Infinity;
    const showDeleted = query.showDeleted === 'true';
    const items = [...this.events.values()]
      .filter((e) => e.recurringEventId === seriesId)
      .filter((e) => showDeleted || e.status !== 'cancelled')
      .filter((e) => {
        const start = Date.parse(e.start.dateTime);
        return start >= timeMin && start < timeMax;
      })
      .sort((a, b) => Date.parse(a.start.dateTime) - Date.parse(b.start.dateTime));
    return query.maxResults ? items.slice(0, Number(query.maxResults)) : items;
  }

  private insert(body: Json): Json {
    const id = `newseries${++this.seq}`;
    const master: Json = {
      ...body,
      id,
      status: 'confirmed',
      organizer: { email: CAL, self: true },
      created: iso(Date.now()),
      updated: iso(Date.now()),
      etag: `"${this.seq}"`,
      sequence: 0,
    };
    this.events.set(id, master);
    if (master.recurrence) this.generateInstances(master);
    return master;
  }

  private patch(event: Json, body: Json): Json {
    const oldStart = event.start?.dateTime ? Date.parse(event.start.dateTime) : undefined;
    Object.assign(event, body);
    event.updated = iso(Date.now());

    if (!event.recurrence) return event;

    // A master PATCH overwrites the touched field on every occurrence (exceptions included).
    const occurrences = [...this.events.values()].filter((e) => e.recurringEventId === event.id && e.status !== 'cancelled');
    if (body.start && oldStart !== undefined) {
      const delta = Date.parse(body.start.dateTime) - oldStart;
      for (const occurrence of occurrences) {
        occurrence.start = { dateTime: iso(Date.parse(occurrence.start.dateTime) + delta) };
        occurrence.end = { dateTime: iso(Date.parse(occurrence.end.dateTime) + delta) };
      }
    }
    for (const [key, value] of Object.entries(body)) {
      if (['start', 'end', 'recurrence'].includes(key)) continue;
      for (const occurrence of occurrences) occurrence[key] = value;
    }
    if (body.recurrence) this.generateInstances(event);
    return event;
  }

  /** Creates the occurrences the master's rule produces; occurrences the rule no longer produces are cancelled. */
  private generateInstances(master: Json) {
    const starts = occurrenceStarts(master);
    const wanted = new Set(starts.map((t) => instanceId(master.id, t)));
    for (const e of this.events.values()) {
      if (e.recurringEventId === master.id && !wanted.has(e.id)) e.status = 'cancelled';
    }
    const durationMs = Date.parse(master.end.dateTime) - Date.parse(master.start.dateTime);
    for (const t of starts) {
      const id = instanceId(master.id, t);
      const existing = this.events.get(id);
      if (existing) {
        existing.status = 'confirmed';
        continue;
      }
      this.events.set(id, {
        id,
        recurringEventId: master.id,
        originalStartTime: { dateTime: iso(t) },
        summary: master.summary,
        location: master.location,
        description: master.description,
        status: 'confirmed',
        start: { dateTime: iso(t) },
        end: { dateTime: iso(t + durationMs) },
        organizer: master.organizer,
        created: master.created,
        updated: master.updated,
        etag: '"1"',
        sequence: 0,
      });
    }
  }
}

function notFound(): { status: number; json: Json } {
  return { status: 404, json: { error: { code: 404, message: 'Not Found' } } };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** RRULE/UTC compact form used by Google: 20261102T085959Z. */
function compactUtc(ms: number): string {
  return iso(ms).replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function instanceId(seriesId: string, startMs: number): string {
  return `${seriesId}_${compactUtc(startMs)}`;
}

/** Start times the weekly master produces, honoring UNTIL/COUNT and a fixed horizon. */
function occurrenceStarts(master: Json): number[] {
  const rule = Object.fromEntries(
    (master.recurrence as string[])
      .find((line) => line.startsWith('RRULE:'))!
      .slice('RRULE:'.length)
      .split(';')
      .map((part) => part.split('=') as [string, string])
  );
  const first = Date.parse(master.start.dateTime);
  const until = rule.UNTIL
    ? Date.parse(rule.UNTIL.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'))
    : Infinity;
  const count = rule.COUNT ? Number(rule.COUNT) : HORIZON_WEEKS;
  const starts: number[] = [];
  for (let i = 0; i < count && i < HORIZON_WEEKS; i++) {
    const t = first + i * WEEK_MS;
    if (t > until) break;
    starts.push(t);
  }
  return starts;
}

/** Monday 09:00 UTC of the current week; occurrences are weekly from here, inside the sync window. */
function thisMonday9amUtc(): number {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysSinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  return midnight - daysSinceMonday * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000;
}

const SERIES_START = thisMonday9amUtc();
const occurrenceStart = (index: number) => SERIES_START + index * WEEK_MS;
const occurrenceId = (index: number) => instanceId(SERIES_ID, occurrenceStart(index));
const seriesPath = `${EVENTS_PATH}/${SERIES_ID}`;
const instancePath = (id: string) => `${EVENTS_PATH}/${id}`;

/** Google's own tile label format (parsed by time-parser.ts): spaced en dash. */
const TILE_TIME = '9:00 AM – 10:00 AM';
/** Google puts the time text in `.gVNoLb`; the drag handler reads it from there. */
const TILE_LABEL = `<div class="gVNoLb">${TILE_TIME}</div>`;

/** Renders one occurrence as a clickable tile (id `occ-<index>`). */
async function renderOccurrences(calendarPage: Page, count: number) {
  for (let index = 0; index < count; index++) {
    await calendarPage.evaluate(
      (html) => (window as AppendWindow).appendToGrid(html),
      eventBlockHtml({ id: `occ-${index}`, encodedEventId: encodeEventId(occurrenceId(index), CAL_SHORT), label: TILE_LABEL })
    );
  }
}

/** Selects an occurrence from the calendar and waits until the side panel shows the series. */
async function selectOccurrence(calendarPage: Page, sidepanel: Page, index: number) {
  await calendarPage.click(`#occ-${index}`);
  await expect(sidepanel.getByText(SUMMARY).first()).toBeVisible({ timeout: 15_000 });
  await expect(sidepanel.getByRole('group', { name: 'Apply edits to' })).toBeVisible();
}

/** Types a new location in the side panel and blurs the field, which triggers autosave. */
async function editLocation(sidepanel: Page, location: string) {
  const field = sidepanel.locator('#location');
  await expect(field).toBeEnabled();
  await field.fill(location);
  await field.press('Tab');
}

async function chooseScope(sidepanel: Page, label: string) {
  const button = sidepanel.getByRole('group', { name: 'Apply edits to' }).getByRole('button', { name: label });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** Presses a tile's top edge and drags it down by `deltaY` px (12px = 15 minutes at 48px/hour). */
async function dragTopEdge(calendarPage: Page, tileId: string, deltaY: number) {
  const box = await calendarPage.locator(`#${tileId}`).boundingBox();
  if (!box) throw new Error(`tile #${tileId} has no bounding box`);
  const x = box.x + box.width / 2;
  await calendarPage.mouse.move(x, box.y + 3);
  await calendarPage.mouse.down();
  await calendarPage.mouse.move(x, box.y + 3 + deltaY, { steps: 4 });
  await calendarPage.mouse.up();
}

/** Seeds the mock + extension state, then runs the test body with both pages open. */
async function withSeries(
  api: FakeCalendarApi,
  run: (h: { calendarPage: Page; sidepanel: Page; sw: Worker }) => Promise<void>,
  seed: () => void
) {
  await withExtension(async ({ context, sw, openPages }) => {
    await api.install(context);
    seed();
    await seedExtensionState(sw, CAL, [{ id: CAL, summary: CAL, primary: true }]);
    const { calendarPage, sidepanelPage } = await openPages();
    await run({ calendarPage, sidepanel: sidepanelPage, sw });
  });
}

test('1. selecting a recurring tile shows the scope control and no "not supported" notice', async () => {
  const api = new FakeCalendarApi();
  await withSeries(
    api,
    async ({ calendarPage, sidepanel }) => {
      await renderOccurrences(calendarPage, 3);
      await selectOccurrence(calendarPage, sidepanel, 0);

      const group = sidepanel.getByRole('group', { name: 'Apply edits to' });
      await expect(group.getByRole('button', { name: 'This event' })).toHaveAttribute('aria-pressed', 'true');
      await expect(group.getByRole('button', { name: 'This and following' })).toBeVisible();
      await expect(group.getByRole('button', { name: 'All events' })).toBeVisible();
      await expect(sidepanel.getByText('Editing recurring events is not supported yet.')).toHaveCount(0);
    },
    () => api.seedWeeklySeries({ start: SERIES_START })
  );
});

test('2. location edit with "This event" PATCHes only the instance', async () => {
  const api = new FakeCalendarApi();
  await withSeries(
    api,
    async ({ calendarPage, sidepanel }) => {
      await renderOccurrences(calendarPage, 3);
      await selectOccurrence(calendarPage, sidepanel, 1);

      await editLocation(sidepanel, 'Room 4');

      await expect.poll(() => api.writes().length).toBe(1);
      expect(api.writes()).toEqual([
        { method: 'PATCH', path: instancePath(occurrenceId(1)), query: {}, body: { location: 'Room 4' } },
      ]);
      expect(api.stored(occurrenceId(1))?.location).toBe('Room 4');
      expect(api.stored(occurrenceId(0))?.location).toBeUndefined();
    },
    () => api.seedWeeklySeries({ start: SERIES_START })
  );
});

test('3. location edit with "All events" GETs and PATCHes the master', async () => {
  const api = new FakeCalendarApi();
  await withSeries(
    api,
    async ({ calendarPage, sidepanel }) => {
      await renderOccurrences(calendarPage, 3);
      await selectOccurrence(calendarPage, sidepanel, 1);
      await chooseScope(sidepanel, 'All events');

      await editLocation(sidepanel, 'Room 4');

      await expect.poll(() => api.writes().length).toBe(1);
      expect(api.requests).toContainEqual(expect.objectContaining({ method: 'GET', path: seriesPath }));
      expect(api.writes()).toEqual([{ method: 'PATCH', path: seriesPath, query: {}, body: { location: 'Room 4' } }]);
      // Google overwrites the field on every occurrence that does not override it.
      expect(api.stored(occurrenceId(2))?.location).toBe('Room 4');
    },
    () => api.seedWeeklySeries({ start: SERIES_START })
  );
});

test('4. "This and following" on the 3rd occurrence cuts the old series with UNTIL and inserts the new one', async () => {
  const api = new FakeCalendarApi();
  await withSeries(
    api,
    async ({ calendarPage, sidepanel }) => {
      await renderOccurrences(calendarPage, 5);
      await selectOccurrence(calendarPage, sidepanel, 2);
      await chooseScope(sidepanel, 'This and following');

      await editLocation(sidepanel, 'Room 4');

      const splitAt = occurrenceStart(2);
      const untilCompact = compactUtc(splitAt - 1000);
      await expect.poll(() => api.writes().length).toBe(2);
      expect(api.writes()).toEqual([
        {
          method: 'PATCH',
          path: seriesPath,
          query: {},
          body: { recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=${untilCompact}`] },
        },
        {
          method: 'POST',
          path: EVENTS_PATH,
          query: {},
          body: expect.objectContaining({
            summary: SUMMARY,
            location: 'Room 4',
            start: { dateTime: iso(splitAt) },
            recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
          }),
        },
      ]);
      // Occurrences from the split point on are cancelled on the old series.
      expect(api.stored(occurrenceId(2))?.status).toBe('cancelled');
      expect(api.stored(occurrenceId(1))?.status).toBe('confirmed');
    },
    () => api.seedWeeklySeries({ start: SERIES_START })
  );
});

test('5. tags write to the series and restore a per-occurrence note', async () => {
  const api = new FakeCalendarApi();
  const NOTE = 'Bring slides';
  await withSeries(
    api,
    async ({ calendarPage, sidepanel }) => {
      await renderOccurrences(calendarPage, 3);
      await selectOccurrence(calendarPage, sidepanel, 0);

      const tags = sidepanel.locator('#tags');
      await expect(tags).toBeEnabled();
      await tags.fill('focus');
      await tags.press('Tab');

      // Master first (its description PATCH overwrites every occurrence), then the exception gets its note back.
      await expect.poll(() => api.writes().length).toBe(2);
      const [masterWrite, restoreWrite] = api.writes();
      expect(masterWrite).toMatchObject({ method: 'PATCH', path: seriesPath });
      expect(masterWrite.body!.description).toMatch(/tags: focus/);
      expect(masterWrite.body!.description).not.toContain(NOTE);
      expect(restoreWrite).toMatchObject({ method: 'PATCH', path: instancePath(occurrenceId(1)) });
      expect(restoreWrite.body!.description).toContain(NOTE);
      expect(restoreWrite.body!.description).toMatch(/tags: focus/);
      expect(api.stored(occurrenceId(1))?.description).toBe(restoreWrite.body!.description);
    },
    () =>
      api.seedWeeklySeries({
        start: SERIES_START,
        overrides: { 1: { description: NOTE } },
      })
  );
});

test('6. dragging a recurring tile asks for a scope: Cancel reverts with no write, "All events" moves the master', async () => {
  const api = new FakeCalendarApi();
  await withSeries(
    api,
    async ({ calendarPage }) => {
      await renderOccurrences(calendarPage, 3);
      // Give the tile a real height so the top-edge zone is well defined.
      await calendarPage.evaluate(() => {
        const tile = document.getElementById('occ-1') as HTMLElement;
        tile.style.top = '300px';
        tile.style.left = '200px';
        tile.style.position = 'absolute';
        tile.style.width = '120px';
        tile.style.height = '80px';
      });
      const picker = calendarPage.getByRole('dialog', { name: 'Edit recurring event' });

      // Drag, then Cancel: the tile goes back to its original top and nothing is written.
      await dragTopEdge(calendarPage, 'occ-1', 12);
      await expect(picker).toBeVisible({ timeout: 15_000 });
      await picker.getByRole('button', { name: 'Cancel' }).click();
      await expect(picker).toHaveCount(0);
      await expect(calendarPage.locator('#occ-1')).toHaveCSS('top', '300px');
      await expect(calendarPage.locator('#occ-1')).not.toHaveAttribute('data-pca-pending');
      expect(api.writes()).toEqual([]);

      // Drag again, choose "All events".
      await dragTopEdge(calendarPage, 'occ-1', 12);
      await expect(picker).toBeVisible({ timeout: 15_000 });
      await picker.getByRole('radio', { name: 'All events' }).click();
      await picker.getByRole('button', { name: 'OK' }).click();

      // "All events" shifts the master's own start, not the dragged occurrence's.
      const movedStart = iso(SERIES_START + 15 * 60 * 1000);
      await expect.poll(() => api.writes().length).toBe(1);
      expect(api.writes()).toEqual([
        {
          method: 'PATCH',
          path: seriesPath,
          query: {},
          body: { start: { dateTime: movedStart } },
        },
      ]);
    },
    () => api.seedWeeklySeries({ start: SERIES_START })
  );
});

test('7. dragging a non-recurring tile writes straight to the event, with no scope picker', async () => {
  const api = new FakeCalendarApi();
  const SINGLE_ID = 'singleevent01';
  const SINGLE_START = SERIES_START + 3 * 24 * 60 * 60 * 1000;
  await withSeries(
    api,
    async ({ calendarPage }) => {
      await calendarPage.evaluate(
        (html) => (window as AppendWindow).appendToGrid(html),
        eventBlockHtml({
          id: 'single-tile',
          encodedEventId: encodeEventId(SINGLE_ID, CAL_SHORT),
          label: TILE_LABEL,
          style: 'position:absolute; left:200px; top:300px; width:120px; height:80px; background:#4285f4;',
        })
      );

      await dragTopEdge(calendarPage, 'single-tile', 12);

      await expect.poll(() => api.writes().length).toBe(1);
      expect(api.writes()).toEqual([
        {
          method: 'PATCH',
          path: instancePath(SINGLE_ID),
          query: {},
          body: { start: { dateTime: iso(SINGLE_START + 15 * 60 * 1000) } },
        },
      ]);
      await expect(calendarPage.getByRole('dialog', { name: 'Edit recurring event' })).toHaveCount(0);
    },
    () => {
      api.seedWeeklySeries({ start: SERIES_START });
      api.seedSingle(SINGLE_ID, SINGLE_START);
    }
  );
});
