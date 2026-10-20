/**
 * Deferred selection for events that have a Google dialog open.
 *
 * Google's Create dialog and event details popover carry the event's
 * `data-eventid` inside `[role="dialog"]`. Selecting on clicks there (the
 * title field, Save, or the draft block itself while drafting) pointed the
 * side panel at an unsaved draft, which showed "Event not found" once the
 * retry budget ran out.
 *
 * Instead, hold the selection until the dialog closes. Observed live: on Save
 * the event block stays on the grid when the dialog closes; on Discard Google
 * removes the block *before* the dialog. So "block still present when the
 * dialog closes" means saved — select it; otherwise drop it.
 *
 * Bundled into event-enhancer by Vite (sibling import).
 */

const DIALOG_SELECTOR = '[role="dialog"]';

let pending: { eventId: string; observer: MutationObserver } | null = null;

function eventIdOf(element: Element): string | null {
  const encoded = element.getAttribute('data-eventid');
  if (!encoded) return null;
  try {
    return atob(encoded).split(' ')[0];
  } catch {
    return null;
  }
}

function elementsForEvent(eventId: string): Element[] {
  return Array.from(document.querySelectorAll('[data-eventid]')).filter((el) => eventIdOf(el) === eventId);
}

function hasOpenDialog(eventId: string): boolean {
  return elementsForEvent(eventId).some((el) => el.closest(DIALOG_SELECTOR));
}

/** True when the event element is part of a dialog (Create dialog, details popover, its menus). */
export function isInDialog(eventElement: Element): boolean {
  return eventElement.closest(DIALOG_SELECTOR) !== null;
}

/**
 * True when the event already has a dialog open (e.g. the draft block while
 * drafting). Check this at pointerdown, not click: Google opens or retargets
 * its details popover during the click, so by click time every event looks
 * like it has one.
 */
export function eventHasOpenDialog(eventElement: Element): boolean {
  const eventId = eventIdOf(eventElement);
  return eventId !== null && hasOpenDialog(eventId);
}

/** Drop any deferred selection (a newer, direct selection wins). */
export function cancelDeferredSelection(): void {
  pending?.observer.disconnect();
  pending = null;
}

/**
 * Select the event once its dialog closes, if its block is still on the grid.
 * `select` receives that block's `data-eventid` (its calendar part reflects
 * the calendar the event was saved to).
 */
export function selectWhenDialogCloses(eventElement: Element, select: (encodedEventId: string) => void): void {
  const eventId = eventIdOf(eventElement);
  if (!eventId || pending?.eventId === eventId) return;

  cancelDeferredSelection();
  const observer = new MutationObserver(() => {
    const elements = elementsForEvent(eventId);
    if (elements.some((el) => el.closest(DIALOG_SELECTOR))) return;

    cancelDeferredSelection();
    const block = elements[0];
    if (block) select(block.getAttribute('data-eventid')!);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-eventid', 'role'],
  });
  pending = { eventId, observer };
}
