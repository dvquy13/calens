import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIST_DIR = path.resolve(__dirname, '..', '..', 'dist');
const FIXTURE_URL = 'https://calendar.google.com/calendar/u/0/r';

/** Shared E2E harness: loads the real dist/ build with mocked Google (see .claude/rules/e2e-testing.md). */
export interface Harness {
  context: BrowserContext;
  sw: Worker;
  /** Opens the calendar fixture and the side panel; call after seeding state. */
  openPages: () => Promise<{ calendarPage: Page; sidepanelPage: Page }>;
}

export async function withExtension(run: (harness: Harness) => Promise<void>) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calens-e2e-'));
  const context: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${DIST_DIR}`,
      `--load-extension=${DIST_DIR}`,
    ],
  });

  try {
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = sw.url().split('/')[2];

    // Stand in for calendar.google.com's DOM.
    const fixtureHtml = fs.readFileSync(path.join(__dirname, 'calendar.html'), 'utf-8');
    await context.route('https://calendar.google.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml })
    );

    const openPages = async () => {
      const calendarPage = await context.newPage();
      await calendarPage.goto(FIXTURE_URL);

      const sidepanelPage = await context.newPage();
      // Opening sidepanel.html as a bare tab (instead of a real per-tab side
      // panel attached via chrome.sidePanel.open) makes side-panel-manager.ts
      // see a non-calendar.google.com tab reach "complete" and broadcast
      // CLOSE_SIDE_PANEL, which this page's own listener obeys via
      // window.close(). Real side panel usage never hits this path (Chrome
      // attaches the panel to a tab; it isn't a separately-navigable tab
      // itself), so neutering window.close() here is a test-harness-only
      // shim, not a change to any code under test.
      await sidepanelPage.addInitScript(() => {
        window.close = () => {};
      });
      await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await sidepanelPage.waitForSelector('text=Chat with Founder', { timeout: 15_000 });
      return { calendarPage, sidepanelPage };
    };

    await run({ context, sw, openPages });
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

export interface SeedCalendar {
  id: string;
  summary: string;
  primary?: boolean;
}

export async function seedExtensionState(sw: Worker, email: string, calendars: SeedCalendar[]) {
  await sw.evaluate(
    async ({ email, calendars }) => {
      // Auth: chrome.storage.local
      const farFuture = new Date(Date.now() + 3600_000).toISOString();
      await chrome.storage.local.set({
        google_access_token: 'fake-access-token',
        google_user: JSON.stringify({ email, name: 'E2E Test User' }),
        google_token_expires_at: farFuture,
      });

      // Mock chrome.identity so the background's CalendarService can get
      // *a* token synchronously (the actual value doesn't matter — the
      // Calendar API call itself is network-mocked regardless of it).
      (chrome.identity as any).getAuthToken = (
        _opts: unknown,
        cb: (token?: string) => void
      ) => cb('fake-identity-token');
      (chrome.identity as any).removeCachedAuthToken = (_opts: unknown, cb: () => void) => cb();

      // IndexedDB: the given calendars, all selected and already synced ~1h ago so
      // SyncService._doIncrementalSync takes the incremental (not full-sync)
      // path and actually calls the (mocked) Calendar API.
      //
      // Schema mirrors src/lib/db/database.ts's own upgrade() exactly (same
      // store names/keyPaths/indexes) since this is a fresh profile whose
      // DB has never been opened by the extension's own code yet — we're
      // the ones triggering the onupgradeneeded that creates it.
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open('CalendarDB', 2);
        req.onupgradeneeded = () => {
          const idb = req.result;
          if (!idb.objectStoreNames.contains('calendars')) {
            const s = idb.createObjectStore('calendars', { keyPath: 'id' });
            s.createIndex('user_email', 'user_email', { unique: false });
            s.createIndex('user_calendar', ['user_email', 'id'], { unique: true });
            s.createIndex('selected', 'selected', { unique: false });
          }
          if (!idb.objectStoreNames.contains('events')) {
            const s = idb.createObjectStore('events', { keyPath: 'id' });
            s.createIndex('user_email', 'user_email', { unique: false });
            s.createIndex('user_calendar_start', ['user_email', 'calendar_id', 'start'], { unique: false });
            s.createIndex('user_start', ['user_email', 'start'], { unique: false });
            s.createIndex('calendar_id', 'calendar_id', { unique: false });
            s.createIndex('start', 'start', { unique: false });
          }
          if (!idb.objectStoreNames.contains('metadata')) {
            const s = idb.createObjectStore('metadata', { keyPath: ['user_email', 'key'] });
            s.createIndex('user_email', 'user_email', { unique: false });
            s.createIndex('last_updated', 'last_updated', { unique: false });
          }
          if (!idb.objectStoreNames.contains('tags')) {
            const s = idb.createObjectStore('tags', { keyPath: 'id', autoIncrement: true });
            s.createIndex('user_email', 'user_email', { unique: false });
            s.createIndex('event_id', 'event_id', { unique: false });
            s.createIndex('user_event', ['user_email', 'event_id'], { unique: false });
            s.createIndex('user_tag', ['user_email', 'tag_name'], { unique: false });
            s.createIndex('calendar_id', 'calendar_id', { unique: false });
          }
          if (!idb.objectStoreNames.contains('logged_events')) {
            const s = idb.createObjectStore('logged_events', { keyPath: 'id' });
            s.createIndex('user_email', 'user_email', { unique: false });
          }
          if (!idb.objectStoreNames.contains('time_entries')) {
            const s = idb.createObjectStore('time_entries', { keyPath: 'id', autoIncrement: true });
            s.createIndex('user_email', 'user_email', { unique: false });
          }
          if (!idb.objectStoreNames.contains('analytics_config')) {
            const s = idb.createObjectStore('analytics_config', { keyPath: ['user_email', 'id'] });
            s.createIndex('user_email', 'user_email', { unique: false });
          }
          if (!idb.objectStoreNames.contains('analytics_cache')) {
            const s = idb.createObjectStore('analytics_cache', { keyPath: ['user_email', 'cache_key'] });
            s.createIndex('user_email', 'user_email', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['calendars', 'metadata'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

        for (const cal of calendars) {
          tx.objectStore('calendars').put({
            user_email: email,
            id: cal.id,
            summary: cal.summary,
            primary: cal.primary ?? false,
            selected: true,
            accessRole: 'owner',
            created_at: new Date(),
          });

          tx.objectStore('metadata').put({
            user_email: email,
            key: `last_sync_${cal.id}`,
            value: {
              calendar_id: cal.id,
              calendar_name: cal.summary,
              events_updated: 0,
              last_sync: new Date(Date.now() - 3600_000).toISOString(),
            },
            last_updated: new Date(),
            data_version: 1,
          });
        }
      });

      db.close();
    },
    { email, calendars }
  );
}
