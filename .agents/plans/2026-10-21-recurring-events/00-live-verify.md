# 00 · Live-verify Google's recurring-event behavior

## Tracker
- [x] Create a throwaway weekly series with one modified occurrence on a test calendar
- [x] Confirm a recurring tile's `data-eventid` decodes to the instance ID
- [x] Master PATCH: do existing exceptions inherit the change?
- [x] Master PATCH: does incremental sync (`updatedMin` + `singleEvents`) return the updated instances?
- [ ] Does Google's own top-edge drag show the scope dialog? (skipped: parity note only, no design impact)
- [x] Record findings (dated) in `docs/google-calendar-dom.md` → "Recurring events"

## How
Use the `verify-in-browser` skill (attach to the harness Chrome; never launch Chrome via Playwright for live Google). Decode `data-eventid` in the page with `atob`. Use the extension's token from the side panel context to call the Calendar API for the PATCH/list checks.

## Expected (design assumes, verify)
1. Instance ID format `<seriesId>_<YYYYMMDDTHHMMSSZ>` (all-day: `_<YYYYMMDD>`).
2. and 3. Design does not depend on the answers: step 2's `RESYNC_SERIES` re-fetches instances and step 3 re-patches exceptions whose tags differ. The answers decide only whether those are strictly necessary; document them either way.

## Findings (2026-10-21)
Details in `docs/google-calendar-dom.md` → "Recurring events". The test series was deleted afterwards.
1. `data-eventid` = instance ID `<seriesId>_<UTC YYYYMMDDTHHMMSSZ>`. Design assumption holds.
2. A master `description` PATCH overwrites **every** occurrence's description, even exceptions with their own notes. Fields the master PATCH doesn't touch keep their overrides. **Plan change:** tags-to-series goes through `writeSeriesTags` (step 1), which snapshots occurrences whose notes differ from the master and restores their notes with the new tags afterwards.
3. Incremental sync (`updatedMin` + `singleEvents`) returns every instance after a master PATCH, and after a split (`UNTIL` trimmed) returns the removed occurrences as `cancelled`. **Plan change:** step 2 (`RESYNC_SERIES`) dropped; callers use `TRIGGER_SYNC`.
4. `organizer.self` is `true` on an owned series; `UNTIL=<split − 1s UTC>` PATCH returns 200.
