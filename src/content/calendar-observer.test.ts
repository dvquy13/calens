// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { initCalendarObserver } from './calendar-observer';

/**
 * Regression: the 1s sync debounce must not drop calendars seen earlier in
 * the debounce window.
 *
 * Reproduced live (2026-10-13): quick-create a draft (lands on the primary
 * calendar, `data-eventid` calendar part `someone@m`), switch it to the
 * Produce calendar, click Save. Google renders the saved event block on
 * Produce (`...@g`) and *then* removes the draft dialog, whose `data-eventid`
 * still says `someone@m`. Each mutation batch overwrote the pending target
 * list, so the TRIGGER_SYNC that fired only targeted `someone@m` -- the
 * Produce calendar holding the new event was never synced, and the side
 * panel showed "Event not found".
 */

const encode = (eventId: string, calendarId: string) => btoa(`${eventId} ${calendarId}`);
const flushMutations = () => Promise.resolve();

function addEventNode(encodedId: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-eventid', encodedId);
  document.body.appendChild(el);
  return el;
}

describe('calendar-observer sync trigger', () => {
  const sendMessage = vi.fn();

  // The observer lives on document.body for the whole file, like the real
  // content script; register it once so tests don't stack observers.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    (globalThis as any).chrome = { runtime: { sendMessage } };
    initCalendarObserver();
  });

  // Drain the observer before each test and before jsdom teardown, so no
  // mutation callback fires after the environment's globals are gone.
  const resetDom = async () => {
    document.body.innerHTML = '';
    await flushMutations();
    vi.runOnlyPendingTimers();
    sendMessage.mockClear();
  };

  beforeEach(resetDom);

  afterAll(async () => {
    await resetDom();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('targets the calendar of a newly rendered event', async () => {
    addEventNode(encode('evt1', 'abc123@g'));
    await flushMutations();
    vi.advanceTimersByTime(1000);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0].targetCalendarIds).toEqual(['abc123@g']);
  });

  it('keeps every calendar seen within the debounce window, not just the last batch', async () => {
    const draftDialog = addEventNode(encode('evt1', 'someone@m'));
    await flushMutations();
    vi.advanceTimersByTime(1000);
    sendMessage.mockClear();

    // Saved event block appears on Produce...
    addEventNode(encode('evt1', 'abc123@g'));
    await flushMutations();
    // ...then the draft dialog (still tagged with the primary calendar) is removed.
    vi.advanceTimersByTime(300);
    draftDialog.remove();
    await flushMutations();
    vi.advanceTimersByTime(1000);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0].targetCalendarIds).toEqual(
      expect.arrayContaining(['abc123@g', 'someone@m'])
    );
  });
});
