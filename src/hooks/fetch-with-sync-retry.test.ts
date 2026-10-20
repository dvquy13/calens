// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithSyncRetry } from './fetch-with-sync-retry';

/**
 * Architectural backstop for race conditions in event fetching.
 *
 * When `EVENT_SELECTED` fires for an event that hasn't been synced to
 * IndexedDB yet (newly created event, calendar-change in-flight, etc.),
 * the first GET_EVENT returns "not found". Without retry, the user sees
 * a red error flash. With retry, we wait for SYNC_COMPLETE (or a short
 * timeout) and try once more before reporting an error.
 */
describe('fetchWithSyncRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeSyncSignal() {
    const listeners: Array<() => void> = [];
    return {
      register: (cb: () => void) => {
        listeners.push(cb);
        return () => {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      },
      fire: () => listeners.slice().forEach((l) => l()),
      activeCount: () => listeners.length,
    };
  }

  it('returns the first result when found on the initial fetch (no retry)', async () => {
    const sync = makeSyncSignal();
    const fetchOnce = vi.fn().mockResolvedValue({ found: true, data: { id: 1 } });

    const result = await fetchWithSyncRetry({
      fetchOnce,
      registerSyncListener: sync.register,
      timeoutMs: 1000,
    });

    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ found: true, data: { id: 1 } });
    expect(sync.activeCount()).toBe(0);
  });

  it('retries when first fetch misses, returns the second result if found', async () => {
    const sync = makeSyncSignal();
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce({ found: false })
      .mockResolvedValueOnce({ found: true, data: { id: 2 } });

    const promise = fetchWithSyncRetry({
      fetchOnce,
      registerSyncListener: sync.register,
      timeoutMs: 1000,
    });
    // Let the first fetchOnce resolve and the listener register
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.activeCount()).toBe(1);

    sync.fire();
    const result = await promise;

    expect(fetchOnce).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ found: true, data: { id: 2 } });
    expect(sync.activeCount()).toBe(0);
  });

  it('retries after timeout when sync never fires', async () => {
    const sync = makeSyncSignal();
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce({ found: false })
      .mockResolvedValueOnce({ found: true, data: { id: 3 } });

    const promise = fetchWithSyncRetry({
      fetchOnce,
      registerSyncListener: sync.register,
      timeoutMs: 1500,
    });
    await vi.advanceTimersByTimeAsync(1500);
    const result = await promise;

    expect(fetchOnce).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ found: true, data: { id: 3 } });
    expect(sync.activeCount()).toBe(0);
  });

  it('keeps retrying across multiple SYNC_COMPLETE cycles within the budget (repro: new event queued behind an unrelated sync)', async () => {
    // Regression test for the "Untitled Event / Event not found" bug: a
    // newly created event's sync can be queued behind an already-running
    // sync for a different calendar. The first SYNC_COMPLETE the retry
    // wakes on belongs to that unrelated sync, so the event is still
    // missing on the second fetch. A single-shot retry gave up right
    // there; it must keep waiting for the next SYNC_COMPLETE instead.
    const sync = makeSyncSignal();
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce({ found: false }) // initial fetch, event not synced yet
      .mockResolvedValueOnce({ found: false }) // woken by unrelated calendar's SYNC_COMPLETE
      .mockResolvedValueOnce({ found: true, data: { id: 4 } }); // woken by the real sync

    const promise = fetchWithSyncRetry({
      fetchOnce,
      registerSyncListener: sync.register,
      timeoutMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(0);
    sync.fire(); // unrelated calendar's sync completes first
    await vi.advanceTimersByTimeAsync(0);
    sync.fire(); // the sync carrying the new event completes
    const result = await promise;

    expect(fetchOnce).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ found: true, data: { id: 4 } });
  });

  it('returns not-found when both fetches miss', async () => {
    const sync = makeSyncSignal();
    const fetchOnce = vi.fn().mockResolvedValue({ found: false });

    const promise = fetchWithSyncRetry({
      fetchOnce,
      registerSyncListener: sync.register,
      timeoutMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(fetchOnce).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ found: false });
  });

  it('aborts cleanly between fetches and does not call fetchOnce a second time', async () => {
    const sync = makeSyncSignal();
    const fetchOnce = vi.fn().mockResolvedValue({ found: false });
    const signal = { aborted: false };

    const promise = fetchWithSyncRetry({
      fetchOnce,
      registerSyncListener: sync.register,
      timeoutMs: 1000,
      signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    signal.aborted = true;
    sync.fire(); // wake the wait
    const result = await promise;

    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ aborted: true });
    expect(sync.activeCount()).toBe(0);
  });

  it('returns aborted immediately when signal is already aborted', async () => {
    const sync = makeSyncSignal();
    const fetchOnce = vi.fn();
    const signal = { aborted: true };

    const result = await fetchWithSyncRetry({
      fetchOnce,
      registerSyncListener: sync.register,
      timeoutMs: 1000,
      signal,
    });

    expect(fetchOnce).not.toHaveBeenCalled();
    expect(result).toEqual({ aborted: true });
  });
});
