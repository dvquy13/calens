import { test, expect } from '@playwright/test';
import { seedExtensionState, withExtension } from './fixtures/harness';
import { encodeEventId, eventBlockHtml } from './fixtures/gcal-dom';

/**
 * End-to-end diagnostics trace for an "Event not found" selection: the report
 * fetched via GET_DIAGNOSTICS_REPORT must contain the select/fetch/sync trail
 * across content, service worker, and panel contexts, and must leak neither
 * event titles nor raw calendar IDs (only `report.user.email` may be an email).
 */

const EMAIL = 'zed.e2e@gmail.com';
const EMAIL_SHORT = 'zed.e2e@m';
const GROUP_ID = 'secretgroup99@group.calendar.google.com';
const GROUP_SHORT = 'secretgroup99@g';
const SECRET_TITLE = 'Zebra Quarterly Secret Sync';
const SECRET_CALENDAR_NAME = 'Zebra Private Calendar';

test('a not-found selection leaves a select/fetch/sync trail with no titles or calendar IDs', async () => {
  await withExtension(async ({ context, sw, openPages }) => {
    // Calendars return an unrelated, distinctively titled event; the clicked one exists nowhere.
    await context.route('https://www.googleapis.com/calendar/v3/calendars/**/events**', (route) =>
      route.fulfill({
        json: {
          items: [{
            id: 'otherevent1',
            summary: SECRET_TITLE,
            description: SECRET_TITLE,
            status: 'confirmed',
            start: { dateTime: new Date().toISOString() },
            end: { dateTime: new Date(Date.now() + 3600_000).toISOString() },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            etag: '"1"',
            sequence: 0,
          }],
        },
      })
    );
    await seedExtensionState(sw, EMAIL, [
      { id: EMAIL, summary: EMAIL, primary: true },
      { id: GROUP_ID, summary: SECRET_CALENDAR_NAME },
    ]);
    const { calendarPage, sidepanelPage } = await openPages();

    // The clicked block carries the secret title in its DOM label, as real Google markup would.
    await calendarPage.evaluate(
      (html) => (window as any).appendToGrid(html),
      eventBlockHtml({ id: 'ghost', encodedEventId: encodeEventId('ghostevent1', GROUP_SHORT), label: SECRET_TITLE })
    );
    await calendarPage.click('#ghost');
    await expect(sidepanelPage.getByText('Event not found')).toBeVisible({ timeout: 15_000 });

    const fetchReport = () =>
      sidepanelPage.evaluate(async () => {
        const res = await chrome.runtime.sendMessage({
          type: 'GET_DIAGNOSTICS_REPORT',
          panelState: { selectedEventId: 'ghostevent1', currentError: 'Event not found' },
        });
        if (!res?.success) throw new Error(res?.error ?? 'report failed');
        return res.data;
      });

    const has = (report: any, ctx: string, cat: string, msg: RegExp) =>
      report.log.some((e: any) => e.ctx === ctx && e.cat === cat && msg.test(e.msg));

    await expect
      .poll(async () => {
        const r = await fetchReport();
        return [
          has(r, 'content', 'select', /event selected/),
          has(r, 'sw', 'select', /EVENT_SELECTED/),
          has(r, 'panel', 'fetch', /event miss/),
          has(r, 'sw', 'sync', /sync start/),
          has(r, 'sw', 'sync', /sync complete/),
        ];
      }, { timeout: 15_000 })
      .toEqual([true, true, true, true, true]);

    const report = await fetchReport();

    // Calendars appear as labels.
    const labels = report.calendars.map((c: any) => c.label);
    expect(labels).toContain('primary');
    expect(labels.some((l: string) => /^cal-\d+ \(group\)$/.test(l))).toBe(true);

    // Nothing sensitive anywhere in the report, apart from the signed-in user's email.
    expect(report.user.email).toBe(EMAIL);
    const json = JSON.stringify({ ...report, user: { email: null } });
    for (const secret of [SECRET_TITLE, 'Zebra', SECRET_CALENDAR_NAME, EMAIL, EMAIL_SHORT, GROUP_ID, GROUP_SHORT, 'secretgroup99']) {
      expect(json, `report leaks "${secret}"`).not.toContain(secret);
    }
  });
});
