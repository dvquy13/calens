// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findEventElementAtPoint } from './event-hit-tester';

/**
 * Hit-tests an (x, y) point against the document's stacking order to find
 * the topmost-or-obscured event element. This is intentionally different from
 * `resolveEventForClick`: drag handlers operate on screen coordinates and
 * legitimately need to find events even when the user's pointer is just
 * adjacent to one.
 */
describe('findEventElementAtPoint', () => {
  let originalElementsFromPoint: any;

  beforeEach(() => {
    originalElementsFromPoint = (document as any).elementsFromPoint;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    (document as any).elementsFromPoint = originalElementsFromPoint;
  });

  function stubElementsFromPoint(elements: Element[]) {
    (document as any).elementsFromPoint = () => elements;
  }

  it('returns the topmost element with data-eventid', () => {
    const event = document.createElement('div');
    event.setAttribute('data-eventid', 'abc');
    stubElementsFromPoint([event]);

    expect(findEventElementAtPoint(10, 10)?.getAttribute('data-eventid')).toBe('abc');
  });

  it('walks up to an event ancestor when the topmost element has none', () => {
    const event = document.createElement('div');
    event.setAttribute('data-eventid', 'abc');
    const inner = document.createElement('span');
    event.appendChild(inner);
    stubElementsFromPoint([inner]);

    expect(findEventElementAtPoint(10, 10)?.getAttribute('data-eventid')).toBe('abc');
  });

  it('returns an event behind a non-event element (drag-handler hit-test semantics)', () => {
    // Drag handler may pick up an event under the cursor even if the cursor
    // is technically over a transparent overlay. This is desired for drag.
    const overlay = document.createElement('div');
    const event = document.createElement('div');
    event.setAttribute('data-eventid', 'abc');
    stubElementsFromPoint([overlay, event]);

    expect(findEventElementAtPoint(10, 10)?.getAttribute('data-eventid')).toBe('abc');
  });

  it('returns null when no element at the point has an event ancestor', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    stubElementsFromPoint([a, b]);

    expect(findEventElementAtPoint(10, 10)).toBeNull();
  });
});
