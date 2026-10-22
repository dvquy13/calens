# 06 · E2E, docs, gates, live check

Read [README.md](README.md) first. Read `.claude/rules/e2e-testing.md` before touching `e2e/`.

## Tracker
- [x] `e2e/recurring-edit.spec.ts` with an in-memory Calendar API mock (7 cases, 2026-10-21)
- [x] `docs/patterns-and-decisions.md`: "Recurring events" section (2026-10-21)
- [x] `docs/google-calendar-dom.md`: step 0 findings (lead, 2026-10-21)
- [x] Gates: typecheck, lint, test, test:e2e, build-dev
- [x] Live check with `verify-in-browser` (lead, 2026-10-21: panel scopes, tags with own-notes restore, COUNT split + reselect, no double count, drag picker + All events; test series deleted)

## E2E
Mock `https://www.googleapis.com/calendar/v3/**` with `context.route()`: an in-memory store holding one weekly master (`organizer.self: true`, `recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO']`) and its instances, handling GET event, PATCH event, POST insert, GET instances, list. Record every request for assertions. Seed IndexedDB with the instances via `seedExtensionState` (`e2e/fixtures/harness.ts`); build tiles with `eventBlockHtml`/`encodeEventId` from `e2e/fixtures/gcal-dom.ts` using instance IDs.

Cases:
1. Selecting a recurring tile shows the scope control; no "not supported" text.
2. Edit location with "This event" → PATCH on the instance ID.
3. Edit location with "All events" → GET + PATCH on the master ID.
4. "This and following" on the 3rd occurrence → master PATCH with `UNTIL`, POST with the new RRULE.
5. Edit tags → PATCH on the master's description; an occurrence with its own notes is PATCHed afterwards with those notes plus the new tags.
6. Drag a recurring tile → picker appears; Cancel → tile back at its original top, no PATCH; "All events" → master PATCH of `start`.
7. Drag a non-recurring tile → no picker (regression).

## Docs (`docs/patterns-and-decisions.md`, new "Recurring events" section)
Scope semantics and the first-occurrence rule; tags are series-wide and why; split drops later exceptions; no guest emails (`sendUpdates` unset); why plain `TRIGGER_SYNC` is enough after series writes (split-off occurrences come back as `cancelled`); tags-to-series restores per-occurrence notes because a master description PATCH overwrites them; series scopes require `organizer.self`.

## Live (lead)
On a throwaway weekly series: each panel scope, confirmed in Google's UI; a split, then Calendar Progress shows no double-counted hours; drag with each scope; tag one occurrence and confirm all carry it. Delete the test series afterwards.
