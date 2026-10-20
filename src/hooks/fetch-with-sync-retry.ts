/**
 * Fetch with one retry triggered by either a sync-complete signal or a timeout.
 *
 * This is the backstop for race conditions where `EVENT_SELECTED` fires for an
 * event that hasn't been written to IndexedDB yet (newly created event,
 * mid-flight calendar change, observer miss). Without it, the user sees a
 * red "Event not found" error flash whenever the side panel opens slightly
 * before sync catches up.
 */

export interface FetchOutcome<T> {
  found: boolean;
  data?: T;
  error?: string;
}

export interface AbortFlag {
  aborted: boolean;
}

export interface FetchWithSyncRetryOptions<T> {
  fetchOnce: () => Promise<FetchOutcome<T>>;
  registerSyncListener: (callback: () => void) => () => void;
  timeoutMs: number;
  signal?: AbortFlag;
}

export type FetchWithSyncRetryResult<T> = FetchOutcome<T> | { aborted: true };

export async function fetchWithSyncRetry<T>(
  opts: FetchWithSyncRetryOptions<T>
): Promise<FetchWithSyncRetryResult<T>> {
  if (opts.signal?.aborted) return { aborted: true };

  let outcome = await opts.fetchOnce();
  if (opts.signal?.aborted) return { aborted: true };
  if (outcome.found) return outcome;

  // A single retry isn't enough when the event's sync takes more than one
  // SYNC_COMPLETE cycle to land (e.g. it's queued behind another in-flight
  // sync, or the calendar-change debounce fires a second sync for a
  // different calendar first). Keep retrying on every SYNC_COMPLETE until
  // the event is found or the overall budget runs out.
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    await waitForSyncOrTimeout(opts.registerSyncListener, deadline - Date.now());

    if (opts.signal?.aborted) return { aborted: true };
    outcome = await opts.fetchOnce();
    if (opts.signal?.aborted) return { aborted: true };
    if (outcome.found) return outcome;
  }

  return outcome;
}

function waitForSyncOrTimeout(
  registerSyncListener: (cb: () => void) => () => void,
  timeoutMs: number
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      unregister();
      clearTimeout(timer);
      resolve();
    };
    const unregister = registerSyncListener(settle);
    const timer = setTimeout(settle, timeoutMs);
  });
}
