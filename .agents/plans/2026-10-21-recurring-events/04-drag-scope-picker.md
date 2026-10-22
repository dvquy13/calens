# 04 · Drag: in-page scope picker

Read [README.md](README.md) first.

## Tracker
- [x] Background: `UPDATE_EVENT_START` accepts `scope`; replies `UPDATE_EVENT_NEEDS_SCOPE` for recurring events without one
- [x] Background: SW `RecurringClient` adapter, scoped write via `applyRecurringEdit`
- [x] Content: `src/content/scope-picker.ts`
- [x] Content: `drag-handler.ts` wires the picker, resend, cancel-revert
- [ ] typecheck, lint, test, build-dev (bundle check) green

## Background (`src/background/event-update-handler.ts`, `src/background/index.ts`)
- `UPDATE_EVENT_START` message gets optional `scope?: EditScope`; pass it through `index.ts` to `handleUpdateEventStartOptimistic`.
- After `fetchEvent`, if `event.recurringEventId` and no `scope`:
  - Fetch the master, compute `canEditSeries(master, accessRole)` (accessRole from the calendar row in IndexedDB, via the same DB that `resolveFullCalendarId` uses).
  - `chrome.tabs.sendMessage(tabId, { type: UPDATE_EVENT_NEEDS_SCOPE, eventId: encodedEventId, canEditSeries })` and return without writing.
- With a scope (or a non-recurring event, which keeps today's code path exactly):
  - Build a SW `RecurringClient` from the existing `fetchEvent`/`patchEvent` helpers plus new `insertEvent` and `listInstances` (fetch with the token, follow `nextPageToken`, `diag` from `lib/diag-log.ts` on failure).
  - `applyRecurringEdit(client, { calendarId, instance: event, scope, buildPatch: (base) => ({ start: { dateTime: new Date(new Date(base.start.dateTime!).getTime() + minutesShift * 60000).toISOString(), timeZone: base.start.timeZone } }) })`. Keep the end fixed, as today. All-day events are not draggable; keep whatever the current code does for them.
  - On success: `UPDATE_EVENT_SUCCESS` as today.
- Never import `src/lib/google-auth.ts` here.

## Content
- `scope-picker.ts`: `showScopePicker(anchor: HTMLElement, canEditSeries: boolean): Promise<EditScope | null>`. A small fixed-position card next to the tile (style injection pattern from `src/content/toast.ts`, `pca-` class prefix), title "Edit recurring event", three radio-like buttons (series ones disabled with a title attribute when `!canEditSeries`), OK and Cancel. Escape or click outside resolves `null`. Remove the DOM on resolve.
- `drag-handler.ts` / `initDragResponseHandlers`:
  - On `UPDATE_EVENT_NEEDS_SCOPE` for the pending tile: hide the saving toast, `await showScopePicker`. On a scope, resend `UPDATE_EVENT_START` with the same `minutesShift`, `originalTop`, `originalHeight` (store them on the element next to `_pcaDesiredTop`) plus `scope`, and show the saving toast again. On `null`, run the same revert as `UPDATE_EVENT_FAILED` but with no error toast (extract a `revertTile(el, top, height)` helper rather than duplicating).
  - For series scopes the other occurrences on screen won't move until Google re-renders; that is acceptable (same as Google's own lag). Do not try to move other tiles.
- `diagContent('drag', 'info', 'scope chosen', { eventId, scope })`.
- `scope-picker.ts` must be imported only from the event-enhancer content entry, so `check-content-bundles.mjs` stays green. `EditScope` is a type-only import.

## Tests
Unit-test `scope-picker.ts` with jsdom if the repo's Vitest setup supports DOM (check `vitest.config`); otherwise leave coverage to step 6's E2E.
