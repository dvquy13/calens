// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveEventForClick } from './click-event-resolver';

/**
 * Regression: clicking on an overlay (e.g. the calendar-picker dropdown rendered
 * in a portal) must NOT resolve to an event element that happens to be visually
 * behind the overlay. The previous implementation used
 * `document.elementsFromPoint(x, y)` and walked the result list, which returns
 * obscured elements too -- so the click handler would pick up the event behind
 * the dropdown and emit EVENT_SELECTED for an event the user never clicked.
 *
 * The fix: resolve the event from the click `target` (closest ancestor with
 * `data-eventid`). The browser already does proper hit-testing for `target`,
 * so overlays naturally short-circuit.
 */
describe('resolveEventForClick', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the event ancestor when the click target is inside an event subtree', () => {
    const event = document.createElement('div');
    event.setAttribute('data-eventid', 'abc');
    const inner = document.createElement('span');
    inner.textContent = '10am';
    event.appendChild(inner);
    document.body.appendChild(event);

    expect(resolveEventForClick(inner)?.getAttribute('data-eventid')).toBe('abc');
  });

  it('returns the event itself when the click target IS the event element', () => {
    const event = document.createElement('div');
    event.setAttribute('data-eventid', 'abc');
    document.body.appendChild(event);

    expect(resolveEventForClick(event)?.getAttribute('data-eventid')).toBe('abc');
  });

  it('returns null when the click target is in a portal/overlay outside the event subtree, even though an event exists elsewhere in the DOM (the bug)', () => {
    // Simulates: calendar-picker dropdown rendered in a body-level portal,
    // visually covering an event element elsewhere in the calendar grid.
    const eventBehind = document.createElement('div');
    eventBehind.setAttribute('data-eventid', 'work-event-id');
    document.body.appendChild(eventBehind);

    const portal = document.createElement('div'); // sibling of the event
    document.body.appendChild(portal);
    const dropdownOption = document.createElement('div');
    dropdownOption.textContent = 'Work';
    portal.appendChild(dropdownOption);

    expect(resolveEventForClick(dropdownOption)).toBeNull();
  });

  it('returns null when the click target is null', () => {
    expect(resolveEventForClick(null)).toBeNull();
  });

  it('returns null when the click target is not an Element (e.g. text node fallthrough)', () => {
    const text = document.createTextNode('hello');
    document.body.appendChild(text);
    expect(resolveEventForClick(text as unknown as EventTarget)).toBeNull();
  });
});
