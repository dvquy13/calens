# 01 · Core: RRULE split + `applyRecurringEdit`

Read [README.md](README.md) first (shared interfaces, rules).

## Tracker
- [x] Extend `GoogleCalendarEvent` (`src/types/calendar.ts`)
- [x] `src/lib/recurring/rrule-split.ts` + `rrule-split.test.ts`
- [x] `src/lib/recurring/recurring-edit.ts` + `recurring-edit.test.ts`
- [x] `events.insert` and `events.instances` in `src/lib/google-auth.ts`
- [x] `encodeEventId` in `src/lib/event-id-utils.ts` (+ test)
- [x] Add `UPDATE_EVENT_NEEDS_SCOPE` to `src/lib/message-types.ts` (`RESYNC_SERIES` dropped after step 0)
- [x] `writeSeriesTags` in `recurring-edit.ts` + tests (added after step 0)
- [x] typecheck, lint, test green

## 1. Types
In `GoogleCalendarEvent` add: `originalStartTime?: { dateTime?: string; date?: string; timeZone?: string }`, `organizer.self?: boolean`, `creator.self?: boolean`, `colorId?`, `visibility?`, `transparency?`, `guestsCanModify?`.

## 2. `rrule-split.ts` (pure)
```ts
export function splitRecurrence(
  recurrence: string[],     // master.recurrence: lines like "RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;TZID=...:20261102T090000"
  splitAt: Date,            // the instance's original start
  isAllDay: boolean,
  countBefore?: number,     // occurrences generated before splitAt (only needed if a RRULE has COUNT)
): { oldRecurrence: string[]; newRecurrence: string[] }
```
- Old series, each `RRULE:` line: remove `COUNT` and any `UNTIL`, set `UNTIL` = `splitAt − 1s` formatted UTC `YYYYMMDDTHHMMSSZ`; for all-day, `UNTIL=YYYYMMDD` of the day before `splitAt`.
- New series, each `RRULE:` line: keep the original `UNTIL` if any; if it had `COUNT=n`, set `COUNT=n − countBefore` (throw if `countBefore` missing or result < 1).
- `EXDATE`/`RDATE` lines: parse their date list (with or without `TZID=` / `VALUE=DATE` params, comma-separated values); values before `splitAt` stay in old, the rest go to new; drop lines that end up empty. Parse TZID-local values by comparing on the wall-clock string against `splitAt` expressed in that same form is error-prone: instead convert using `Intl.DateTimeFormat` with the TZID. Keep a helper `parseIcalDate(value, tzid?)`.
- Unknown lines pass through to both.

Tests: weekly with UNTIL; with COUNT; EXDATE on both sides; TZID EXDATE; all-day; `BYDAY=MO,WE,FR`; malformed COUNT → throws.

## 3. `recurring-edit.ts`
Implements the README interface.
- `this`: `client.patch(calendarId, instance.id, buildPatch(instance))`; `affectedSeriesIds: []`.
- `all`: `master = client.get(calendarId, instance.recurringEventId)`; `client.patch(calendarId, master.id, buildPatch(master))`; `affectedSeriesIds: [master.id]`.
- `following`:
  1. `master = get(...)`. If the instance's `originalStartTime` equals `master.start` (compare as instants; all-day compare dates), delegate to `all`.
  2. If any RRULE has `COUNT`: `countBefore = (await client.instances(calendarId, master.id, { timeMax: splitAt ISO, showDeleted: true })).length`.
  3. `splitRecurrence(...)`; `client.patch(calendarId, master.id, { recurrence: oldRecurrence })`.
  4. Build the new series body from the master: copy `summary, description, location, attendees, reminders, colorId, visibility, transparency, guestsCanModify` (not `id`, `iCalUID`, `etag`, `conferenceData`, `recurringEventId`). `start` = instance's original start (keep master's `timeZone`); `end` = start + master duration (all-day: date arithmetic). `recurrence` = `newRecurrence`. Then `body = { ...body, ...buildPatch(body) }`.
  5. `created = client.insert(calendarId, body)`; `newInstanceId = (await client.instances(calendarId, created.id, { timeMin: start ISO, maxResults: 1 }))[0]?.id`.
  6. Return `{ affectedSeriesIds: [master.id, created.id], newInstanceId }`.
- `canEditSeries(master, accessRole)`: `['writer','owner'].includes(accessRole ?? '') && master.organizer?.self === true`.
- No diag logging inside the core (it runs in both contexts); callers log.

Tests with a fake in-memory client: assert the exact call sequence and bodies per scope, the first-occurrence delegation, COUNT path calls `instances` with `showDeleted`, and `buildPatch` receives the right base each time.

## 4. Client methods (`google-auth.ts`, inside `events`)
- `insert(calendarId, body)`: `POST .../calendars/{cal}/events`.
- `instances(calendarId, eventId, params)`: `GET .../events/{id}/instances` with params; follow `nextPageToken` until done; return `items`.
- Match the existing `get`/`update` style, including `diag('api', 'error', ...)` on failure with `endpoint: 'events.insert' | 'events.instances'`.

## 5. `encodeEventId(eventId, shortCalendarId)`
Inverse of `decodeEventId` in `src/lib/event-id-utils.ts` (`btoa(`${eventId} ${shortCalendarId}`)`, same padding conventions as the decoder expects). Round-trip test.
