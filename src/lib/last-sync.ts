/**
 * Normalise a stored `last_sync` metadata value to an ISO string.
 * Sync writes a Date (structured-cloned into IndexedDB); older/other writers
 * may have stored an ISO string.
 */
export function lastSyncToIso(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}
