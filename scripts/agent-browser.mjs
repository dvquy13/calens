#!/usr/bin/env node
/**
 * Agent browser harness: a dedicated, human-signed-in Google Chrome profile that an
 * agent drives over a fixed CDP port to verify Calens against live Google Calendar.
 *
 * Why this works where Playwright/Puppeteer-launched Chrome doesn't (see
 * docs/patterns-and-decisions.md, "Agent browser harness"):
 *   - Chrome is started by us with a FIXED --remote-debugging-port, never via
 *     --remote-debugging-pipe / port 0, so navigator.webdriver stays false.
 *   - No --use-mock-keychain, so cookies written during the human sign-in decrypt fine.
 *   - Branded Chrome ignores --load-extension (137+); we load dist/ with CDP
 *     Extensions.loadUnpacked, which needs --enable-unsafe-extension-debugging.
 *
 * Usage: npm run agent:browser -- <command> [args]   (see `help`)
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'test-results', 'agent-browser');
const PORT = Number(process.env.CALENS_AGENT_CDP_PORT ?? 9333);
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const PROFILE = process.env.CALENS_AGENT_PROFILE ?? path.join(os.homedir(), '.calens-agent-chrome');
const CHROME = process.env.CALENS_AGENT_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r';
const EXT_ID = extensionIdFromKey(JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.json'), 'utf8')).key);
const PANEL_URL = `chrome-extension://${EXT_ID}/sidepanel.html`;
// Chrome sign-in (needed for chrome.identity) also turns on account sync for every data type, which pulls the
// human's extensions/passwords/history into this profile and would push changes made here back to their other
// profiles. --disable-sync keeps the sync engine off; the browser-level sign-in still issues tokens.
const CHROME_BASE_ARGS = [`--user-data-dir=${PROFILE}`, '--disable-sync', '--no-first-run', '--no-default-browser-check'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class HarnessError extends Error {}

/** Chrome derives an unpacked extension's ID from the manifest `key`: sha256 → first 32 hex → a-p. */
function extensionIdFromKey(key) {
  const hex = crypto.createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

async function isUp() {
  try {
    return (await fetch(`${ENDPOINT}/json/version`)).ok;
  } catch {
    return false;
  }
}

async function waitUntil(fn, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  throw new HarnessError(`Timed out after ${timeoutMs}ms waiting for ${what}`);
}

/**
 * Resolves once the page's viewport size has not changed for `quietMs`. Opening or closing the side panel
 * animates the tab's width over ~400ms (1470 -> 956px, ~20 resize events); Google Calendar re-lays-out the grid
 * on each one and dismisses a quick-create dialog that is open meanwhile, so clicks must wait for it to finish.
 */
async function waitForStableViewport(page, { quietMs = 500, timeoutMs = 10000 } = {}) {
  const size = () => page.evaluate(() => `${innerWidth}x${innerHeight}`);
  let last = await size();
  let since = Date.now();
  return waitUntil(
    async () => {
      const now = await size();
      if (now !== last) [last, since] = [now, Date.now()];
      return Date.now() - since >= quietMs && now;
    },
    timeoutMs,
    `the Calendar viewport to stop resizing (side panel open/close animation; last size ${last})`
  );
}

/** Chrome's SingletonLock is a symlink to "<hostname>-<pid>"; a crash can leave it stale. */
function profileLockedByOtherChrome() {
  let target;
  try {
    target = fs.readlinkSync(path.join(PROFILE, 'SingletonLock'));
  } catch {
    return false;
  }
  try {
    process.kill(Number(target.slice(target.lastIndexOf('-') + 1)), 0);
    return true;
  } catch {
    return false;
  }
}

const RECOVERY_STEPS =
  'Recovery: navigate any tab to https://calendar.google.com (MCP browser_navigate), then run ' +
  '`npm run agent:browser -- launch`, then `reload`.';

async function pageTargets() {
  const list = await (await fetch(`${ENDPOINT}/json/list`)).json();
  return list.filter((t) => t.type === 'page');
}

/**
 * Chrome sometimes ends up with no Calendar tab (only about:blank / browser_ui targets), and then
 * connectOverCDP fails with "Browser context management is not supported". Opening a Calendar tab first avoids it.
 */
async function ensureCalendarTarget() {
  const isCalendar = (t) => /^https:\/\/(calendar\.google\.com|workspace\.google\.com\/.*calendar)/.test(t.url);
  if ((await pageTargets()).some(isCalendar)) return;
  console.error('[harness] no Calendar tab found, opening one');
  await fetch(`${ENDPOINT}/json/new?${CALENDAR_URL}`, { method: 'PUT' });
  await waitUntil(async () => (await pageTargets()).some(isCalendar), 10000, 'a Calendar tab to open');
}

/** Connects to the running harness Chrome. Callers must `browser.close()` (disconnects only). */
async function connect({ heal = true } = {}) {
  if (!(await isUp())) {
    throw new HarnessError(`No harness Chrome on ${ENDPOINT}. Run: npm run agent:browser -- launch`);
  }
  try {
    if (heal) await ensureCalendarTarget();
    const browser = await chromium.connectOverCDP(ENDPOINT);
    const context = browser.contexts()[0];
    const cdp = await browser.newBrowserCDPSession();
    return { browser, context, cdp };
  } catch (err) {
    throw new HarnessError(`Could not connect to harness Chrome over CDP: ${err.message}\n${RECOVERY_STEPS}`);
  }
}

async function withBrowser(fn) {
  const session = await connect();
  try {
    return await fn(session);
  } finally {
    await session.browser.close();
  }
}

function calendarPage(context) {
  return context.pages().find((p) => p.url().startsWith('https://calendar.google.com/'));
}

/** Signed out, calendar.google.com redirects to the workspace.google.com marketing page. */
function signedOutCalendarPage(context) {
  return context.pages().find((p) => /^https:\/\/workspace\.google\.com\/.*calendar/.test(p.url()));
}

function panelPage(context) {
  return context.pages().find((p) => p.url() === PANEL_URL);
}

/** Returns the extension's service worker, waking it if MV3 idled it out. */
async function serviceWorker(context) {
  const find = () => context.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${EXT_ID}/`));
  if (find()) return find();
  // Any extension-origin document has chrome.runtime; a message to the background starts its worker.
  // Calens's onMessage handler only logs unknown types.
  const waker = await context.newPage();
  try {
    await waker.goto(`chrome-extension://${EXT_ID}/manifest.json`);
    await waker.evaluate(() => chrome.runtime.sendMessage({ type: '__AGENT_BROWSER_WAKE__' }).catch(() => {}));
    return await waitUntil(async () => find(), 5000, 'the extension service worker to start');
  } finally {
    await waker.close();
  }
}

async function resolveTarget(context, target) {
  if (target === 'sw') return serviceWorker(context);
  if (target === 'calendar') {
    const page = calendarPage(context);
    if (!page) {
      throw new HarnessError(
        signedOutCalendarPage(context)
          ? 'Calendar redirected to workspace.google.com: the profile is not signed in to Google. Run `stop`, then `setup`.'
          : 'No calendar.google.com tab open. Run: npm run agent:browser -- launch'
      );
    }
    return page;
  }
  if (target === 'panel') {
    const page = panelPage(context);
    if (!page) throw new HarnessError('Side panel is not open. Run: npm run agent:browser -- open-panel');
    return page;
  }
  throw new HarnessError(`Unknown target "${target}" (expected calendar | panel | sw)`);
}

async function ensureDeveloperMode(context) {
  // Without developer mode, Chrome disables unpacked extensions on reload/restart
  // (disable_reason DISABLE_UNSUPPORTED_DEVELOPER_EXTENSION).
  const page = await context.newPage();
  try {
    await page.goto('chrome://extensions');
    return await page.evaluate(async () => {
      await chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true });
      return (await chrome.developerPrivate.getProfileConfiguration()).inDeveloperMode;
    });
  } finally {
    await page.close();
  }
}

/** (Re)installs dist/ — calling loadUnpacked on an already-installed path performs a full reload. */
async function loadExtension(cdp) {
  if (!fs.existsSync(path.join(DIST, 'manifest.json'))) {
    throw new HarnessError('dist/ is missing. Run: npm run build-dev');
  }
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: DIST });
  if (id !== EXT_ID) {
    throw new HarnessError(
      `Loaded extension ID ${id} != expected ${EXT_ID}. dist/manifest.json is probably a keyless production ` +
        'build, so OAuth will fail with "bad client id". Run: npm run build-dev'
    );
  }
}

const HEARTBEAT_ATTR = 'data-calens-content-script';

/** ISO load time stamped by the content script on <html>, or null if no content script ran in the page. */
const heartbeat = (page) => page.evaluate((a) => document.documentElement.getAttribute(a), HEARTBEAT_ATTR).catch(() => null);

async function waitForHeartbeat(page, timeoutMs) {
  try {
    return await waitUntil(() => heartbeat(page), timeoutMs, 'the content script heartbeat');
  } catch {
    return null;
  }
}

async function authStatus(context) {
  const sw = await serviceWorker(context);
  return sw.evaluate(() =>
    chrome.identity.getAuthToken({ interactive: false }).then(
      () => 'ok',
      (e) => e.message
    )
  );
}

// ---------------------------------------------------------------- commands

async function cmdSetup() {
  if (await isUp()) throw new HarnessError('Harness Chrome is running with CDP attached. Run `stop` first.');
  fs.mkdirSync(PROFILE, { recursive: true });
  console.log(`Opening plain Chrome (NO debugging attached) on ${PROFILE}\n`);
  console.log('In that window:');
  console.log('  1. Sign in to Google, then ALSO sign in to Chrome itself: profile avatar (top right) -> "Sign in as <you>".');
  console.log('     A web-only sign-in is not enough: chrome.identity.getAuthToken needs the browser-level account.');
  console.log('  2. Confirm calendar.google.com shows your calendar.');
  console.log('  3. Quit Chrome with Cmd+Q. This script exits when it closes.\n');
  const chrome = spawn(
    CHROME,
    [...CHROME_BASE_ARGS, 'https://accounts.google.com/', CALENDAR_URL],
    { stdio: 'ignore' }
  );
  await new Promise((resolve) => chrome.once('exit', resolve));
  console.log('Setup done. Next: npm run agent:browser -- launch');
}

async function cmdLaunch() {
  if (!(await isUp())) {
    if (!fs.existsSync(PROFILE)) throw new HarnessError(`No profile at ${PROFILE}. Run: npm run agent:browser -- setup`);
    if (profileLockedByOtherChrome()) {
      throw new HarnessError(
        `Chrome is already running on ${PROFILE} without the debug port (likely the setup window). Quit it (Cmd+Q) and retry.`
      );
    }
    const chrome = spawn(
      CHROME,
      [
        ...CHROME_BASE_ARGS,
        `--remote-debugging-port=${PORT}`,
        '--enable-unsafe-extension-debugging',
        '--hide-crash-restore-bubble',
      ],
      { stdio: 'ignore', detached: true }
    );
    chrome.unref();
    await waitUntil(isUp, 15000, `Chrome to open ${ENDPOINT}`);
  }
  await withBrowser(async ({ context, cdp }) => {
    await ensureDeveloperMode(context);
    // Clear the old marker first: an orphaned content script leaves it behind, which would hide the need to reload.
    const existing = calendarPage(context);
    await existing?.evaluate((a) => document.documentElement.removeAttribute(a), HEARTBEAT_ATTR).catch(() => {});
    await loadExtension(cdp);
    let page = existing ?? signedOutCalendarPage(context);
    if (!page) {
      page = await context.newPage();
      await page.goto(CALENDAR_URL);
    }
    await page.bringToFront();
    await page.waitForLoadState('domcontentloaded');
    console.log(`Harness Chrome up on ${ENDPOINT}, extension ${EXT_ID} loaded from dist/.`);
    if (calendarPage(context) === page && !(await waitForHeartbeat(page, 3000))) {
      console.log('Calendar tab has no content script (opened before the install): reloading it.');
      await page.reload({ waitUntil: 'domcontentloaded' });
      if (!(await waitForHeartbeat(page, 10000))) {
        throw new HarnessError('Content script still not injected after reloading the Calendar tab.');
      }
    }
  });
  await cmdStatus();
}

async function cmdStatus() {
  if (!(await isUp())) {
    console.log(`Harness Chrome: not running (${ENDPOINT})`);
    return;
  }
  await withBrowser(async ({ context, cdp }) => {
    const { extensions } = await cdp.send('Extensions.getExtensions');
    const ext = extensions.find((e) => e.id === EXT_ID);
    const cal = calendarPage(context);
    const signedOutTab = signedOutCalendarPage(context);
    console.log(`Harness Chrome:  running (${ENDPOINT}, profile ${PROFILE})`);
    console.log(`Extension:       ${ext ? (ext.enabled ? 'loaded, enabled' : 'loaded, DISABLED') : 'NOT loaded (run launch)'}`);
    console.log(
      `Calendar tab:    ${cal ? cal.url() : signedOutTab ? 'redirected to workspace.google.com  <- not signed in to Google: stop, then setup' : 'none'}`
    );
    const stamp = cal ? await heartbeat(cal) : null;
    console.log(
      `Content script:  ${!cal ? 'n/a (no Calendar tab)' : stamp ? `injected (loaded ${stamp})` : 'NOT injected  <- run reload'}`
    );
    if (ext?.enabled) {
      const auth = await authStatus(context);
      const hint =
        auth === 'ok'
          ? ''
          : /not signed in/i.test(auth)
            ? '  <- no browser-level Chrome sign-in (web sign-in alone is not enough): avatar (top right) -> "Sign in as <you>"'
            : '  <- click "Sign in with Google" in the side panel once to grant consent';
      console.log(`getAuthToken:    ${auth}${hint}`);
    }
    console.log(`Side panel:      ${panelPage(context) ? 'open' : 'closed'}`);
  });
}

async function cmdReload() {
  await withBrowser(async ({ context, cdp }) => {
    await loadExtension(cdp);
    // Content scripts in already-open tabs are orphaned by an extension reload; reload the tab to re-inject.
    const cal = calendarPage(context);
    if (!cal) {
      console.log('Extension reloaded from dist/. No Calendar tab to reload (run launch).');
      return;
    }
    await cal.reload({ waitUntil: 'domcontentloaded' });
    const stamp = await waitForHeartbeat(cal, 10000);
    if (!stamp) throw new HarnessError('Calendar tab reloaded but the content script did not inject. Is the profile signed in? Try `status`.');
    console.log(`Extension reloaded from dist/, calendar tab reloaded, content script injected (${stamp}). The side panel (if open) closed.`);
  });
}

async function cmdOpenPanel() {
  await withBrowser(async ({ context, cdp }) => {
    const cal = await resolveTarget(context, 'calendar');
    await cal.bringToFront();
    const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
    const tab = targetInfos.find((t) => t.url === cal.url());
    if (!tab) throw new HarnessError(`No tab target for ${cal.url()}`);
    // Fires chrome.action.onClicked exactly like a toolbar-icon click (a real user gesture).
    await cdp.send('Extensions.triggerAction', { id: EXT_ID, targetId: tab.targetId });
    await waitUntil(
      async () => (await (await fetch(`${ENDPOINT}/json/list`)).json()).some((t) => t.url === PANEL_URL),
      8000,
      'the side panel to open'
    );
    await waitForStableViewport(cal); // the panel target appears at the start of the width animation
    console.log('Side panel open.');
  });
}

async function cmdScreenshot(target = 'calendar', file) {
  await withBrowser(async ({ context }) => {
    const page = await resolveTarget(context, target);
    if (target === 'sw') throw new HarnessError('Cannot screenshot the service worker');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const out = path.resolve(file ?? path.join(OUT_DIR, `${target}-${Date.now()}.png`));
    await page.screenshot({ path: out });
    console.log(out);
  });
}

async function cmdEval(target, expression) {
  if (!target || !expression) throw new HarnessError('Usage: eval <calendar|panel|sw> "<js expression>"');
  await withBrowser(async ({ context }) => {
    const handle = await resolveTarget(context, target);
    const result = await handle.evaluate(expression);
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  });
}

async function cmdLogs(...argv) {
  const { values, positionals } = parseFlags(argv, { grep: { type: 'string' } });
  const seconds = positionals[0] ?? '15';
  const grep = values.grep ? new RegExp(values.grep, 'i') : null;
  const emit = (line) => {
    if (!grep || grep.test(line)) console.log(line);
  };
  await withBrowser(async ({ context }) => {
    const sources = [['sw', await serviceWorker(context)]];
    const cal = calendarPage(context);
    if (cal) sources.push(['calendar', cal]);
    const panel = panelPage(context);
    if (panel) sources.push(['panel', panel]);
    const follow = (name, source) => {
      source.on('console', (msg) => {
        // Extension pages also relay the background worker's console; it's already printed as [sw].
        if (name !== 'sw' && msg.location().url.endsWith('/background.js')) return;
        emit(`[${name}] ${msg.type()}: ${msg.text()}`);
      });
      if (name !== 'sw') source.on('pageerror', (err) => emit(`[${name}] pageerror: ${err.message}`));
    };
    for (const [name, source] of sources) follow(name, source);
    // A side panel opened after connecting isn't surfaced as a new Page on this connection
    // (no 'page' event), so poll for it and attach through a fresh connection.
    let panelBrowser;
    const poll = setInterval(async () => {
      if (panel || panelBrowser) return;
      const targets = await (await fetch(`${ENDPOINT}/json/list`)).json().catch(() => []);
      if (!targets.some((t) => t.url === PANEL_URL)) return;
      panelBrowser = await chromium.connectOverCDP(ENDPOINT);
      const opened = panelPage(panelBrowser.contexts()[0]);
      if (!opened) {
        await panelBrowser.close();
        panelBrowser = undefined; // retry next tick
        return;
      }
      emit('[harness] side panel opened, following it');
      follow('panel', opened);
    }, 1000);
    console.log(`Streaming console from ${sources.map(([n]) => n).join(', ')} for ${seconds}s${grep ? ` (grep ${grep})` : ''}...`);
    await sleep(Number(seconds) * 1000);
    clearInterval(poll);
    await panelBrowser?.close();
  });
}

// ---------------------------------------------------------------- live scenarios (Calendar week view)

const TEST_PREFIX = 'calens-test-';

function parseFlags(argv, options) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new HarnessError(err.message);
  }
}

const decodeId = (id) => Buffer.from(id, 'base64').toString('utf8');

/** Opens the week view (of `date`, YYYY-MM-DD, if given) on the Calendar tab and waits for the grid. */
async function openWeek(context, date) {
  const page = await resolveTarget(context, 'calendar');
  await page.bringToFront();
  let target;
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HarnessError(`--date must be YYYY-MM-DD, got "${date}"`);
    target = `${CALENDAR_URL}/week/${date.replaceAll('-', '/')}`;
  } else if (!/\/r\/week/.test(page.url())) {
    target = `${CALENDAR_URL}/week`;
  }
  if (target && page.url() !== target) await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[role="gridcell"]', { state: 'attached', timeout: 15000 });
  await waitForStableViewport(page); // a panel opening/closing mid-command moves the grid and dismisses dialogs
  return page;
}

/** Event blocks on the grid (not those inside dialogs): encoded id, text, and the title parsed from the text. */
async function eventBlocks(page) {
  const blocks = await page.evaluate(() =>
    [...document.querySelectorAll('[data-eventid][data-eventchip]')]
      .filter((el) => !el.closest('[role="dialog"]'))
      .map((el) => ({ id: el.getAttribute('data-eventid'), text: el.innerText.replace(/\s*\n\s*/g, ', ').trim() }))
  );
  // innerText starts "HH:MM to HH:MM, <title>, <calendar>, ..."; all-day blocks have no time prefix.
  const timePrefix = /^\d{1,2}(:\d{2})?\s*(am|pm)?\s*to\s*\d{1,2}(:\d{2})?\s*(am|pm)?\s*,\s*/i;
  return blocks.map((b) => ({ ...b, title: b.text.replace(timePrefix, '') }));
}

/** Scrolls the block into view and returns its centre in viewport coordinates. */
function blockCenter(page, id) {
  return page.evaluate(async (id) => {
    const el = [...document.querySelectorAll('[data-eventid][data-eventchip]')].find(
      (e) => e.getAttribute('data-eventid') === id && !e.closest('[role="dialog"]')
    );
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}

async function clickBlock(page, id) {
  const c = await blockCenter(page, id);
  if (!c) throw new HarnessError(`Event block ${decodeId(id)} is not on the grid`);
  await page.mouse.click(c.x, c.y);
}

const visibleDialog = (page) => page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible');

/** Closes whatever dialog is open, confirming "Discard" if Google asks. Throws if one remains. */
async function discardOpenDialog(page) {
  const close = page.locator('[role="dialog"] [aria-label="Close"]:visible').first();
  if (await close.count()) await close.click({ timeout: 2000 }).catch(() => {}); // may detach mid-click when Escape already closed it
  else await page.keyboard.press('Escape');
  // The "Discard unsaved changes?" confirmation only appears when the draft has content.
  await page.getByRole('button', { name: 'Discard', exact: true }).click({ timeout: 2000 }).catch(() => {});
  await visibleDialog(page).first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  if (await visibleDialog(page).count()) throw new HarnessError('Could not close the open dialog');
}

async function dismissDialogs(page) {
  if (!(await visibleDialog(page).count())) return;
  await page.keyboard.press('Escape');
  await sleep(300);
  if (await visibleDialog(page).count()) await discardOpenDialog(page);
}

/** Scrolls the day column for `date` so `hour` is mid-viewport; returns a click point in empty column space. */
function locateSlot(page, date, hour) {
  const [y, m, d] = date.split('-').map(Number);
  const label = new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return page.evaluate(
    async ({ label, hour }) => {
      const col = [...document.querySelectorAll('[role="gridcell"]')].find(
        (c) => (c.getAttribute('aria-label') || c.innerText || '').includes(label) && c.getBoundingClientRect().height > 300
      );
      if (!col) return { error: `No timed day column for "${label}" in the visible week` };
      let scroller = col.parentElement;
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) {
        scroller = scroller.parentElement;
      }
      const slotY = (c) => c.getBoundingClientRect().top + ((hour + 0.2) * c.getBoundingClientRect().height) / 24;
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        scroller.scrollTop += slotY(col) - (box.top + box.height / 2);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      const r = col.getBoundingClientRect();
      // Right edge of the column is the gutter Google leaves free of event blocks.
      return { x: r.right - 6, y: slotY(col) };
    },
    { label, hour }
  );
}

/**
 * Waits (inside the page) until the quick-create dialog is hydrated and returns a handle to it. Ready means:
 * role=dialog + aria-modal="true", contains the "Add title" input, and nothing in its subtree has mutated for
 * QUIET_MS. Google paints a shell first, then swaps in the real children and keeps patching attributes for
 * ~650ms after the click. Measured over 8 openings: the largest gap between mutation bursts is ~200ms, so 250ms
 * only passes after the last burst (typing into the shell makes the swap drop focus and the dialog self-closes).
 */
async function waitForHydratedQuickCreate(page, context, { quietMs = 250, timeoutMs = 10000 } = {}) {
  try {
    return await page.evaluateHandle(
      ({ quietMs, timeoutMs }) =>
        new Promise((resolve, reject) => {
          const find = () =>
            [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].find((d) => d.querySelector('input[aria-label="Add title"]'));
          let current = null;
          let lastChange = performance.now();
          const observer = new MutationObserver(() => (lastChange = performance.now()));
          const start = performance.now();
          const tick = () => {
            const d = find();
            if (d !== current) {
              observer.disconnect();
              current = d;
              lastChange = performance.now();
              if (d) observer.observe(d, { subtree: true, childList: true, attributes: true, characterData: true });
            }
            if (d && performance.now() - lastChange >= quietMs) {
              observer.disconnect();
              return resolve(d);
            }
            if (performance.now() - start > timeoutMs) {
              observer.disconnect();
              return reject(new Error(d ? `dialog still mutating after ${timeoutMs}ms` : 'no aria-modal dialog with an "Add title" input appeared'));
            }
            setTimeout(tick, 25);
          };
          tick();
        }),
      { quietMs, timeoutMs }
    );
  } catch (e) {
    throw new HarnessError(`Waiting for the hydrated quick-create dialog ${context}: ${e.message.split('\n')[0]}`);
  }
}

const localIsoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function cmdCreateEvent(...argv) {
  const { values, positionals } = parseFlags(argv, {
    date: { type: 'string' },
    hour: { type: 'string' },
    calendar: { type: 'string' },
    save: { type: 'boolean' },
    discard: { type: 'boolean' },
    'keep-open': { type: 'boolean' },
  });
  const title = positionals[0];
  if (!title || positionals.length > 1) throw new HarnessError('Usage: create-event <title> [--date YYYY-MM-DD] [--hour H] [--calendar "<name>"] [--save|--discard|--keep-open]');
  if (!title.startsWith(TEST_PREFIX)) {
    throw new HarnessError(`Refusing: this is a real Google account, so titles must start with "${TEST_PREFIX}" (got "${title}")`);
  }
  if ([values.save, values.discard, values['keep-open']].filter(Boolean).length > 1) {
    throw new HarnessError('Pick one of --save, --discard, --keep-open');
  }
  const hour = values.hour === undefined ? 10 : Number(values.hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new HarnessError('--hour must be an integer 0-23');

  await withBrowser(async ({ context }) => {
    const date = values.date ?? localIsoDate();
    const page = await openWeek(context, date);
    await dismissDialogs(page);
    const slot = await locateSlot(page, date, hour);
    if (slot.error) throw new HarnessError(slot.error);
    await page.mouse.click(slot.x, slot.y);

    const dialog = page
      .locator('[role="dialog"][aria-modal="true"]:visible')
      .filter({ has: page.locator('input[aria-label="Add title"]') });
    const dialogHandle = await waitForHydratedQuickCreate(page, `after clicking the ${date} ${hour}:00 slot`);
    await dialog.locator('input[aria-label="Add title"]').fill(title, { timeout: 8000 });
    const filled = await dialogHandle.evaluate(
      (d, title) => ({ connected: d.isConnected, value: d.querySelector('input[aria-label="Add title"]')?.value }),
      title
    );
    if (!filled.connected || filled.value !== title) {
      throw new HarnessError(
        `The quick-create dialog ${filled.connected ? `lost the typed title (input holds "${filled.value}")` : 'closed itself while typing the title'}; ` +
          'Google swapped its content under the fill. Re-run; if this repeats, the hydration wait in waitForHydratedQuickCreate needs a longer quiet window.'
      );
    }
    const combobox = dialog.locator('[role="combobox"][aria-label="Calendar"]');

    if (values.calendar) {
      try {
        const current = (await combobox.innerText({ timeout: 5000 })).trim().split('\n')[0];
        if (current !== values.calendar) {
          // Clicking the dialog's calendar-name text opens the list; clicking the combobox itself would close it.
          for (let attempt = 0; attempt < 3 && (await combobox.getAttribute('aria-expanded')) !== 'true'; attempt++) {
            await dialog.getByText(current, { exact: true }).first().click();
            await sleep(400); // the dialog is still animating right after it opens; an early click is dropped
          }
          const option = page.locator('[role="option"]:visible').filter({ hasText: new RegExp(`^\\s*${values.calendar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) });
          await option.first().click({ timeout: 5000 }).catch((e) => {
            throw new HarnessError(`Calendar "${values.calendar}" not found in the picker: ${e.message.split('\n')[0]}`);
          });
        }
        const selected = (await combobox.innerText()).trim().split('\n')[0];
        if (selected !== values.calendar) throw new HarnessError(`Calendar selection failed: wanted "${values.calendar}", dialog shows "${selected}"`);
      } catch (err) {
        await page.keyboard.press('Escape').catch(() => {}); // close the picker if it is still open
        await discardOpenDialog(page).catch(() => {});
        throw err;
      }
    }
    const calendar = (await combobox.innerText().catch(() => '')).trim().split('\n')[0] || '(unknown)';

    if (values.discard) {
      await discardOpenDialog(page);
      console.log(`Discarded draft "${title}" (calendar: ${calendar}).`);
    } else if (values['keep-open']) {
      console.log(`Draft "${title}" left open (calendar: ${calendar}).`);
    } else {
      await dialog.locator(':is(button,[role="button"]):visible', { hasText: /^Save$/ }).first().click();
      await dialog.first().waitFor({ state: 'hidden', timeout: 8000 });
      const block = await waitUntil(
        async () => (await eventBlocks(page)).find((b) => b.title.startsWith(title)),
        8000,
        `the saved event "${title}" to appear on the grid`
      );
      console.log(`Saved "${title}" (calendar: ${calendar}) id=${block.id} decoded="${decodeId(block.id)}"`);
    }
  });
}

async function cmdClickEvent(...argv) {
  const { positionals } = parseFlags(argv, {});
  const needle = positionals[0];
  if (!needle) throw new HarnessError('Usage: click-event <title-substring>');
  await withBrowser(async ({ context }) => {
    const page = await openWeek(context);
    await dismissDialogs(page);
    const matches = (await eventBlocks(page)).filter((b) => b.title.includes(needle));
    if (matches.length !== 1) {
      throw new HarnessError(
        matches.length ? `"${needle}" is ambiguous:\n${matches.map((b) => `  ${b.title}`).join('\n')}` : `No event on the grid contains "${needle}"`
      );
    }
    await clickBlock(page, matches[0].id);
    await sleep(500);
    console.log(`Clicked "${matches[0].title}"\n  encoded: ${matches[0].id}\n  decoded: ${decodeId(matches[0].id)}`);
  });
}

async function cmdCleanup(...argv) {
  const { values } = parseFlags(argv, { prefix: { type: 'string' }, date: { type: 'string' } });
  const prefix = values.prefix ?? TEST_PREFIX;
  if (!prefix.startsWith(TEST_PREFIX)) throw new HarnessError(`--prefix must start with "${TEST_PREFIX}"`);
  await withBrowser(async ({ context }) => {
    const page = await openWeek(context, values.date);
    const targets = async () => (await eventBlocks(page)).filter((b) => b.title.startsWith(prefix));
    let deleted = 0;
    for (const block of await targets()) {
      await dismissDialogs(page);
      await clickBlock(page, block.id);
      const popover = visibleDialog(page).filter({ has: page.locator('[aria-label="Delete event"]') });
      await popover.first().waitFor({ timeout: 8000 });
      // Safety: only delete if the popover is for the event we meant to hit.
      const shown = await popover.first().innerText();
      const head = block.title.split(',')[0].trim();
      if (!shown.includes(head)) {
        await dismissDialogs(page);
        throw new HarnessError(`Popover does not show "${head}"; refusing to delete. Popover text: ${shown.slice(0, 120)}`);
      }
      // The block vanishes optimistically while Google's sync.sync POST is still in flight (~0.8s, live region says
      // "Deleting..." then "Event deleted"). Reloading before it completes cancels the delete, so wait for it.
      const synced = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/calendar/u/0/sync.sync'), { timeout: 10000 });
      await popover.locator('[aria-label="Delete event"]:visible').first().click();
      const syncResponse = await synced.catch((e) => {
        throw new HarnessError(`Waiting for the delete's sync.sync response after clicking Delete on "${head}": ${e.message.split('\n')[0]}`);
      });
      if (!syncResponse.ok()) throw new HarnessError(`Deleting "${head}" failed: sync.sync returned HTTP ${syncResponse.status()}`);
      await waitUntil(async () => !(await eventBlocks(page)).some((b) => b.id === block.id), 8000, `"${block.title}" to disappear`);
      deleted++;
      console.log(`Deleted "${head}" (${decodeId(block.id)})`);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[role="gridcell"]', { state: 'attached', timeout: 15000 });
    await sleep(1500);
    const left = await targets();
    if (left.length) throw new HarnessError(`${left.length} event(s) still present after cleanup: ${left.map((b) => b.title).join('; ')}`);
    console.log(`Cleanup done: ${deleted} deleted, none with prefix "${prefix}" remain in the visible week.`);
  });
}

async function cmdWaitPanel(...argv) {
  const { values } = parseFlags(argv, { for: { type: 'string' }, 'fail-on': { type: 'string' }, timeout: { type: 'string' } });
  if (!values.for) throw new HarnessError('Usage: wait-panel --for "<text>" [--fail-on "<text>"] [--timeout <s>]');
  const timeoutMs = Number(values.timeout ?? 10) * 1000;
  await withBrowser(async ({ context }) => {
    const panel = await resolveTarget(context, 'panel');
    const start = Date.now();
    const elapsed = () => ((Date.now() - start) / 1000).toFixed(1);
    for (;;) {
      const text = await panel.evaluate(() => document.body.innerText);
      if (values['fail-on'] && text.includes(values['fail-on'])) {
        throw new HarnessError(`FAIL: panel shows "${values['fail-on']}" after ${elapsed()}s\n${text.slice(0, 300)}`);
      }
      if (text.includes(values.for)) {
        console.log(`PASS: panel shows "${values.for}" after ${elapsed()}s`);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        throw new HarnessError(`FAIL: "${values.for}" not in panel after ${elapsed()}s\n${text.slice(0, 300)}`);
      }
      await sleep(250);
    }
  });
}

async function cmdStop() {
  if (!(await isUp())) {
    console.log('Harness Chrome is not running.');
    return;
  }
  const { browser, cdp } = await connect({ heal: false });
  await cdp.send('Browser.close').catch(() => {});
  await browser.close().catch(() => {});
  await waitUntil(async () => !(await isUp()), 15000, 'Chrome to exit');
  console.log('Harness Chrome stopped.');
}

const HELP = `Agent browser harness for live Google Calendar (see .claude/skills/verify-in-browser/SKILL.md)

  setup                       Human, one-time: plain Chrome on the agent profile to sign in
  launch                      Start Chrome on ${ENDPOINT}, load dist/, open Calendar (idempotent)
  status                      Chrome / extension / Google sign-in / side panel state
  reload                      Reinstall dist/ after a rebuild and reload the Calendar tab
  open-panel                  Open the Calens side panel (same path as a toolbar-icon click)
  screenshot [calendar|panel] [file]
  eval <calendar|panel|sw> "<js expression>"
  logs [seconds] [--grep <regex>]   Stream console output from sw, calendar and panel

Live scenarios on the Calendar tab (week view). Titles MUST start with ${'calens-test-'}; the account is real.
  create-event <title> [--date YYYY-MM-DD] [--hour H] [--calendar "<name>"] [--save|--discard|--keep-open]
                              Fails (non-zero) if the requested calendar was not actually selected
  click-event <title-substring>   Real mouse click on the event block; prints its encoded + decoded id
  cleanup [--prefix calens-test-] [--date YYYY-MM-DD]   Delete visible events with that title prefix, reload, confirm none remain
  wait-panel --for "<text>" [--fail-on "<text>"] [--timeout <s>]   Poll the side panel text: PASS, or FAIL (non-zero)
  stop                        Quit the harness Chrome

Env: CALENS_AGENT_CDP_PORT (9333), CALENS_AGENT_PROFILE (~/.calens-agent-chrome), CALENS_AGENT_CHROME`;

const commands = {
  setup: cmdSetup,
  launch: cmdLaunch,
  status: cmdStatus,
  reload: cmdReload,
  'open-panel': cmdOpenPanel,
  screenshot: cmdScreenshot,
  eval: cmdEval,
  logs: cmdLogs,
  'create-event': cmdCreateEvent,
  'click-event': cmdClickEvent,
  cleanup: cmdCleanup,
  'wait-panel': cmdWaitPanel,
  stop: cmdStop,
};

const [command, ...args] = process.argv.slice(2);
if (!command || !commands[command]) {
  console.log(HELP);
  process.exit(command && command !== 'help' ? 1 : 0);
}
try {
  await commands[command](...args);
} catch (err) {
  console.error(`agent-browser ${command}: ${err instanceof HarnessError ? err.message : err.stack ?? err}`);
  process.exit(1);
}
