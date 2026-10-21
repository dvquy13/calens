# Recurring event support

## Tracker

Branch: `feat/recurring-events`. Lead: the main agent. Implementers: Haiku subagents, one step file each.

| # | Step | Plan file | Owner | Depends on | Status |
|---|------|-----------|-------|------------|--------|
| 0 | Live-verify Google's recurring-event behavior, record it in `docs/google-calendar-dom.md` | [00-live-verify.md](00-live-verify.md) | lead | none | ✅ 2026-10-21 |
| 1 | Core: RRULE split + `applyRecurringEdit` + `writeSeriesTags` + client `insert`/`instances` | [01-core.md](01-core.md) | haiku | 0 | ✅ 2026-10-21 |
| 2 | ~~Sync: `RESYNC_SERIES`~~ dropped: step 0 showed incremental sync already returns split-off occurrences as `cancelled` | [02-resync-series.md](02-resync-series.md) | n/a | n/a | ❌ dropped |
| 3 | Side panel: "Apply edits to" scope control, tags go to the series | [03-side-panel.md](03-side-panel.md) | haiku | 1, 5 | ⬜ |
| 4 | Drag: in-page scope picker for recurring tiles | [04-drag-scope-picker.md](04-drag-scope-picker.md) | haiku | 1 | ⬜ |
| 5 | Tag bulk sync: one `writeSeriesTags` per series | [05-tag-bulk-sync.md](05-tag-bulk-sync.md) | haiku | 1 | ✅ 2026-10-21 |
| 6 | E2E spec, docs, gates, live check | [06-tests-docs.md](06-tests-docs.md) | haiku + lead | 3, 4, 5 | ⬜ |

Parallelism: after step 1, steps 4 and 5 touch separate files and run together. Step 3 runs after 5 because both touch `src/components/EventDetailsPanel.tsx`. After every recurring write, callers send the existing `TRIGGER_SYNC` (with `targetCalendarIds`); live facts in `docs/google-calendar-dom.md` ("Recurring events") show incremental sync picks up master PATCHes, new series and split-off occurrences.

## Context

Calens blocks editing of recurring events:
- `src/components/event-details/EventHeader.tsx:58` and `EventForm.tsx:155` set `isReadOnly` when `event.recurringEventId` is set.
- `EventWarnings.tsx:20` shows "Editing recurring events is not supported yet."

Analytics already work. Every sync uses `singleEvents: true`, so IndexedDB stores instances only (with `recurringEventId` and `original_start`), never the master or its RRULE.

Two write paths ignore recurrence and misbehave:
- **Drag the top edge** (`src/content/drag-handler.ts` → `src/background/event-update-handler.ts`) silently PATCHes the single instance, with no scope choice.
- **Tag bulk sync** (`src/lib/tag-sync.ts`) PATCHes every same-title instance one by one, turning each occurrence into an exception detached from future series edits.

## Decisions (2026-10-21)

- Side panel offers all three scopes, like Google: **This event / This and following / All events**. Default: This event.
- **Tags always apply to the series** (the master's description front-matter), whatever the chosen scope. Because a master `description` PATCH overwrites every occurrence's description (verified 2026-10-21), tags are written with `writeSeriesTags`, which restores per-occurrence notes afterwards.
- **Drag** shows an in-page scope picker with the same three options; Cancel reverts the tile.
- Series scopes require `calendar.accessRole ∈ {writer, owner}` and `master.organizer.self === true`. Otherwise only "This event" is enabled.
- No `sendUpdates` param on any write (same as today): guests are not emailed.
- "This and following" on the first occurrence is treated as "All events".
- A split drops modified occurrences after the split point (RRULE semantics).

## Shared interfaces (defined in step 1, used by 2–5)

```ts
// src/lib/recurring/recurring-edit.ts
export type EditScope = 'this' | 'following' | 'all';
export interface RecurringClient {
  get(calendarId: string, eventId: string): Promise<GoogleCalendarEvent>;
  patch(calendarId: string, eventId: string, body: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent>;
  insert(calendarId: string, body: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent>;
  instances(calendarId: string, seriesId: string, params?: { timeMin?: string; timeMax?: string; maxResults?: number; showDeleted?: boolean }): Promise<GoogleCalendarEvent[]>;
}
export function applyRecurringEdit(client: RecurringClient, args: {
  calendarId: string;
  instance: GoogleCalendarEvent;          // must have recurringEventId + originalStartTime
  scope: EditScope;
  buildPatch: (base: GoogleCalendarEvent) => Partial<GoogleCalendarEvent>;
}): Promise<{ affectedSeriesIds: string[]; newInstanceId?: string }>;
export function canEditSeries(master: GoogleCalendarEvent, accessRole?: string): boolean;
// Writes tags to the master, then re-PATCHes occurrences whose notes differed (the master PATCH overwrites them).
export function writeSeriesTags(client: RecurringClient, calendarId: string, seriesId: string, tagsInput: string,
  window: { timeMin: string; timeMax: string }): Promise<{ restoredInstanceIds: string[] }>;

// src/lib/message-types.ts
MessageType.UPDATE_EVENT_NEEDS_SCOPE // bg → tab: { eventId: string; canEditSeries: boolean }
```

## Project rules every step must follow

- Read `CLAUDE.md`. Gates: `npm run typecheck` and `npm run lint` at 0 errors; `npm run test` green.
- Log through `diag()` (SW: `lib/diag-log.ts`; panel: `lib/diag-panel.ts`; content: `content/diag.ts`). Never put titles, emails or tokens in `msg`.
- `src/lib/google-auth.ts` is side-panel only (it imports `diag-panel`). Do not import it from the service worker or content scripts.
- Content scripts are not ES modules; `npm run build-dev` ends with `scripts/check-content-bundles.mjs`, which must pass.
- Match surrounding code style. Do not commit; the lead reviews and commits.
