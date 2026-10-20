# Patterns and Architectural Decisions

## Chrome Extension Architecture Patterns

### Content Scripts vs. Sidepanel: React Usage

**Date:** 2025-11-27
**Context:** Attempted to use shadcn/ui Sonner toast in content scripts

#### Key Learning: Content Scripts Have Different Constraints

**Sidepanel (sidepanel.tsx):**
- ✅ Full HTML page context
- ✅ Can use React, ES modules, code splitting
- ✅ Vite code splitting works fine (loads multiple JS chunks)
- ✅ All shadcn/ui components work out of the box

**Content Scripts (event-enhancer.ts):**
- ❌ Injected JavaScript into third-party pages
- ❌ Must be fully bundled (all dependencies inlined)
- ❌ Cannot use ES module `import`/`export` statements
- ❌ Cannot load multiple script files with dependencies
- ⚠️ CAN use React, but requires special build configuration

#### The Build Challenge

When both sidepanel and content scripts use React:
1. Vite automatically extracts shared code into `client.js`
2. Sidepanel loads both `sidepanel.js` + `client.js` (works fine)
3. Content script tries to `import` from `client.js` (fails - no module support)

**Error encountered:**
```
Uncaught SyntaxError: Cannot use import statement outside a module
```

**Why `manualChunks: undefined` doesn't work:**
- Vite's optimization layer runs BEFORE Rollup's output configuration
- Even with manual chunk configuration, Vite still creates shared chunks
- The `type: "module"` manifest option doesn't fix this in Chrome extensions

#### Using shadcn/ui Components in Content Scripts

**All shadcn/ui components require React:**

| Component | Requires React? | Bundle Size Impact |
|-----------|-----------------|-------------------|
| Sonner toast | ✅ Yes | +150 KB (React + ReactDOM + Sonner) |
| Button | ✅ Yes | +150 KB (first time), +5 KB incremental |
| Dialog | ✅ Yes | +150 KB (first time), +10 KB incremental |
| Any shadcn/ui | ✅ Yes | React must be bundled |

**Why Sonner needs React:**
```typescript
import { Toaster } from 'sonner'  // React component
import { toast } from 'sonner'     // Function requires <Toaster />

// Must mount React component:
const root = createRoot(container)
root.render(<Toaster />)

// Then toast() works:
toast.success("Hello!")
```

The `toast()` function is not standalone - it communicates with the `<Toaster />` React component for rendering.

#### Solutions Explored

**Attempted fixes:**
1. ❌ `manualChunks: undefined` - Vite still chunked
2. ❌ `manualChunks: () => undefined` - Vite still chunked
3. ❌ `preserveEntrySignatures: 'strict'` - Didn't prevent chunking
4. ❌ `type: "module"` in manifest - New error with exports
5. ❌ Loading both `client.js` + `event-enhancer.js` - Module syntax errors

**Working solutions:**
1. ✅ **Use `@crxjs/vite-plugin`** - Purpose-built for Chrome extensions (not tried, but recommended by community)
2. ✅ **Separate build configs** - Build content scripts separately from sidepanel
3. ✅ **Custom Vite plugin** - Intercept build and force inline for content scripts
4. ✅ **Use vanilla DOM** - Avoid React entirely in content scripts (chosen approach)

#### Decision: Use Vanilla DOM for Content Scripts

**Rationale:**
- KISS principle: Simplest solution that works
- Lightweight: 7 KB vs 150 KB
- Fast load time: No React parsing/execution
- No build complexity: Works with standard Vite config
- Maintainable: Direct DOM manipulation is straightforward

**Trade-offs accepted:**
- Cannot use shadcn/ui components in content scripts
- Custom UI code (but can style to match shadcn/ui visually)
- Missing some advanced features (action buttons, promise toasts)

#### Related Files

- `src/content/toast.ts` - Custom DOM-based toast (current approach)
- `src/content/event-enhancer.ts` - Content script using vanilla JS
- `src/components/ui/sonner.tsx` - shadcn/ui wrapper (sidepanel only)
- `vite.config.ts` - Build configuration

#### References

- [Chrome Extension Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Vite Code Splitting](https://vitejs.dev/guide/build.html#chunking-strategy)
- [@crxjs/vite-plugin](https://github.com/crxjs/chrome-extension-tools)

---

## Event Drag Behavior: Start-Time Text Update

**Date:** 2025-11-27
**Context:** Implementing live preview of event start time during top-edge drag resizing

#### Decision: Update Time Display in Real-Time During Drag

**Rationale:**
- Provides immediate visual feedback to user
- Matches the visual position changes (top/height styles)
- Helps user understand the exact time shift being applied
- Consistent with drag-and-drop UX patterns

**Implementation Approach:**
- **Fragile DOM selector**: Find time element using Google Calendar's obfuscated class name `.gVNoLb` (subject to change with Calendar updates)
- **Error detection**: Log warnings and show error toasts when selector fails or time parsing fails
- Parse original time text ("17:30 – 21:00", "5:30 PM – 9:00 PM", "1 – 4:45pm"). Google drops ":00" and drops the start's meridiem when it matches the end's, so the text is 12h if either side has one; a 24h-only parse of "1:30 – 4:45pm" would misread it as 01:30 (fixed after report `y0HcwDYJZGE8TmQpRv7T`, 2026-10-19)
- Calculate minutes shift from pixel delta (48px/hour approximation)
- Format new start time matching original format (24h/12h)
- Update DOM text content during `mousemove` events
- Rollback to original on drag failure or no-change scenarios

**Key Functions:**
- `extractStartTime()` - Parse time formats and detect 12h/24h
- `addMinutes()` - Calculate new time with minute delta
- `formatTimeAs()` - Format back to matching style
- Live update in `onMouseMove` closure
- Rollback in `UPDATE_EVENT_FAILED` message handler

**Trade-offs:**
- Slight performance cost (string parsing on every mousemove)
- Complexity of time format detection/parsing
- Must handle both 12h and 24h Google Calendar formats

#### Related Files

- `src/content/drag-handler.ts` - Drag logic
- `src/content/time-parser.ts` - Time text parsing (tests in `time-parser.test.ts`)
- `plan.md` - Implementation specification

---

## Google Calendar Sync Behavior: No Automatic UI Refresh After API Updates

**Date:** 2025-11-28
**Context:** Fixing 60-second timeout for event sync after top-edge drag operations

#### Problem Statement

After implementing optimistic UI updates for top-edge dragging, events remained in "syncing" state (grayed out, drag-blocked) for up to 60 seconds, despite the Google Calendar API confirming success in ~200-500ms. The code was waiting for Google Calendar to automatically refresh the UI, but this refresh never occurred.

#### Discovery Process: DOM Mutation Analysis

Used manual browser testing with `MutationObserver` to understand Google Calendar's DOM update patterns:

**Phase 1: Baseline DOM Structure**
- Event elements use classes: `GTG3wb ChfiMc rFUW1c EiZ8Dd afiDFd` (obfuscated, subject to change)
- Events positioned using inline `style` with `top` and `height` properties
- Events identified by `data-eventid` attribute

**Phase 2: Triggered DOM Observation (Critical Finding)**
- Observed 30 mutations during Google Calendar's native bottom-edge drag
- **0 childList changes** - Google does NOT replace elements
- **30 attribute changes** - Google DOES update attributes on existing elements
- **6 style changes** - Google updates inline styles on event elements
- Timing: Style mutations occurred ~16-19 seconds after drag completed

**Key Insight:** Google Calendar updates event elements by modifying their attributes (especially `style`), not by replacing DOM elements.

#### Root Cause Discovery

**The False Assumption:**
```typescript
// Old comment in code (line 457)
// Google Calendar will refresh and override our styles naturally (1-10 seconds)
```

**Reality Check Test:**
1. Drag event using extension's top-edge drag → API confirms success
2. Wait 10 seconds without touching anything → Event stays grayed out
3. Resize browser window or click elsewhere → Event UI immediately updates

**Conclusion:** Google Calendar does NOT automatically refresh the UI after API updates succeed. It only refreshes when:
- ✅ User interacts with the Calendar UI (native drag, click, view change)
- ✅ User resizes the browser window
- ✅ User switches calendar views
- ❌ NOT after external API calls (even successful ones)

#### Why MutationObserver Didn't Fire

The original implementation correctly set up a `MutationObserver` watching for `style` attribute changes on the event element. The observer logic was sound, but it was waiting for an event that never happened:

```typescript
// This observer was correctly configured...
observer.observe(eventElement, {
    attributes: true,
    attributeFilter: ['style']
});

// ...but Google never triggered the mutation because:
// - The API update succeeded
// - Google's internal data was updated
// - But Google's UI render cycle was never triggered
```

The 60-second timeout was a fallback that eventually cleared the stuck state, but created poor UX.

#### Decision: Trust Optimistic UI, Don't Wait for Google

**Rationale:**
- Our optimistic UI already displays the correct position (we set `style.top` and `style.height` during drag)
- The Google Calendar API confirmed the update succeeded
- There's nothing left to "sync" - our visual state matches the server state
- Waiting for a UI refresh that never comes provides no value
- Google will naturally sync the next time it re-renders (view change, window resize, etc.)

**Implementation:**
- **Before:** After API success, call `markEventAsSyncing()` to block interactions and wait for Google's refresh
- **After:** After API success, immediately clear pending state and re-enable interactions

```typescript
// Clear pending indicator - API confirmed success
// Our optimistic UI is already showing the correct position
eventElement.removeAttribute('data-pca-pending');
eventElement.style.opacity = '';
console.log('[Event Enhancer] Event update confirmed by API, optimistic UI is now authoritative');

// No need to wait for Google Calendar to refresh - our optimistic update is already correct
// Google will sync on next natural re-render (view change, window resize, etc.)
```

#### Trade-offs Accepted

**Benefits:**
- ✅ Instant responsiveness - no 60-second delay
- ✅ Users can immediately perform next action
- ✅ Simpler code - removed complex sync state management
- ✅ Better UX - no confusing "syncing" indicators

**Potential Issues:**
- ⚠️ Rare edge case: If API reports success but data wasn't actually saved (server bug), UI will be incorrect until next Google refresh
- ⚠️ Our optimistic UI could theoretically diverge from Google's internal state temporarily
- ✅ Mitigation: Google Calendar will eventually refresh and correct any discrepancies on next user interaction

#### Future Considerations

If Google Calendar changes their behavior or if we need more aggressive sync verification:

**Option 1: Force Refresh (Not Implemented)**
```typescript
// Dispatch fake resize event to trigger Google's re-render
window.dispatchEvent(new Event('resize'));
```

**Option 2: Network Layer Detection (Not Implemented)**
- Monkey-patch `window.fetch` to detect Google's internal RPC calls
- Clear sync state when Google makes its own event update requests
- More complex but would detect Google's internal update cycle

---

## Lexical MarkdownShortcutPlugin: Checkbox Typing Limitation

**Date:** 2025-11-30
**Context:** Investigating why `- [ ]` doesn't create checkboxes in real-time, while `[ ]` works

#### Problem Statement

Users typing `- [ ] task` in the Description field expect a checkbox to appear immediately (similar to GitHub markdown). However:
- Typing `[ ] task` ✅ Creates checkbox immediately
- Typing `- [ ] task` ❌ Creates bullet list with text `[ ] task`
- After save/reload, `- [ ]` renders correctly as checkbox

#### Root Cause: Fundamental Timing Issue

Lexical's `MarkdownShortcutPlugin` triggers transformations on **SPACE character**:

1. User types `- ` (dash + space)
2. Plugin immediately evaluates all transformers
3. `CHECK_LIST` regex requires full pattern `- [ ]`, doesn't match `- ` alone
4. `UNORDERED_LIST` regex `/^(\s*)[-*+]\s/` matches `- ` and creates bullet list
5. User is now typing inside a list item context
6. Typing `[` just adds text to the list item
7. `CHECK_LIST` never gets another chance to match

**Key Insight:** Cannot predict future user input from regex patterns. At the moment of matching `- `, the plugin doesn't know the user will type `[ ]` next.

#### Attempted Solutions

1. **Fixed CHECK_LIST regex** ✅ Partial success
   - Removed problematic `\s?` from Lexical's regex
   - Regex now correct, but doesn't solve timing issue

2. **Negative lookahead in UNORDERED_LIST** ❌ Failed
   - Tried `/^(\s*)[-*+]\s(?!\[)/` to not match if followed by `[`
   - Failed because lookahead checks characters in current match string, not future user input
   - At matching time, string is `"- "` (no `[` typed yet)

3. **Remove UNORDERED_LIST from shortcuts** ✅ Works with trade-offs
   - Keep two transformer sets: one for typing shortcuts, one for import/export
   - Shortcuts: `[CUSTOM_CHECK_LIST, ...TRANSFORMERS_WITHOUT_UNORDERED]`
   - Import/export: `[CUSTOM_CHECK_LIST, ...TRANSFORMERS]` (full set)

#### Decision: Accept Limitation and Educate Users

**Rationale:**
- Issue is fundamental to MarkdownShortcutPlugin's space-triggered architecture
- Cannot predict future keystrokes in regex patterns
- Any "fix" either breaks bullet lists OR breaks checkboxes
- Users can adapt to slightly different syntax
- Clear documentation better than confusing behavior

**Implementation:**
- Keep UNORDERED_LIST removed from typing shortcuts (still works for paste/import)
- Add tooltip next to Description label explaining markdown syntax
- Specifically note: "Type checkboxes without dash: `[ ]` not `- [ ]`"
- Users can still create bullet lists with `* item` or `+ item`

#### Technical Insights

1. **MarkdownShortcutPlugin triggers on specific characters** (space, enter), not continuously
2. **Transformers process sequentially** - first match wins, no backtracking
3. **Regex lookahead/lookbehind operate on match string**, not future input
4. **Multiple transformer sets possible** - different behavior for typing vs import/export
5. **Space-triggered transformation is atomic** - cannot defer or retry based on future input

#### Related Files

- `./troubleshoots/debug-task-markdown-render.md` - Full investigation details

---

## Codebase Refactoring: Code Deduplication & Component Architecture Redesign

**Date:** 2025-12-02
**Context:** Major refactoring to eliminate code duplication and redesign large components using container/presentational patterns with custom hooks.

### Key Architectural Decisions

#### Container/Presentational Pattern with Custom Hooks

**Decision:** Break down large components (Sidepanel.tsx: 812→200 lines, EventDetailsPanel.tsx: 529→150 lines) using container/presentational separation with custom hooks.

**Rationale:**
- Improves maintainability by separating business logic from UI rendering
- Enables better testability and reusability of logic
- Reduces component complexity and cognitive load
- Follows React best practices for component composition

**Implementation:**
- **Custom Hooks:** Extract state management and side effects (useCalendarData, useDateRange, useEventFiltering, useEventAutoSave, useEventData)
- **Presentational Components:** Pure UI components with props interfaces (AuthSection, TimeChart, EventForm, EventHeader, etc.)
- **Container Components:** Orchestrate hooks and pass data to presentational components

#### Chrome Extension Module Architecture Pattern

**Decision:** Shared utilities in `src/lib/` with conditional import strategies based on execution context.

**Key Learnings:**
- **Content Scripts:** Cannot use ES6 imports (execute in page context, not as modules) → Inline constants
- **Background Service Workers:** Can use imports when manifest configured with `"type": "module"`
- **Sidepanel/Components:** Full ES6 support via Vite bundling

**Architecture Pattern:**
```
src/lib/message-types.ts (shared module - source of truth)
          ↓
     ┌────┴────┬─────────┬──────────────┐
     ↓         ↓         ↓              ↓
 background  sidepanel  components  [content scripts]
 (import)    (import)   (import)    (inline copy)
 ✅ Module   ✅ Bundled  ✅ Bundled   ❌ No imports
```

**Implementation:**
- Shared modules in `src/lib/` for background/sidepanel/components
- Inline constants in content scripts (event-enhancer.ts, date-detector.ts)
- ESLint rules prevent accidental imports in content scripts

#### Foundation Utilities Consolidation

**Decision:** Create centralized utilities to eliminate duplication across 154+ console.log calls and repeated logic.

---

## Data Privacy: Calendar Event Data is Fully Local

**Date:** 2026-04-25
**Context:** Audit to verify whether calendar data is processed locally or sent to external servers.

#### Finding: All Calendar Event Data Stays on Device

Google Calendar API → IndexedDB (local). Event titles, descriptions, attendees, times, and locations never leave the browser.

**What leaves the device:**
- Email + OAuth token → Google (auth), and the `submitDiagnostics` Cloud Function when the user clicks Send report
- Event reads/writes → Google Calendar API directly (user's own account)

**What stays local (IndexedDB):**
- All calendar events and metadata
- Custom tags, contribution graphs, analytics calculations

**Key non-obvious facts:**
- Supabase is NOT used in the extension — only in the metrics pipeline (`analytics/`).
- Firebase is only used for the `submitDiagnostics` Cloud Function. The extension never touches Firestore or Realtime Database, and no event data leaves the device.
- No external analytics or tracking (no GA, no Segment, etc.).

#### Related Files

- `src/lib/calendar-service.ts` — fetches from Google Calendar API, writes to IndexedDB
- `src/lib/diagnostics-submit.ts` — sends the idToken and diagnostic report to the Firebase Cloud Function
- `src/lib/firebase-config.ts` — config only, no Firebase SDK imported

---

## Sidepanel Remount Pattern: Data Fetching on Tab Switch

**Date:** 2025-12-14
**Context:** Replacing polling-based side panel data fetching with a remount-based pattern

#### Key Discovery: Chrome Sidepanel Remounts on Tab Switch

When a user switches away from the Google Calendar tab and returns, **the sidepanel React component remounts**. This is a Chrome extension behavior that's not immediately obvious but has significant implications for data fetching strategies.

**What happens on tab switch:**
1. User switches to another tab → Sidepanel may be hidden/suspended
2. User returns to Calendar tab → Sidepanel component remounts
3. All `useEffect(() => {}, [])` hooks run again
4. Component state is reset to initial values

#### The "Instant Display → Background Refresh" Pattern

Instead of polling or waiting for data, use this two-phase approach:

```typescript
// Phase 1: Instant display from cache (no network latency)
const cachedData = await getCachedData();
setState(cachedData);  // User sees data immediately

// Phase 2: Background refresh (fire and forget)
fetchFreshData().then(freshData => {
  // Fresh data arrives via message listener or direct update
  setState(freshData);
});
```

**Benefits:**
- ✅ Instant UI response (no loading spinners)
- ✅ Fresh data without polling
- ✅ Simple code (no intervals, no cleanup)
- ✅ Battery/resource efficient

**Trade-off:**
- ⚠️ Brief "flash" of stale data if it changed while user was away
- User sees cached data for ~200-500ms before fresh data arrives

#### Implementation Example

Calendar data in the side panel is rendered from IndexedDB, and the background sync tells the panel when to re-read it (`src/hooks/useDateRange.ts`):

```typescript
// On mount, the panel reads whatever IndexedDB already holds.
// When the background sync writes new events, it broadcasts SYNC_COMPLETE.
if (message.type === MessageType.SYNC_COMPLETE) {
  syncCalendar(true); // Re-read IndexedDB, skip debounce
}
```

#### Why Not Polling?

**Previous approach (removed):**
```typescript
// ❌ Polling every 2 seconds while waiting for a state change
useEffect(() => {
  const pollInterval = setInterval(pollStatus, 2000);
  window.addEventListener('focus', handleFocus);
  // Complex cleanup, stuck flags, continuous network requests...
}, []);
```

**Problems with polling:**
- Required an in-progress flag that could get stuck
- Continuous network requests while focused
- Complex state management (start/stop on focus/blur)
- Repeated console logs confusing during development

**Remount-based approach is simpler:**
- No flags to manage
- No intervals to clean up
- Natural lifecycle tied to component mount
- Works for any change made while the panel was hidden

#### When to Use This Pattern

Use "instant display → background refresh" when:
- Data changes infrequently (user preferences, cached metadata)
- Stale data is acceptable for brief moments
- You want instant UI response
- The data has a caching layer

Don't use this pattern when:
- Data must be real-time accurate (financial transactions)
- Cache staleness would cause user errors
- Fresh data is required before any user action

#### Related Files

- `src/hooks/useDateRange.ts` - `SYNC_COMPLETE` listener that re-reads calendar data
- `src/background/` - sync broadcasts `SYNC_COMPLETE` after writing to IndexedDB

---

## Event Selection: Click Resolution and Race-Resilient Fetching

**Date:** 2026-04-27
**Context:** Side panel was showing a red "Event not found" error when the user changed the calendar dropdown inside the create-event dialog. Three prior fixes targeted a presumed mutation-observer race in `newlyCreatedEvents` and did not resolve it.

#### Problem Statement

Two distinct issues fed the same symptom:

1. **Wrong element resolved on click.** The content-script click handler used `document.elementsFromPoint(x, y)` to find the event element under the cursor. `elementsFromPoint` returns *every* element at that point in stacking order — including ones obscured by overlays. Clicking inside a portal-rendered popover (e.g. the calendar-picker dropdown) would walk past the popover and resolve to a calendar event element behind it, then emit `EVENT_SELECTED` for an event the user never clicked.
2. **No tolerance for the inevitable IndexedDB miss.** Even with click resolution fixed, any fetch race (newly created event, mid-flight calendar change, observer miss) surfaces as a flash of red error UI on the very next user interaction.

#### Decision: Two distinct helpers for event-element resolution, by intent

**Click delegation** uses the click `target`'s ancestor chain. The browser's native hit-testing has already picked the topmost interactive element — overlays naturally short-circuit.

```ts
// src/content/click-event-resolver.ts
resolveEventForClick(e.target) // returns target.closest('[data-eventid]')
```

**Drag hit-testing** keeps point-based scanning. Drag handlers legitimately need to find events near the cursor even through transparent overlays.

```ts
// src/content/event-hit-tester.ts
findEventElementAtPoint(x, y) // walks document.elementsFromPoint
```

These two intents previously shared a single `findEventElementAt` helper duplicated across `event-enhancer.ts` and `drag-handler.ts`, which invited the wrong one to be used for click delegation. They are now separate, named for the intent, and each used in exactly one place.

#### Decision: Retry-on-miss as the architectural backstop for fetch races

`useEventData` no longer surfaces "Event not found" on the first miss. It uses `fetchWithSyncRetry`, which now **loops** — retrying the fetch on every `SYNC_COMPLETE` within an overall budget (8000ms), rather than a single retry after one fixed wait.

```ts
// src/hooks/fetch-with-sync-retry.ts
fetchWithSyncRetry({ fetchOnce, registerSyncListener, timeoutMs, signal })
```

**Why it had to loop, not just wait once (2026-08-13 follow-up):** the original single-retry version (wait for one `SYNC_COMPLETE` or 3000ms, fetch once more, done) still missed a real case: a newly created event's sync can be queued behind an already-in-flight sync for a different calendar (`SyncService` serializes incremental syncs). The retry would wake on that *first*, unrelated `SYNC_COMPLETE`, still miss, and give up — even though the real sync was seconds away. The budget was also bumped 3000ms → 8000ms to comfortably cover `calendar-observer.ts`'s 1s mutation debounce plus a real Calendar API round-trip, which the original 3s budget didn't leave much room for.

This covers "event not yet synced" races, including multi-cycle ones — but only if the sync that lands actually fetches the event's calendar. Retrying cannot help when the sync targets the wrong calendar; see the 2026-10-13 root cause below.

Regression-tested at two levels: a unit test in `fetch-with-sync-retry.test.ts` reproduces the queued-sync race against the pre-fix algorithm (fails) and the fix (passes); `e2e/event-not-found.spec.ts` reproduces the same race through the *real* content-script → background → side-panel pipeline (see the Playwright harness section below).

#### 2026-10-13: Actual root cause — abbreviated calendar IDs in `data-eventid`

The retry fixes above did not stop the bug. Reproduced live: create an event (quick-create → Save) and the panel loads ~8s, then shows "Event not found"; the event only appeared after the 15-minute all-calendar alarm sync. Two bugs in the post-create *targeted* sync, plus a missing recovery path:

1. **`data-eventid` abbreviates the calendar ID** (`@m`/`@g` forms; see `docs/google-calendar-dom.md`). Only `@g` was expanded, so a sync targeted at the primary calendar matched no stored calendar and fetched nothing — yet still broadcast `SYNC_COMPLETE`, so the panel retried against an unchanged DB. The Calendar API returns **404** for both short forms, so drag-resize on primary-calendar events (which called the API with the decoded ID) was broken by the same cause. Fix: `resolveCalendarId()` in `src/lib/event-id-utils.ts` matches on the part before `@` against stored calendars (no suffix table); `SyncService` syncs all selected calendars when a target can't resolve.
2. **The 1s observer debounce kept only the last mutation batch's calendars.** Switching a draft to another calendar renders the saved block on the new calendar, *then* removes the Create dialog — which still carries the original calendar's ID. The new calendar was dropped. Fix: `calendar-observer.ts` accumulates calendar IDs across the debounce window.
3. **No recovery after the retry budget.** `useEventData` now keeps listening for `SYNC_COMPLETE` after showing "Event not found" and replaces the error once the event lands.

Also fixed alongside: the old `SyncService` queue drained only one waiter and ran it unguarded, so a third concurrent sync never ran (and never sent `SYNC_COMPLETE`).

**Decision — defer selection while an event has a Google dialog open.** Google's Create dialog and details popover carry the event's `data-eventid` inside `[role="dialog"]` (`docs/google-calendar-dom.md`), so clicks there (title field, Save, or the draft block itself) used to select the unsaved draft; drafting for >8s showed "Event not found". Now (`src/content/dialog-selection.ts`) such clicks are held until the dialog closes, then the event is selected only if its block is still on the grid. Save/Discard removal order: see `docs/google-calendar-dom.md`. A direct click on another event cancels the held selection.

**Gotcha — decide at `pointerdown`, not `click`.** Google opens or retargets its details popover during the click itself (`docs/google-calendar-dom.md`), so at click time the clicked event already "has a dialog". Checking then deferred every click made while another event's popover was open (panel only updated when the popover closed). `event-enhancer.ts` snapshots "did this event already have a dialog?" in a capture-phase `pointerdown` listener; "is the click inside a dialog?" is still checked at click time.

**Why the old E2E test passed:** it encoded the calendar as `primary`, a form real Google never emits. `e2e/event-not-found.spec.ts` now replays the live draft → switch-calendar → Save sequence with realistic short IDs.

#### Removed: `newlyCreatedEvents` mutation tracker

The previous solution was a 5-second-timeout `Map` populated by the calendar-observer's `MutationObserver`, used to suppress `EVENT_SELECTED` for recently-detected event IDs. With the retry backstop in place, its only remaining "feature" was suppressing legitimate user clicks on a just-created event for 5 seconds — worse UX than briefly showing a spinner. Three iterative fixes (`setTimeout(0)` defer, attribute-branch population, `attributeOldValue` old-ID refresh) attested to its fragility. Deleting it removed ~30 lines and the `attributeOldValue` observer overhead.

#### Trade-offs Accepted

- A click on an event that hasn't synced yet opens the side panel with a loading spinner (up to the 8s budget) before showing the event. In practice the targeted sync lands in ~1-2s.

#### Related Files

- `src/content/click-event-resolver.ts` — target-based resolution for click delegation
- `src/content/event-hit-tester.ts` — point-based hit-testing for drag handlers
- `src/content/event-enhancer.ts` — click handler wiring
- `src/content/drag-handler.ts` — drag handler wiring
- `src/hooks/fetch-with-sync-retry.ts` — generic fetch-with-retry helper
- `src/hooks/useEventData.ts` — side panel event fetch with retry-on-miss and post-error recovery
- `src/lib/event-id-utils.ts` — `decodeEventId` / `resolveCalendarId`
- `src/content/calendar-observer.ts` — debounced, calendar-accumulating sync trigger
- `src/content/dialog-selection.ts` — defers selection while an event has a Google dialog open

---

## Live-Auth Agent Browser Harness (and Why E2E Is Still Mocked)

**Dates:** 2026-08-13 (first attempt, abandoned), 2026-10-07 (root causes found, harness built)
**Context:** An agent needs to verify UI changes against live, signed-in Google Calendar (content scripts on the real DOM, real side panel, real `chrome.identity` token) without a human re-deriving the check each time. The first attempt (project-level `chrome-devtools-mcp`) was abandoned as "structurally impossible". That conclusion was wrong; the harness now lives in `scripts/agent-browser.mjs` (how-to: `.claude/skills/verify-in-browser/SKILL.md`).

#### What actually broke the first attempt

Measured on branded Chrome 153 (`navigator.webdriver` read from a page):

| Launch | `navigator.webdriver` |
|---|---|
| Plain Chrome + fixed `--remote-debugging-port=N`, then Playwright `connectOverCDP` | `false` |
| Playwright `launchPersistentContext` (`--remote-debugging-pipe`) | `true` |
| Same, plus `--disable-blink-features=AutomationControlled` | `false` |

- **`navigator.webdriver` is a launch-flag effect, not "any CDP client attached".** Chromium enables the `AutomationControlled` Blink feature for `--enable-automation`, `--headless`, `--remote-debugging-pipe` and `--remote-debugging-port=0`. A *fixed* port doesn't trip it, and attaching later doesn't either. Puppeteer (under `chrome-devtools-mcp`) and Playwright launch with pipe/port 0, so they always trip it.
- **"50+ cookies on disk but renders logged out" is most likely a cookie-encryption mismatch.** Puppeteer/Playwright launch with `--use-mock-keychain --password-store=basic`, so on macOS cookies written by a normal Chrome (real Keychain key) can't be decrypted. Inferred from the flags; not reproduced against a real signed-in profile.
- **The login block ("This browser or app may not be secure")** happened with webdriver=true. The harness sidesteps it entirely: the human signs in through a plain Chrome launch with no debugging attached (`agent-browser setup`).

#### How the harness works, and the gotchas each piece answers

- **Branded Google Chrome, not Chrome for Testing:** `chrome.identity.getAuthToken` needs a browser-level Chrome sign-in ("The user is not signed in" otherwise), which CfT can't provide. A **web-only** Google sign-in (Calendar works, Chrome lists the account under `account_info`) is not enough: Chrome keeps that separate from the browser's primary account, and `getAuthToken` still fails until the human uses avatar → "Sign in as <name>". Hit on first real setup (2026-10-07). The web session itself survived attaching over the fixed port, confirming that part of the design.
- **`--disable-sync` on every launch (setup included).** Chrome sign-in turns on account sync for every data type: on first setup it installed the human's synced extensions (Claude in Chrome opened a claude.ai login tab, a VPN extension came along) and downloaded 370 account passwords into `Login Data For Account`. With the flag, Chrome greys out all account-sync toggles ("Managed by your organization") and `getAuthToken` still works. It does **not** purge data already downloaded, so a profile that was ever signed in without the flag must be deleted and set up again.
- **Extension load:** branded Chrome 137+ silently ignores `--load-extension`. CDP `Extensions.loadUnpacked` works over a fixed port when Chrome runs with `--enable-unsafe-extension-debugging`. Calling it again on the same path is a full reload. The resulting ID is derived from the manifest `key`, so a keyless production `dist/` yields a different ID (and broken OAuth); the script refuses that.
- **Developer mode must be on** (set via `chrome.developerPrivate.updateProfileConfiguration` from a `chrome://extensions` tab), or Chrome disables the unpacked extension on reload/restart with `DISABLE_UNSUPPORTED_DEVELOPER_EXTENSION` (`1 << 24`). Hand-writing `extensions.ui.developer_mode` into `Preferences` didn't take.
- **CDP-loaded extensions aren't reliably persisted across restarts**, so `launch` reloads `dist/` every time (which also guarantees the latest build).
- **Opening the side panel:** `chrome.sidePanel.open()` needs a user gesture; calling it from the service worker fails. `Extensions.triggerAction({id, targetId})` fires `chrome.action.onClicked` like a toolbar click; `targetId` must be a **`tab`-type** target (`Target.getTargets({filter:[{type:'tab'}]})`), not the `page` target.
- **The real side panel is a normal Playwright page** (`chrome-extension://<id>/sidepanel.html`, ~360px wide) when you connect *after* it opened. An existing `connectOverCDP` connection gets no `page` event for it, so reconnect (or poll `/json/list`) to pick it up.
- **MV3 service worker idles out after ~30s** with no client and then isn't listed; wake it with `chrome.runtime.sendMessage` from any extension-origin document (e.g. a tab on `chrome-extension://<id>/manifest.json`).
- **Shut down gracefully** (CDP `Browser.close` or SIGTERM). A SIGKILL'd Chrome loses recent profile writes (developer mode, installed extensions).
- **Playwright MCP** (`--cdp-endpoint`, configured in `.mcp.json`) attaches the same way and lists the side panel as a tab with an accessibility snapshot.

**Security trade-off:** the dedicated profile is a standing signed-in credential, and while the harness runs, any local process can drive it via `127.0.0.1:<port>`. Accepted for a dev machine because it now buys live verification; `agent-browser stop` closes the port. Use a test Google account if that matters.

#### Decision: Regression tests stay mocked; the live harness is for interactive verification

The two are complementary. Use the live harness to see a change working against real Calendar (or to reproduce a bug a user reported); encode anything that must not regress as a mocked E2E spec. `e2e/event-not-found.spec.ts` (Playwright) never talks to real Google. `calendar.google.com` and the Calendar API are intercepted and served fixtures/mocks (see `.claude/rules/e2e-testing.md` for the mechanics), while everything on the extension's own side — content scripts, background service worker, `SyncService`, `fetchWithSyncRetry` — runs as the real, unmodified `dist/` build.

**Why this is the right trade-off, not a shortcut:** a race condition needs deterministic timing to be a reliable regression test — a real live race only reproduces "sometimes." Controlling exactly when the mocked Calendar API responds lets the test force the exact interleaving (queued-sync-completes-first) on every run. It also means the test needs no live Google account and isn't subject to Google's anti-bot posture at all, so it can run unattended in CI.

**Verified this is a truthful reproduction, not a trivially-passing test:** ran the spec against the pre-fix `fetch-with-sync-retry.ts`/`useEventData.ts` (temporarily restored from `HEAD~1`, `dist/` rebuilt) — it failed, and the failure snapshot contains the literal `"Untitled Event"` heading + `"Event not found"` paragraph from the original bug report. Restored the fix, rebuilt, reran — passes.

#### Related Files

- `e2e/event-not-found.spec.ts` — the E2E regression test
- `.claude/rules/e2e-testing.md` — offline E2E harness mechanics and gotchas
- `scripts/agent-browser.mjs` — live-auth agent browser harness
- `.claude/skills/verify-in-browser/SKILL.md` — agent workflow for the live harness

---

## Diagnostics & User Reports

**Date:** 2026-10-13
**Context:** The "Event not found" bugs needed the live harness because the in-app log only captured drag errors. The diagnostics log records selection, fetch, sync, API, auth, drag and error events from all three contexts, and a signed-in user can send it to the team in one click without a new sign-in.

#### Decision: Single Writer in the Service Worker

Only the service worker writes `chrome.storage.local['diag_log']`. Writes go through an in-memory queue, so there are no read-modify-write races. The buffer keeps the newest 1000 entries and at most 300 KB serialized (`DIAG_MAX_ENTRIES`, `DIAG_MAX_BYTES`).

- SW code calls `diag()` from `lib/diag-log.ts` (ctx `sw`).
- Side panel code uses `lib/diag-panel.ts`. It sends a fire-and-forget `DIAG_LOG` message and the SW stamps ctx `panel` from the sender. Clearing goes through `DIAG_CLEAR`. Panel code never calls the SW writer directly.
- Content scripts use `content/diag.ts` only, and only from the `event-enhancer` entry graph. `date-detector` must not import it. A module shared by two content entries is split into a chunk, and the `check-content-bundles` gate fails.
- Lib modules shared by several callers (for example `google-auth.ts`) do not log. Their callers do.
- Panel and UI code may read via `getDiagEntries()` and `DIAG_STORAGE_KEY`, since `storage.onChanged` fires on every write.

#### Write-Time Sanitisation

`appendDiagEntry` is the only write path and runs `sanitize()`:

- Keys matching `title|summary|description|location|attendee|token|authorization|secret|password|cookie|credential|api key` are dropped at any depth (case-insensitive substring match).
- Strings are capped at 200 chars, and `ya29.` / `eyJ` token-shaped substrings become `[redacted-token]`. Depth is capped at 4 and arrays at 20 items.
- `msg` is capped at 300 chars and token-scrubbed, but it is not key-sanitised. Never interpolate titles, emails or tokens into `msg`. Put IDs in `data`, where the key rules and report-time redaction apply.

#### Report-Time Redaction

`GET_DIAGNOSTICS_REPORT` (`background/diagnostics-report.ts`) builds the report from `chrome.storage.local` and IndexedDB. It makes no network calls and no interactive auth. The panel passes `panelState` (selected event ID, current error), which is redacted with the same rules as the log.

`lib/diag-redact.ts` replaces every calendar ID with a stable label:

- The primary calendar is `primary`. Others are `cal-N (group|user|holiday|other)`, numbered by sorted ID.
- Shortened `data-eventid` forms (`x@g`, `x@m`) resolve through `resolveCalendarId`.
- Base64 `data-eventid` values (`base64("eventId calendarId")`) are decoded, relabelled and re-encoded, so they still correlate with the panel's event ID.
- Any other email-like string is masked as `a***@domain`. The user's address appears only in the `user.email` header field. As a calendar ID it is labelled like any other calendar.

#### Decision: Backend Flow via `submitDiagnostics`

Panel → `submitDiagnostics` (`functions/src/diagnostics.ts`, wired in `functions/src/index.ts`):

1. `lib/diagnostics-submit.ts` posts `{idToken, report, note}`. The token comes from `getGoogleIdToken()`.
2. The function caps the body at 512 KB and the note at 2000 chars, verifies the token via Google tokeninfo, requires a verified email, and takes the email from the token, never from the body.
3. Rate limit: 5 reports per email per hour, checked in a transaction on `diagnosticRateLimits/{sha256(lowercased email)}`. Over the limit returns 429.
4. Stores `diagnosticReports/{id}` with `email`, `version`, `note`, `summary` (warn/error counts and the last 5 lines) and `report` as a JSON string. The string form avoids Firestore's nesting, array and size limits on client-supplied data. Anything worth querying belongs in `summary`.
5. Posts a multipart message to the Discord #user-feedback webhook (secret `DISCORD_FEEDBACK_WEBHOOK_URL`): an embed with escaped text, empty `allowed_mentions`, and the full report as a JSON attachment.
6. If Discord fails, the report is already stored, so the function still returns 200 with `{reportId, discord: 'failed'}`. The client surfaces this as `discordFailed`.

`firestore.rules` denies all client read and write on both collections. Only the Admin SDK writes them.

**Known limitation:** tokeninfo does not check the token's audience, so a token minted for another OAuth client would pass verification. This is the same gap as `checkSubscription`. Not fixed here.

#### Related Files

- `src/lib/diag-log.ts`—writer, queue, sanitisation, SW error and lifecycle capture
- `src/lib/diag-panel.ts`—panel sender and `clearDiagLog`
- `src/content/diag.ts`—content sender (standalone, inlined message type)
- `src/lib/diag-redact.ts`—calendar labels and report-time redaction
- `src/background/diagnostics-report.ts`—`GET_DIAGNOSTICS_REPORT` builder
- `src/lib/diagnostics-submit.ts`—client submit
- `functions/src/diagnostics.ts`—`handleDiagnostics`, rate limit, Discord form
- `functions/src/index.ts`—`submitDiagnostics` export
- `firestore.rules`—deny-all for `diagnosticReports` and `diagnosticRateLimits`
