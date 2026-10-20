---
description: Playwright E2E harness gotchas — mocking live Google auth to test the real extension build
paths:
  - e2e/**
  - playwright.config.ts
---

## Running

`npm run test:e2e` — builds `dist/` then runs `playwright test`. Uses Playwright's bundled
Chrome for Testing (not branded Google Chrome), loaded via `chromium.launchPersistentContext`
with `--load-extension`/`--disable-extensions-except`. This works reliably here — unlike
branded Chrome 137+, Chrome for Testing never had `--load-extension` removed. (For live, signed-in
Calendar use the separate `agent:browser` harness / `verify-in-browser` skill instead.)

These tests run entirely offline: no live Google account, no OAuth, no network to Google.
`calendar.google.com` and `googleapis.com/calendar/v3/*` are intercepted via `context.route()`
and served fixtures/mocks instead.

## Seeding an authenticated, synced state without OAuth

Set directly via `chrome.storage.local` / raw `indexedDB` (see `seedExtensionState` in
`e2e/fixtures/harness.ts` for the full shape):
- `chrome.storage.local`: `google_access_token`, `google_user` (JSON string), `google_token_expires_at`
  (future date, or `useAuth.tsx` tries to refresh via `chrome.identity`).
- Monkeypatch `chrome.identity.getAuthToken`/`removeCachedAuthToken` in the **service worker**
  context specifically — patching it on a page's `chrome.identity` doesn't affect the background's
  own object, since each extension context has its own global. The returned token value doesn't
  matter; the actual Calendar API calls are network-mocked regardless of it.

## Gotchas discovered building this harness

**Raw `indexedDB.open('CalendarDB', 2)` from test code races the extension's own schema
init.** On a fresh profile, the DB doesn't exist yet — the extension's own `onupgradeneeded`
(in `src/lib/db/database.ts`) is what creates all the object stores. If test-seeding code opens
the DB first, it creates an empty, schema-less v2 database, and the extension's later `openDB()`
call won't fire `onupgradeneeded` again (version already matches) — so it never gets its stores.
Fix: define the full schema in the test's own `onupgradeneeded` handler too (mirroring
`database.ts`'s `upgrade()` exactly — same store names/keyPaths/indexes), guarded by
`objectStoreNames.contains()` checks so it's a no-op if the extension already created it.

**`chrome.runtime.sendMessage` called from within the background service worker's own
`evaluate()` context does not reach its own `onMessage` listener** — fails with "Could not
establish connection. Receiving end does not exist." A script never receives its own broadcast.
If you need to trigger a message-handled code path from seeding code, either send it from a
different extension context (a page), or replicate the resulting state directly instead.

**Opening `sidepanel.html` as a bare Playwright tab (`context.newPage()` + `.goto()`) instead
of via a real per-tab `chrome.sidePanel.open()` breaks tab-tracking.**
`side-panel-manager.ts`'s `chrome.tabs.onUpdated` listener sees this new tab (URL doesn't include
`calendar.google.com`) reach `"complete"` and broadcasts `CLOSE_SIDE_PANEL` ~100ms later, which
the panel's own listener (`useDateRange.ts`) obeys via `window.close()` — silently killing the
page (and sometimes the whole context) mid-test. Real side panel usage never hits this path
(Chrome attaches the panel to a tab; it isn't a separately-navigable URL). Fix: neutralize it in
the test harness only, before navigating —
```ts
await sidepanelPage.addInitScript(() => { window.close = () => {}; });
```

**Encode realistic calendar IDs in fixture `data-eventid`s.** Real Google abbreviates the
calendar part (`user@gmail.com` → `user@m`, `x@group.calendar.google.com` → `x@g`) while
IndexedDB/the API use the full ID. A fixture encoding `primary` or a full ID skips the
resolution path entirely — that's how the "Event not found" root cause hid behind a passing
E2E test. Seed calendars with full IDs and encode the short form in the DOM.

**Build Google DOM via `e2e/fixtures/gcal-dom.ts`, never inline HTML.** It exports the
builders (`encodeEventId`, `shortCalendarId`, `eventBlockHtml`, `createDialogHtml`,
`detailsPopoverHtml`) and is the single place to update when `docs/google-calendar-dom.md`
changes. Inject their output with `fixtures/calendar.html`'s `window.appendToGrid(html)`.

## Forcing deterministic races

To reproduce timing-dependent bugs (e.g. a sync race) reliably instead of flakily, don't rely on
real wall-clock timing on both sides. Use `context.route()` to hold a mocked network response
for a controlled delay:
```ts
await context.route('https://www.googleapis.com/calendar/v3/calendars/**/events**', async (route) => {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  await route.fulfill({ ... });
});
```
Pick `DELAY_MS` relative to the specific timeout/budget constants in the code under test (e.g.
between an old and new retry-timeout value) to deterministically land on one side of the race
every run.
