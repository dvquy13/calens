import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { seedExtensionState, withExtension } from './fixtures/harness';

const EMAIL = 'e2e-test@gmail.com';
const SUBMIT_URL = '**/submitDiagnostics';
const SCREENSHOT_DIR = 'test-results/diagnostics';

/** The panel's own chrome.identity (not the SW's) yields the token sent with the report. */
async function stubPanelIdentity(context: BrowserContext, sidepanelPage: Page) {
  await context.route('https://www.googleapis.com/oauth2/v3/tokeninfo', (route) => route.fulfill({ json: {} }));
  await sidepanelPage.evaluate(() => {
    (chrome.identity as any).getAuthToken = (_o: unknown, cb: (t?: string) => void) => cb('panel-fake-token');
  });
}

async function openDiagnostics(sidepanelPage: Page) {
  await sidepanelPage.getByRole('button', { name: 'Diagnostics' }).click();
  await expect(sidepanelPage.getByTestId('diagnostics-section')).toBeVisible();
}

test('signed in: Send report posts the report with the note and shows the report ID', async () => {
  await withExtension(async ({ context, sw, openPages }) => {
    let payload: any;
    await context.route(SUBMIT_URL, async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ json: { reportId: 'rpt_abc123' } });
    });
    await seedExtensionState(sw, EMAIL, [{ id: EMAIL, summary: EMAIL, primary: true }]);
    const { sidepanelPage } = await openPages();
    await stubPanelIdentity(context, sidepanelPage);

    await openDiagnostics(sidepanelPage);
    // Summary: one calendar line.
    await expect(sidepanelPage.getByTestId('diagnostics-section').getByText(/1 calendar · last sync /)).toBeVisible();
    await sidepanelPage.getByLabel('What happened?').fill('Event vanished after save');
    await sidepanelPage.getByRole('button', { name: 'Send report' }).click();

    await expect(sidepanelPage.getByText('rpt_abc123')).toBeVisible();
    expect(payload.idToken).toBe('panel-fake-token');
    expect(payload.note).toBe('Event vanished after save');
    expect(payload.report.env.version).toMatch(/^\d/);
    expect(payload.report.user.email).toBe(EMAIL);
    await sidepanelPage.getByTestId('diagnostics-section').screenshot({ path: `${SCREENSHOT_DIR}/signed-in-sent.png` });
  });
});

test('signed in: a discord failure still shows the report ID', async () => {
  await withExtension(async ({ context, sw, openPages }) => {
    await context.route(SUBMIT_URL, (route) => route.fulfill({ json: { reportId: 'rpt_nodiscord', discord: 'failed' } }));
    await seedExtensionState(sw, EMAIL, [{ id: EMAIL, summary: EMAIL, primary: true }]);
    const { sidepanelPage } = await openPages();
    await stubPanelIdentity(context, sidepanelPage);

    await openDiagnostics(sidepanelPage);
    await sidepanelPage.getByRole('button', { name: 'Send report' }).click();
    await expect(sidepanelPage.getByText('rpt_nodiscord')).toBeVisible();
    await expect(sidepanelPage.getByText(/Discord notification failed/)).toBeVisible();
  });
});

test('signed in: the server error message is shown verbatim', async () => {
  await withExtension(async ({ context, sw, openPages }) => {
    await context.route(SUBMIT_URL, (route) =>
      route.fulfill({ status: 429, json: { error: 'Too many reports. Try again in an hour.' } })
    );
    await seedExtensionState(sw, EMAIL, [{ id: EMAIL, summary: EMAIL, primary: true }]);
    const { sidepanelPage } = await openPages();
    await stubPanelIdentity(context, sidepanelPage);

    await openDiagnostics(sidepanelPage);
    await sidepanelPage.getByRole('button', { name: 'Send report' }).click();
    await expect(sidepanelPage.getByRole('alert')).toHaveText('Too many reports. Try again in an hour.');
  });
});

test('signed out: Send is disabled with a hint and Copy still copies the report', async () => {
  await withExtension(async ({ context, openPages }) => {
    const { sidepanelPage } = await openPages();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await openDiagnostics(sidepanelPage);
    await expect(sidepanelPage.getByRole('button', { name: 'Send report' })).toBeDisabled();
    await expect(sidepanelPage.getByText('Sign in to send; use Copy instead.')).toBeVisible();

    await sidepanelPage.getByLabel('What happened?').fill('copy me');
    await sidepanelPage.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(sidepanelPage.getByRole('button', { name: 'Copied!' })).toBeVisible();
    const copied = JSON.parse(await sidepanelPage.evaluate(() => navigator.clipboard.readText()));
    expect(copied.note).toBe('copy me');
    expect(copied.env.version).toMatch(/^\d/);
    expect(Array.isArray(copied.log)).toBe(true);
    await sidepanelPage.getByTestId('diagnostics-section').screenshot({ path: `${SCREENSHOT_DIR}/signed-out.png` });
  });
});

test('an error box "Send report" link opens Diagnostics with the error and selected event in the report', async () => {
  await withExtension(async ({ context, sw, openPages }) => {
    await context.route('https://www.googleapis.com/calendar/v3/calendars/**/events**', (route) =>
      route.fulfill({ json: { items: [] } })
    );
    await seedExtensionState(sw, EMAIL, [{ id: EMAIL, summary: EMAIL, primary: true }]);
    const { calendarPage, sidepanelPage } = await openPages();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Select an event that does not exist anywhere: the panel ends on "Event not found".
    const { encodeEventId, eventBlockHtml } = await import('./fixtures/gcal-dom');
    await calendarPage.evaluate(
      (html) => (window as any).appendToGrid(html),
      eventBlockHtml({ id: 'ghost', encodedEventId: encodeEventId('ghostevent1', 'e2e-test@m'), label: 'Ghost' })
    );
    await calendarPage.click('#ghost');
    await expect(sidepanelPage.getByText('Event not found')).toBeVisible({ timeout: 15_000 });

    await sidepanelPage.getByRole('button', { name: 'Send report' }).first().click();
    await expect(sidepanelPage.getByTestId('diagnostics-section')).toBeVisible();

    await sidepanelPage.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(sidepanelPage.getByRole('button', { name: 'Copied!' })).toBeVisible();
    const copied = JSON.parse(await sidepanelPage.evaluate(() => navigator.clipboard.readText()));
    expect(copied.panelState.currentError).toBe('Event not found');
    expect(copied.panelState.selectedEventId).toBeTruthy();
  });
});
