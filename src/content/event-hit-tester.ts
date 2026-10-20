/**
 * Hit-test a viewport point against the document's stacking order to find
 * an event element (`[data-eventid]`) at that point. Walks every element
 * returned by `document.elementsFromPoint`, so events visually obscured by
 * other elements still match -- this is desired for drag-handler hit-testing
 * around event edges.
 *
 * Click delegation should NOT use this -- it should use
 * `resolveEventForClick(target)` from `./click-event-resolver`, which
 * naturally short-circuits on portal-rendered overlays.
 */
export function findEventElementAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const elements = document.elementsFromPoint(clientX, clientY);

  for (const el of elements) {
    if (el instanceof HTMLElement && el.getAttribute('data-eventid')) {
      return el;
    }
    const parent = el.closest('[data-eventid]');
    if (parent instanceof HTMLElement) {
      return parent;
    }
  }
  return null;
}
