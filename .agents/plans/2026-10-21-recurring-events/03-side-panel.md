# 03 · Side panel: scope control, tags to the series

Read [README.md](README.md) first, including the "Recurring events" section of `docs/google-calendar-dom.md`. Runs after step 5 (both touch `src/components/EventDetailsPanel.tsx`).

## Tracker
- [ ] Fetch the master when a recurring instance is selected
- [ ] Scope control in `EventWarnings.tsx` replaces the banner
- [ ] Remove the `recurringEventId` gate from `EventHeader.tsx` / `EventForm.tsx`
- [ ] `useEventAutoSave.ts`: scoped writes, tags to the series, re-point after a split
- [ ] Unit tests for the new save logic
- [ ] typecheck, lint, test, build-dev green

## Data
The panel reads the event from IndexedDB (`GET_EVENT` → `transformEventStoreToGoogleEvent` in `src/background/indexeddb-handlers.ts`). Add `originalStartTime` to that transform (from `original_start`; all-day → `{ date }`, else `{ dateTime }`), since `applyRecurringEdit` needs it.

In `EventDetailsPanel.tsx`, when the loaded event has `recurringEventId`, call `createCalendarService().events.get(selectedCalendarId, event.recurringEventId)` once per selection; hold `master` and `scope: EditScope` (default `'this'`) in state; reset both when the selection changes. A failed master fetch shows an error in the existing error UI and leaves only "This event" enabled.

## UI
- `EventWarnings.tsx`: for recurring events, replace the yellow banner with a neutral row: "Recurring event" label plus a segmented control **Apply edits to: This event | This and following | All events** (use existing `src/components/ui` primitives; check what exists before adding any). Series options disabled with a tooltip ("Only the organizer can edit the whole series") when `!canEditSeries(master, accessRole)`. Keep the read-only calendar warning.
- `EventHeader.tsx:58`, `EventForm.tsx:155`: drop `!!event.recurringEventId` from `isReadOnly`.
- Tags input (`EventForm.tsx`): for recurring events show a muted hint under it, "Tags apply to every occurrence".

## Save (`useEventAutoSave.ts`)
New params: `scope`, `master`, `onReselect(encodedId)`.
- Non-recurring events: unchanged.
- Recurring, field `summary | location | description`: `applyRecurringEdit(client, { calendarId, instance: event, scope, buildPatch: () => ({ summary, location, description: mergeTagsIntoDescription(descriptionDraft, tagsDraft) }) })`.
  - With `scope !== 'this'` a description edit replaces the notes of every affected occurrence, including ones with their own notes (Google's own "All events" does the same). That is the user's explicit choice; don't try to preserve them here.
- Recurring, field `tags`: always series-wide, independent of `scope`: `writeSeriesTags(client, calendarId, master.id, tagsDraft, window)` from step 1 (window = 1 year back to 1 year ahead, as in `doInitialSync`). It restores per-occurrence notes that the master PATCH overwrites. Then re-fetch the master into local state.
- The `RecurringClient` adapter here wraps `createCalendarService().events` (`get`, `update` as `patch`, `insert`, `instances`).
- After any write: the existing `chrome.runtime.sendMessage({ type: MessageType.TRIGGER_SYNC })` (incremental sync picks up master PATCHes, new series and split-off occurrences; see step 0).
- After a `following` split with `newInstanceId`: call `onReselect(encodeEventId(newInstanceId, shortCalendarId))`, where `shortCalendarId` comes from `decodeEventId(eventId)`. `EventDetailsPanel` passes a callback that updates the selected ID (find where `Sidepanel.tsx` holds `selectedEventId` and thread a setter). Later "This and following" saves then hit the first-occurrence rule, which is correct.
- `diag('edit', 'info', 'recurring save', { eventId, seriesId, scope })` via `lib/diag-panel.ts`. No titles.

## Tests
Extract the scope/tags decision into a pure function if that makes it testable without React; test: tags always go through `writeSeriesTags`; scope `this` patches the instance; `following` triggers `onReselect` with the re-encoded ID.
