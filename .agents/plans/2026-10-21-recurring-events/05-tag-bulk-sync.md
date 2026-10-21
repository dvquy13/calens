# 05 · Tag bulk sync: one master PATCH per series

Read [README.md](README.md) first.

## Tracker
- [ ] `src/lib/tag-sync.ts`: group matches by series
- [ ] `TagSyncDialog.tsx`: show "N events (M recurring series)"
- [ ] Caller in `src/components/EventDetailsPanel.tsx` passes the current event's `recurringEventId`
- [ ] Tests in `src/lib/tag-sync.test.ts` (create if missing)
- [ ] typecheck, lint, test green

## Problem
`findMatchingEvents` returns every IndexedDB row with the same title, including each occurrence of recurring series. `bulkUpdateEventTags` then PATCHes each instance's description, which turns every occurrence into an exception detached from later series edits.

## Change
- `findMatchingEvents(summary, calendarId, currentEventId, userEmail, currentSeriesId?)`: also exclude rows whose `recurringEventId === currentSeriesId` (the current series is handled by step 3's tags-to-series).
- New pure helper `groupBySeries(events)` → `{ singles: GoogleCalendarEvent[]; seriesIds: string[] }`.
- `bulkUpdateEventTags`:
  - Singles: unchanged per-event PATCH.
  - Each series: `writeSeriesTags(client, calendarId, seriesId, tags, window)` from `src/lib/recurring/recurring-edit.ts` (a master `description` PATCH overwrites every occurrence's notes, and `writeSeriesTags` restores them; see `docs/google-calendar-dom.md` → "Recurring events"). Build the `RecurringClient` adapter from `createCalendarService().events` (`get`, `update` as `patch`, `insert`, `instances`); if step 3 already added one, reuse it rather than writing a second. Window: 1 year back to 1 year ahead.
  - Keep the 100ms rate limit between the per-single and per-series writes.
  - The caller keeps sending `TRIGGER_SYNC` afterwards, as today.
- `TagSyncDialog`: accept `seriesCount` and render "N events (M recurring series)" when `M > 0`; otherwise keep today's text.

## Tests
`groupBySeries` grouping; current series excluded; bulk update calls `writeSeriesTags` once per series and per-event PATCHes for singles (fake `createCalendarService`).
