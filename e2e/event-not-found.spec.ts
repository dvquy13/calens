import { test, expect, type Page } from '@playwright/test';
import { seedExtensionState, withExtension } from './fixtures/harness';
import { createDialogHtml, detailsPopoverHtml, encodeEventId, eventBlockHtml } from './fixtures/gcal-dom';

/**
 * Reproduces "Untitled Event / Event not found" end-to-end through the
 * extension's real production code (content scripts, background service
 * worker, SyncService, fetchWithSyncRetry) — everything except Google's own
 * servers, which are replaced with controlled fixtures/mocks so each scenario
 * is deterministic and needs no live Google account.
 */

const EVENTS_API_URL = 'https://www.googleapis.com/calendar/v3/calendars/**/events**';
const NEW_EVENT_TITLE = 'New Event Title';
// data-eventid abbreviates the calendar part: `<user>@gmail.com` -> `<user>@m` (see gcal-dom.ts).
const PRIMARY_EMAIL = 'e2e-test@gmail.com';
const PRIMARY_SHORT_ID = 'e2e-test@m';

function googleEvent(id: string, summary = NEW_EVENT_TITLE) {
  return {
    id,
    summary,
    status: 'confirmed',
    start: { dateTime: new Date().toISOString() },
    end: { dateTime: new Date(Date.now() + 3600_000).toISOString() },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    etag: '"1"',
    sequence: 0,
  };
}

/**
 * Scenario: a new event's DOM node appears (calendar-observer.ts's mutation
 * debounce schedules a real TRIGGER_SYNC ~1s later), the user clicks it
 * immediately (EVENT_SELECTED fires at t=0), and the mocked Calendar API
 * response for that sync is held back until well past the old 3s retry
 * budget but within the new 8s budget.
 */
test('side panel shows the event once its delayed sync completes, not "Event not found"', async () => {
  const NEW_EVENT_ID = 'newevent123';
  const EVENTS_API_DELAY_MS = 4500; // between the old 3s budget and the new 8s budget

  await withExtension(async ({ context, sw, openPages }) => {
    await context.route(EVENTS_API_URL, async (route) => {
      await new Promise((r) => setTimeout(r, EVENTS_API_DELAY_MS));
      await route.fulfill({ json: { items: [googleEvent(NEW_EVENT_ID)] } });
    });
    await seedExtensionState(sw, PRIMARY_EMAIL, [{ id: PRIMARY_EMAIL, summary: PRIMARY_EMAIL, primary: true }]);
    const { calendarPage, sidepanelPage } = await openPages();

    // New event appears in the DOM, user clicks it right away.
    await appendToGrid(calendarPage, eventBlockHtml({ id: 'new-event-node', encodedEventId: encodeEventId(NEW_EVENT_ID, PRIMARY_SHORT_ID), label: 'New Event' }));
    await calendarPage.click('#new-event-node');

    await expect(sidepanelPage.getByText(NEW_EVENT_TITLE)).toBeVisible({ timeout: 8_000 });
    await expect(sidepanelPage.getByText('Event not found')).not.toBeVisible();
  });
});

/**
 * Scenario: the sync that brings in a newly clicked event lands after the
 * side panel's retry budget has run out. The panel shows "Event not found",
 * but must replace it with the event once that later sync completes instead
 * of staying stuck until the user reselects.
 */
test('side panel recovers from "Event not found" when the event syncs after the retry budget', async () => {
  const NEW_EVENT_ID = 'slowevent789';
  const EVENTS_API_DELAY_MS = 10_000; // past useEventData's 8s retry budget

  await withExtension(async ({ context, sw, openPages }) => {
    await context.route(EVENTS_API_URL, async (route) => {
      await new Promise((r) => setTimeout(r, EVENTS_API_DELAY_MS));
      await route.fulfill({ json: { items: [googleEvent(NEW_EVENT_ID)] } });
    });
    await seedExtensionState(sw, PRIMARY_EMAIL, [{ id: PRIMARY_EMAIL, summary: PRIMARY_EMAIL, primary: true }]);
    const { calendarPage, sidepanelPage } = await openPages();

    await appendToGrid(calendarPage, eventBlockHtml({ id: 'new-event-node', encodedEventId: encodeEventId(NEW_EVENT_ID, PRIMARY_SHORT_ID), label: 'New Event' }));
    await calendarPage.click('#new-event-node');

    await expect(sidepanelPage.getByText('Event not found')).toBeVisible({ timeout: 10_000 });
    await expect(sidepanelPage.getByText(NEW_EVENT_TITLE)).toBeVisible({ timeout: 10_000 });
    await expect(sidepanelPage.getByText('Event not found')).not.toBeVisible();
  });
});

/**
 * Scenario reproduced live on 2026-10-13 (quick-create, switch calendar,
 * Save). Google's `data-eventid` abbreviates calendar IDs:
 * `user@gmail.com` -> `user@m`, `x@group.calendar.google.com` -> `x@g`.
 *
 *   1. Click an empty slot: a draft block and the Create dialog render, both
 *      tagged with the primary calendar (`user@m`).
 *   2. Switch the draft's calendar to Produce: the block re-renders as `…@g`.
 *   3. Click Save.
 *   4. Google removes the dialog, still tagged `user@m` — the last mutation
 *      inside calendar-observer's 1s debounce window. The block is still on
 *      the grid, so Calens selects the event (side panel starts loading).
 *
 * The follow-up sync must still fetch the Produce calendar, where the event
 * actually lives, and the side panel must show it.
 */
test('new event saved to a secondary calendar from a draft shows in the side panel', async () => {
  const EMAIL = 'calens.e2e@gmail.com';
  const PRODUCE_ID = 'produce123@group.calendar.google.com';
  const NEW_EVENT_ID = 'draftevent456';

  await withExtension(async ({ context, sw, openPages }) => {
    // The new event exists only on the Produce calendar.
    await context.route(EVENTS_API_URL, async (route) => {
      const onProduce = route.request().url().includes(`/calendars/${encodeURIComponent(PRODUCE_ID)}/`);
      await route.fulfill({ json: { items: onProduce ? [googleEvent(NEW_EVENT_ID)] : [] } });
    });
    await seedExtensionState(sw, EMAIL, [
      { id: EMAIL, summary: EMAIL, primary: true },
      { id: PRODUCE_ID, summary: 'Produce' },
    ]);
    const { calendarPage, sidepanelPage } = await openPages();

    const onPrimary = encodeEventId(NEW_EVENT_ID, 'calens.e2e@m');
    const onProduce = encodeEventId(NEW_EVENT_ID, 'produce123@g');

    // 1. Draft block + Create dialog, both on the primary calendar.
    await openCreateDialog(calendarPage, onPrimary);
    await calendarPage.waitForTimeout(1500); // let the draft's own debounced sync fire

    // 2. Switch the draft to Produce.
    await calendarPage.evaluate((id) => {
      document.getElementById('draft-block')!.setAttribute('data-eventid', id);
    }, onProduce);

    // 3. Click Save, 4. Google closes the dialog.
    await calendarPage.click('#save');
    await calendarPage.waitForTimeout(300);
    await calendarPage.evaluate(() => document.getElementById('create-dialog')!.remove());

    await expect(sidepanelPage.getByText(NEW_EVENT_TITLE)).toBeVisible({ timeout: 10_000 });
    await expect(sidepanelPage.getByText('Event not found')).not.toBeVisible();
  });
});

/**
 * Slow drafting, reproduced live on 2026-10-13. Google's Create dialog (like
 * the event details popover) carries the event's `data-eventid` inside
 * `[role="dialog"]`. Clicks there — the title field, or the draft block
 * itself — used to select the unsaved draft, so after the 8s retry budget the
 * side panel showed "Event not found" while the user was still drafting.
 *
 * Drafting must leave the side panel alone; on Save, Google closes the dialog
 * with the event block still on the grid, and the panel then shows the event.
 */
test('slow drafting never shows "Event not found"; saving shows the new event', async () => {
  const NEW_EVENT_ID = 'slowdraft321';

  await withExtension(async ({ context, sw, openPages }) => {
    // Like Google's server: the event doesn't exist until it's saved.
    let saved = false;
    await context.route(EVENTS_API_URL, (route) =>
      route.fulfill({ json: { items: saved ? [googleEvent(NEW_EVENT_ID)] : [] } })
    );
    await seedExtensionState(sw, PRIMARY_EMAIL, [{ id: PRIMARY_EMAIL, summary: PRIMARY_EMAIL, primary: true }]);
    const { calendarPage, sidepanelPage } = await openPages();

    await openCreateDialog(calendarPage, encodeEventId(NEW_EVENT_ID, PRIMARY_SHORT_ID));

    // Click into the title and the draft block, then keep drafting past the retry budget.
    await calendarPage.click('#title');
    await calendarPage.click('#draft-block');
    await calendarPage.waitForTimeout(9_000);
    await expect(sidepanelPage.getByText('Event not found')).not.toBeVisible();

    // Save: the event now exists server-side; Google closes the dialog and the block stays.
    saved = true;
    await calendarPage.click('#save');
    await calendarPage.waitForTimeout(300);
    await calendarPage.evaluate(() => document.getElementById('create-dialog')!.remove());

    await expect(sidepanelPage.getByText(NEW_EVENT_TITLE)).toBeVisible({ timeout: 8_000 });
    await expect(sidepanelPage.getByText('Event not found')).not.toBeVisible();
  });
});

/**
 * Discarding a draft: Google removes the draft block first, then the dialog
 * (observed live). Nothing was saved, so the side panel must not select it.
 */
test('discarding a draft leaves the side panel alone', async () => {
  const NEW_EVENT_ID = 'discarded654';

  await withExtension(async ({ context, sw, openPages }) => {
    await context.route(EVENTS_API_URL, (route) => route.fulfill({ json: { items: [] } }));
    await seedExtensionState(sw, PRIMARY_EMAIL, [{ id: PRIMARY_EMAIL, summary: PRIMARY_EMAIL, primary: true }]);
    const { calendarPage, sidepanelPage } = await openPages();

    await openCreateDialog(calendarPage, encodeEventId(NEW_EVENT_ID, PRIMARY_SHORT_ID));
    await calendarPage.click('#title');

    await calendarPage.evaluate(() => document.getElementById('draft-block')!.remove());
    await calendarPage.waitForTimeout(300);
    await calendarPage.evaluate(() => document.getElementById('create-dialog')!.remove());

    await calendarPage.waitForTimeout(9_000);
    await expect(sidepanelPage.getByText('Event not found')).not.toBeVisible();
    await expect(sidepanelPage.getByText('Untitled Event')).not.toBeVisible();
  });
});

/**
 * Regression guard for deferred selection. Google opens or retargets its
 * event details popover during the click itself (observed live), so by the
 * time Calens's click handler runs, the clicked event already "has a dialog".
 * Clicking another event while a popover is open must still select it right
 * away, not once the popover closes.
 */
test('clicking another event while a details popover is open selects it immediately', async () => {
  await withExtension(async ({ context, sw, openPages }) => {
    await context.route(EVENTS_API_URL, (route) =>
      route.fulfill({ json: { items: [googleEvent('eventa111', 'Event A'), googleEvent('eventb222', 'Event B')] } })
    );
    await seedExtensionState(sw, PRIMARY_EMAIL, [{ id: PRIMARY_EMAIL, summary: PRIMARY_EMAIL, primary: true }]);
    const { calendarPage, sidepanelPage } = await openPages();

    const idA = encodeEventId('eventa111', PRIMARY_SHORT_ID);
    const idB = encodeEventId('eventb222', PRIMARY_SHORT_ID);
    await appendToGrid(calendarPage, eventBlockHtml({ id: 'block-a', encodedEventId: idA, label: 'A' }));
    await appendToGrid(calendarPage, eventBlockHtml({ id: 'block-b', encodedEventId: idB, label: 'B' }));
    // Stand-in for Google: pressing an event block opens (or retargets) its details popover.
    await calendarPage.evaluate((popovers) => {
      document.addEventListener('mousedown', (e) => {
        const block = (e.target as Element).closest('#calendar-grid [data-eventid]');
        if (!block) return;
        document.getElementById('popover')?.remove();
        document.body.insertAdjacentHTML('beforeend', popovers[block.getAttribute('data-eventid')!]);
      });
    }, {
      [idA]: detailsPopoverHtml({ encodedEventId: idA }),
      [idB]: detailsPopoverHtml({ encodedEventId: idB }),
    });
    await calendarPage.waitForTimeout(2500); // let the observer's sync store both events

    await calendarPage.click('#block-a');
    await expect(sidepanelPage.getByText('Event A')).toBeVisible({ timeout: 5_000 });

    await calendarPage.click('#block-b'); // popover stays open (now for B)
    await expect(sidepanelPage.getByText('Event B')).toBeVisible({ timeout: 3_000 });
  });
});

/** Appends builder-made Google markup (see fixtures/gcal-dom.ts) to the fixture's day-column gridcell. */
async function appendToGrid(calendarPage: Page, html: string) {
  await calendarPage.evaluate((h) => (window as any).appendToGrid(h), html);
}

/** Renders a draft block on the grid plus Google's Create dialog for it (the dialog is a portal on body). */
async function openCreateDialog(calendarPage: Page, encodedEventId: string) {
  await appendToGrid(calendarPage, eventBlockHtml({ id: 'draft-block', encodedEventId, label: '(No title)' }));
  await calendarPage.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), createDialogHtml({ encodedEventId }));
}
