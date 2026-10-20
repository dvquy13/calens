/**
 * Builders for Google Calendar DOM, returned as plain HTML strings so they can
 * be injected through `page.evaluate`. Single place to update when
 * docs/google-calendar-dom.md changes.
 */

/** Google's short calendar form: user@gmail.com -> user@m, x@group.calendar.google.com -> x@g. See docs/google-calendar-dom.md "Event IDs". */
export function shortCalendarId(fullCalendarId: string): string {
  const [local, domain] = fullCalendarId.split('@');
  if (domain === 'gmail.com') return `${local}@m`;
  if (domain === 'group.calendar.google.com') return `${local}@g`;
  throw new Error(`shortCalendarId: abbreviation for "${domain}" is not verified (docs/google-calendar-dom.md)`);
}

/** data-eventid value: base64("<eventId> <calendarId>") with the calendar already in short form. See docs/google-calendar-dom.md "Event IDs". */
export function encodeEventId(eventId: string, shortCalendar: string): string {
  return Buffer.from(`${eventId} ${shortCalendar}`).toString('base64');
}

/** Event chip: div[role=button][data-eventchip][data-eventid], sized to be clickable. See docs/google-calendar-dom.md "Grid structure". */
export function eventBlockHtml(opts: { id?: string; encodedEventId: string; label: string; style?: string }): string {
  const id = opts.id ? ` id="${opts.id}"` : '';
  const style = opts.style ?? 'width:100px;height:20px;';
  return (
    `<div${id} role="button" data-eventchip data-opens-details="true" tabindex="0" ` +
    `data-eventid="${opts.encodedEventId}" data-focusable="true" style="${style}">${opts.label}</div>`
  );
}

/** Quick-create dialog (ids: create-dialog, title, save): [role=dialog] with inner data-eventid div, title input, Save and Close. See docs/google-calendar-dom.md "Create (quick-create) flow". */
export function createDialogHtml(opts: { encodedEventId: string }): string {
  return (
    `<div id="create-dialog" role="dialog">` +
    `<div data-eventid="${opts.encodedEventId}" data-default-tab="event" data-origin="grid">` +
    `<input id="title" aria-label="Add title" />` +
    `<div role="combobox" aria-label="Calendar"></div>` +
    `<button id="save">Save</button>` +
    `<button aria-label="Close">x</button>` +
    `</div></div>`
  );
}

/** Existing-event details popover (id: popover): [role=dialog] with data-eventid descendant, Edit and Delete buttons. See docs/google-calendar-dom.md "Existing event details popover". */
export function detailsPopoverHtml(opts: { encodedEventId: string }): string {
  return (
    `<div id="popover" role="dialog">` +
    `<div data-eventid="${opts.encodedEventId}" data-keyboardactiontype="1" data-open-edit-note="true">` +
    `<button>Edit event</button>` +
    `<button aria-label="Delete event">Delete</button>` +
    `</div></div>`
  );
}
