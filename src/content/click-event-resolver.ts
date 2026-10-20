/**
 * Resolve the calendar event element for a click target.
 *
 * Uses the click target's ancestor chain rather than `document.elementsFromPoint`,
 * so a click on a portal-rendered overlay (e.g. the calendar-picker dropdown
 * inside the create-event dialog) does NOT resolve to an event element that
 * happens to be visually behind the overlay.
 */
export function resolveEventForClick(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest('[data-eventid]') as HTMLElement | null;
}
