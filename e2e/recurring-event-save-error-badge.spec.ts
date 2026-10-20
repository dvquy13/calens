import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { encodeEventId, eventBlockHtml } from './fixtures/gcal-dom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Regression test for a real bug report (screenshot showed this exact toast
 * text after clicking "Yes" on Google's recurring-event confirmation
 * dialog): a click on Google's own "Yes"/OK button must reach Google
 * unmolested, and must never trigger our drag/resize machinery just because
 * it happens to land over some unrelated event tile's top edge underneath.
 *
 * Root cause: drag-handler.ts's document-level `mousedown` listener (capture
 * phase, registered in event-enhancer.ts's initDragHandlers) hit-tests the
 * click point with `findEventElementAtPoint` (event-hit-tester.ts), which
 * deliberately walks *underneath* whatever's on top via
 * `document.elementsFromPoint` -- intentional, so top-edge resize still
 * works when an event is partially obscured.
 *
 * Google's recurring-event confirmation dialog ("This event" / "This and
 * following events" / "All events") is a portal centered over the day/week
 * grid. Its "Yes"/OK button often lands within 10px of some *other* event
 * tile's top edge on the grid underneath (busy calendars especially --
 * narrow/compact tiles are common). When it does:
 *
 *   1. initDrag() runs synchronously on mousedown (drag-handler.ts:70-99).
 *      It reads that unrelated tile's `.gVNoLb` time element and calls
 *      extractStartTime() on it. If the text doesn't match the parser's
 *      expected format, initDrag fires showErrorToast() IMMEDIATELY --
 *      no drag or API round-trip needed.
 *   2. initDrag does NOT return early after that failure -- it still calls
 *      preventDefault()/stopPropagation() on the mousedown (hijacking
 *      Google's own button) and registers the mouseup handler.
 *   3. That mouseup handler (drag-handler.ts:134-153) unconditionally
 *      preventDefault()/stopPropagation()s the mouseup and arms a
 *      document-wide, one-shot `click` blocker -- which swallows the very
 *      click Google's "Yes" button needed to actually confirm the edit.
 *
 * Net effect today: the user's click looks like it landed, but the edit
 * never saves, and our error toast appears in its place. This test asserts
 * the CORRECT behavior -- it currently FAILS against the unfixed code, and
 * should pass once the drag-handler is fixed to only act on genuine event
 * targets.
 */

const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const FIXTURE_URL = 'https://calendar.google.com/calendar/u/0/r';
// A tile whose time text Google renders in a compact form once the day is
// busy enough to narrow event columns -- doesn't match any of
// extractStartTime()'s three regexes (all require a spaced en-dash "–").
const UNRELATED_EVENT_ENCODED = encodeEventId('unrelatedevent', 'user@m');
const UNPARSEABLE_TIME_TEXT = '10:30-11a';

test('clicking "Yes" on the recurring-event dialog over an unrelated tile reaches Google and does not fire the error toast', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calens-e2e-'));
  const context: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${DIST_DIR}`,
      `--load-extension=${DIST_DIR}`,
    ],
  });

  try {
    const fixtureHtml = fs.readFileSync(path.join(__dirname, 'fixtures', 'calendar.html'), 'utf-8');
    await context.route('https://calendar.google.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml })
    );

    const calendarPage = await context.newPage();
    await calendarPage.goto(FIXTURE_URL);

    // --- Build the reproduction geometry ---
    // A real event tile (data-eventid, absolutely positioned) whose time
    // label uses Google's compact/narrow-column format, plus Google's own
    // "Yes" confirmation button rendered as an overlay directly over that
    // tile's top edge -- mirroring the recurring-event dialog appearing
    // centered over a busy grid.
    const yesButtonPoint = await calendarPage.evaluate(({ tileHtml }) => {
      const grid = document.getElementById('calendar-grid')!;

      grid.insertAdjacentHTML('beforeend', tileHtml);

      // Google's native "Yes" button on the recurring-event dialog,
      // portal-rendered on top of the grid, overlapping the tile's top edge.
      const yesButton = document.createElement('div');
      yesButton.id = 'native-yes-button';
      yesButton.setAttribute('role', 'button');
      yesButton.textContent = 'Yes';
      yesButton.style.cssText = 'position:absolute; left:210px; top:298px; width:60px; height:16px; background:white; z-index:999;';
      yesButton.addEventListener('click', () => { (yesButton as any)._clicked = true; });
      document.body.appendChild(yesButton);

      const rect = yesButton.getBoundingClientRect();
      // Inside the button, and within the tile's top-edge resize zone
      // (tile top is 300px, threshold is 10px).
      return { x: rect.left + rect.width / 2, y: rect.top + 5 };
    }, {
      tileHtml: eventBlockHtml({
        encodedEventId: UNRELATED_EVENT_ENCODED,
        label: `<div class="gVNoLb">${UNPARSEABLE_TIME_TEXT}</div>`,
        style: 'position:absolute; left:200px; top:300px; width:120px; height:80px; background:#4285f4;',
      }),
    });

    // --- A plain click: no drag distance needed, the failure is synchronous
    //     inside initDrag() on mousedown itself. ---
    await calendarPage.mouse.move(yesButtonPoint.x, yesButtonPoint.y);
    await calendarPage.mouse.down();
    await calendarPage.mouse.up();

    // --- Assert: Google's own "Yes" button DOES get its click -- the edit
    //     actually saves. ---
    await expect
      .poll(() => calendarPage.evaluate(() => (document.getElementById('native-yes-button') as any)._clicked === true))
      .toBe(true);

    // --- Assert: no error toast fires against the unrelated tile ---
    await calendarPage.waitForTimeout(1_000);
    await expect(
      calendarPage.locator('.pca-toast-title', { hasText: 'Event update failed' })
    ).not.toBeVisible();
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
