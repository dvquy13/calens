# Google Calendar DOM Reference

Live-verified facts about calendar.google.com's undocumented DOM. Google can change any of this without notice, so each fact carries the date and method it was verified. E2E fixtures mirror this doc through `e2e/fixtures/gcal-dom.ts`, the single place to update when this doc changes.

All facts below: **verified live 2026-10-13**, week view, 1300x900 viewport, signed-in Chrome driven by `npm run agent:browser`, inspected with `eval calendar "<js>"` (DOM queries and a MutationObserver for timings), unless marked otherwise.

## Event IDs (`data-eventid`)

- Value is `base64("<eventId> <calendarId>")`, but the calendar part is abbreviated: `user@gmail.com` becomes `user@m`; `x@group.calendar.google.com` becomes `x@g`.
- The Calendar API returns 404 for the short forms and 200 for full IDs. Calens expands them with `resolveCalendarId()` in `src/lib/event-id-utils.ts` (match on the part before `@` against stored calendars).
- Holiday calendars (`...@group.v.calendar.google.com`) are expected to shorten similarly. **Unverified.**

## Grid structure

- Event block: `div[role="button"][data-eventchip][data-eventid]` inside a `[role="gridcell"]`. Attributes seen: `role`, `data-eventchip`, `data-opens-details`, `tabindex`, `data-eventid`, `data-focusable`, `jscontroller`, `jslog`, `data-dragsource-type`, `class`, `style`. `innerText` starts `HH:MM to HH:MM, <title>, <calendar name>, ...`.
- Time text (read by drag, parsed by `extractStartTime()` in `src/content/time-parser.ts`): `div.gVNoLb` (classes seen `lhydbb gVNoLb EiZ8Dd TuM9nf`) inside `div.fFwDnf` > `div.Jcb6qd` > chip. Separator is U+2013 with ASCII spaces.
  - 24h (verified live 2026-10-19, 15 chips over 10 weeks): `HH:MM – HH:MM`, hours zero-padded (`09:00 – 10:30`, `00:45 – 02:30`).
  - 12h (verified live 2026-10-19 by switching Settings > Time format to `1:00pm` and back; first seen in user report `y0HcwDYJZGE8TmQpRv7T`): `4 – 5:45am`, `12:45 – 2:30am`, `10 – 11:45pm`, i.e. `:00` dropped, hours not padded, lowercase meridiem, and the start's meridiem dropped when it matches the end's. Older code comments also cite `5:30 PM – 9:00 PM` and `9am – 12pm` (unverified).
- Day column: `[role="gridcell"]` with `aria-label` like `No events, Thursday, October 15` or `1 event, Tuesday, October 13 ...`. The timed column spans 24h (height far above 300px); separate all-day gridcells have height 0.

## Create (quick-create) flow

- Clicking an empty slot creates a draft block on the grid (text `(No title)`, `data-eventid` on the DEFAULT calendar, e.g. `user@m`) and opens the quick-create dialog.
- Dialog is `[role="dialog"]`. A descendant div carries the draft's `data-eventid` (attrs: `jsname`, `jscontroller`, `jsmodel`, `jsaction`, `jslog`, `data-eventid`, `data-loggingid`, `data-default-tab`, `data-origin`).
- Controls: title `input[aria-label="Add title"]`, Save button text `Save`, close `[aria-label="Close"]`. Closing with a typed title shows a "Discard" confirmation.
- The draft's event ID is stable: the saved event keeps it (no temporary ID).
- Switching the draft's calendar changes the calendar part of the GRID block's `data-eventid` (e.g. to `...@g`), while the dialog's `data-eventid` keeps the original calendar.
- Calendar picker: clicking the calendar name text in the dialog already opens the `[role="combobox"][aria-label="Calendar"]` list (`[role="option"]` per calendar); clicking the combobox again closes it.
- Quick-create hydration (2026-10-13): the dialog first paints as a shell; ~300ms after opening Google sets `aria-modal="true"` and swaps in the real children, then keeps patching attributes (date/time inputs etc.) until ~650ms. Mutation bursts are separated by gaps of up to ~200ms. Filling the title input before that makes the swap drop its focus and the dialog closes by itself. Harness waits for `aria-modal="true"` + "Add title" input + 250ms with no subtree mutations (MutationObserver), then verifies the dialog is still connected and holds the title.
- Delete (2026-10-13): the block disappears optimistically; a `POST /calendar/u/0/sync.sync` (~0.8s) then runs while the live region says "Deleting...", ending with "Event deleted". Reloading before it finishes cancels the delete. Wait for that response.
- A stray typed title with no focused input triggers Calendar hotkeys (e.g. `n` = next week); a failed fill once left the tab on the next week.
- Opening/closing the Calens side panel animates the tab's `innerWidth` (1470 -> 956px, ~20 resize events over ~400ms, starting when the panel target appears). Calendar re-lays-out the grid on each.
- Timings: after Save the block re-renders (~150ms) and the dialog is removed ~450ms after Save with the block still present. On Discard/Escape the block is removed FIRST, the dialog ~300ms later.

## Existing event details popover

- Inside `[role="dialog"]`, a descendant with `data-eventid` (attrs include `data-keyboardactiontype`, `data-open-edit-note`). Buttons: "Edit event" and `[aria-label="Delete event"]`. Overflow menu items: `li[role="menuitem"][data-eventid]` ("Copy to <calendar>").
- Google opens or retargets the popover during the click itself: by the time a bubble-phase click handler runs, the clicked event already has a dialog if another event's popover was open. Calens therefore decides selection deferral at `pointerdown` (`src/content/event-enhancer.ts`, `src/content/dialog-selection.ts`).

## Recurring events

Verified live 2026-10-21 on a throwaway weekly series (`RRULE:FREQ=WEEKLY;COUNT=6`, owned calendar), API calls made from the service worker with the extension's token.

- A recurring tile's `data-eventid` decodes to the **instance** ID, `<seriesId>_<UTC YYYYMMDDTHHMMSSZ>` (e.g. `cc0j…djc_20261021T090000Z <cal>@g`), never the series ID. The suffix is the occurrence's original start in UTC.
- Calendar API facts that Calens' recurring writes depend on (not DOM, recorded here because they were verified together):
  - The master of a series you own has `organizer.self: true`.
  - PATCHing the master's `description` overwrites the description of **every** occurrence, including exceptions that had their own description. Fields the master PATCH doesn't touch (e.g. an exception's `location`) keep their overrides.
  - After a master PATCH, `events.list?singleEvents=true&updatedMin=<before>` returns every instance with the new `updated`.
  - PATCHing the master's `recurrence` to end earlier (`UNTIL=<split − 1s, UTC>`) succeeds, and the occurrences it removes come back from the same `updatedMin` list as `status: "cancelled"` (with or without `showDeleted`). Incremental sync therefore deletes them by itself.
- **Unverified:** whether Google's own drag of a recurring event shows the "This event / This and following / All events" dialog.

## Update behavior after API writes

Google does not re-render after external API updates; it updates attributes (mostly `style`) in place rather than replacing elements, and only on user interaction, resize or view change. Verified 2025-11-28 with a MutationObserver. Details and the resulting decision: `patterns-and-decisions.md`, "Google Calendar Sync Behavior".

## How to re-verify

Use the `verify-in-browser` skill, or directly:

```bash
npm run agent:browser -- eval calendar "document.querySelectorAll('[data-eventchip]').length"
```

Re-check first: the `@m`/`@g` abbreviations, the dialog's `data-eventid` placement, and the Save/Discard removal order. Then update this doc (dates included) and `e2e/fixtures/gcal-dom.ts`.
