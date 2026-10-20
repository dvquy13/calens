---
name: verify-in-browser
description: Verify Calens changes against live, signed-in Google Calendar in a real Chrome — load the dev build, open the real side panel, click, screenshot, read console, evaluate in the content page / side panel / service worker. Use when asked to check, see, reproduce, or confirm extension UI behavior "for real" or in the browser, or to debug something the mocked E2E suite can't show.
---

# Verify in browser (live Google Calendar)

A dedicated Chrome profile (`~/.calens-agent-chrome`) that a human signed into once, driven over a fixed CDP
port (`127.0.0.1:9333`). The real `dist/` build runs against real Google: real content scripts on the real
Calendar DOM, the real side panel, a real `chrome.identity` token. Why it's built this way:
`docs/patterns-and-decisions.md`, "Live-Auth Agent Browser Harness".

Want a repeatable regression test instead? Use the mocked Playwright suite (`npm run test:e2e`,
`.claude/rules/e2e-testing.md`).

## Workflow

```bash
npm run build-dev                       # never test a production build: wrong extension ID, OAuth fails
npm run agent:browser -- launch         # starts Chrome (or reuses it), loads dist/, opens Calendar, prints status
npm run agent:browser -- open-panel     # real toolbar-click path (chrome.action.onClicked)
# ...interact (see below)...
# after each code change:
npm run build-dev && npm run agent:browser -- reload   # reinstalls dist/, reloads the Calendar tab, closes the panel
```

Read `launch`/`status` output before going further:

| Status line | Meaning / fix |
|---|---|
| `Harness Chrome: not running` | `launch` |
| `Calendar tab: redirected to workspace.google.com` | Profile not signed in to Google → ask the human (see Setup) |
| `getAuthToken: The user is not signed in.` | Signed in to Google on the web only, not to Chrome itself → ask the human to click the profile avatar (top right) → "Sign in as <name>" (works in the running harness window; no password normally needed) |
| `getAuthToken: <OAuth consent error>` | Ask the human to click "Sign in with Google" in the side panel once |
| `Extension: loaded, DISABLED` | Run `launch` again (it re-enables developer mode and reloads) |
| `Extension: NOT loaded` | `launch`, then `reload` |
| `Content script: NOT injected` | The Calendar tab has no Calens content script (tab opened before the install), so clicks do nothing and a test can pass falsely. Run `reload`. `launch` and `reload` fix this themselves and fail loudly if injection still doesn't happen |

Don't try to sign in yourself: credentials and Google's sign-in UI are the human's job.

## Interacting

**Quick checks (CLI, each call is independent):**

```bash
npm run agent:browser -- status
npm run agent:browser -- screenshot calendar          # or: panel   → prints PNG path (Read it to see it)
npm run agent:browser -- eval calendar "document.querySelectorAll('[data-eventid]').length"
npm run agent:browser -- eval panel "document.body.innerText.slice(0, 500)"
npm run agent:browser -- eval sw "chrome.storage.local.get(null)"   # background service worker (woken if idle)
npm run agent:browser -- logs 20                      # console from sw + calendar + panel; run in background while acting
```

**Live scenarios (CLI, Calendar tab in week view).** These replace hand-written Playwright:

```bash
npm run agent:browser -- create-event calens-test-x --calendar Produce [--date 2026-10-15] [--hour 14] [--save|--discard|--keep-open]
npm run agent:browser -- wait-panel --for calens-test-x --fail-on "Event not found" [--timeout 10]   # PASS/FAIL, non-zero on FAIL
npm run agent:browser -- click-event calens-test-x     # real mouse click on the block; prints encoded + decoded event id
npm run agent:browser -- logs 15 --grep "Event selected|deferred"   # selection logs also show the decoded "<eventId> <calendar>"
npm run agent:browser -- cleanup                       # ALWAYS run at the end
```

- **Title convention:** `create-event` refuses titles not starting with `calens-test-`, and `cleanup` only
  deletes visible blocks whose title starts with that prefix (`--prefix` must too). Never touch other events.
- `create-event` exits non-zero if the requested `--calendar` isn't actually selected (it reads the dialog's
  Calendar combobox back) and closes the draft. Default is `--save`; `--hour` defaults to 10; `--date`
  navigates to that week, otherwise today's week.
- `cleanup` and `click-event` work on the week currently shown (`cleanup --date` picks another week). Always
  `cleanup` the weeks you created events in.
- These need Google Calendar in English (day columns are found by "Thursday, October 15").

**Clicking, typing, accessibility snapshots:** the `calens-browser` MCP server (Playwright MCP over the same
port, `.mcp.json`). It only works while the harness Chrome is up (`launch` first).
- `browser_tabs` (`action: "list"` / `"select"`) to switch between the Calendar tab and the side panel; the
  panel appears as a tab at `chrome-extension://…/sidepanel.html`.
- `browser_snapshot` → `browser_click` / `browser_type` with the returned refs; `browser_take_screenshot`.
- Never call `browser_close` (it can close the shared browser); use `npm run agent:browser -- stop` when done.
- MCP output files land in `test-results/playwright-mcp/` (gitignored).

## Gotchas

- **Content scripts are orphaned by an extension reload.** `reload` reloads the Calendar tab for that reason;
  if you reload any other way, reload the tab too.
- **The side panel closes on `reload`**, and Calens closes it whenever the active tab isn't Calendar. Run
  `open-panel` again; don't focus or open other tabs in that window while you need the panel.
- **Opening/closing the side panel animates the Calendar viewport width (~400ms).** `open-panel` and the live
  scenarios wait for the viewport to stop resizing; `create-event` also waits for the hydrated quick-create
  dialog (aria-modal, "Add title" input, 250ms without subtree mutations) and `cleanup` waits for the delete's
  `sync.sync` response before reloading. A raw MCP click right after `open-panel`/`reload` can still hit a moving grid.
- **A panel opened after an MCP/Playwright connection was made may not show up on that connection.** The
  CLI reconnects per call; in MCP, re-run `browser_tabs list`.
- **This is the human's real Google account and data.** Don't create, edit, or delete calendar events unless
  the task explicitly calls for it; prefer read-only checks.
- **Playwright actionability checks stall on Calendar and Settings (2026-10-19).** Locator `click()`/
  `scrollIntoViewIfNeeded()` time out because elements never reach a "stable" state, and a `mouse.wheel` step in
  `browser_run_code_unsafe` once hung for 30 minutes. Use `page.mouse.click(x, y)` from a `boundingBox()`, or DOM
  `.click()` via evaluate, and navigate weeks with the Prev/Next buttons.
- **`logs` streams forward only**: start it in the background before acting; it can't show what already happened.
- **Testing a drag without saving:** the top-edge drag sends no update when the net shift snaps to 0 (12px per
  15 min). Mouse down, move, read `.gVNoLb`, move back to the exact start y, then release.
- **`launch` refuses if a plain Chrome (the setup window) still holds the profile.** Ask the human to quit it.
- **`Browser context management is not supported` (`connectOverCDP`).** Happens when Chrome has no Calendar tab
  (only `about:blank` / `chrome://omnibox-popup` targets; cause unknown). CLI commands now open a Calendar tab
  themselves via `/json/new` before connecting. If connecting still fails, the error prints the manual
  recovery: navigate any tab to calendar.google.com (MCP `browser_navigate`), then `launch`, then `reload`.

## Setup (human, one-time; again if the session expires)

```bash
npm run agent:browser -- stop     # if running
npm run agent:browser -- setup    # opens plain Chrome with NO debugging attached
```

In that window: sign in to Google, **then also sign in to Chrome itself** (profile avatar, top right →
"Sign in as <name>"; a web-only sign-in leaves `getAuthToken` failing with "The user is not signed in"),
check calendar.google.com shows the calendar, quit with Cmd+Q. Then `npm run agent:browser -- launch`, open the panel, and click "Sign in with
Google" once to grant Calens consent. Agents: when setup is needed, tell the human to run these
(`! npm run agent:browser -- setup` in the Claude Code prompt) and wait.

The harness always runs Chrome with `--disable-sync`, so the Chrome sign-in doesn't pull the human's
extensions, passwords or history into this profile, and nothing done here syncs back to their other
profiles. Never launch this profile without it (e.g. by opening it from a normal Chrome): sync would start
and download account data that the flag can't purge afterwards.

Env overrides: `CALENS_AGENT_CDP_PORT` (keep `.mcp.json` in sync if changed), `CALENS_AGENT_PROFILE`,
`CALENS_AGENT_CHROME`.
