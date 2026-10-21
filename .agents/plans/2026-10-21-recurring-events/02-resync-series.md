# 02 · Sync: `RESYNC_SERIES` (dropped)

Dropped on 2026-10-21 after step 0. The worry was that a "This and following" split would leave orphan rows that incremental sync never hears about. Live verification showed the opposite: after trimming a master's `UNTIL`, `events.list?singleEvents=true&updatedMin=…` returns the removed occurrences with `status: "cancelled"`, and `_doIncrementalSync` already deletes cancelled rows. Master PATCHes and newly inserted series show up the same way. Callers send the existing `TRIGGER_SYNC` with `targetCalendarIds`.
