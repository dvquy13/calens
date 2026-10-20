import { describe, it, expect, vi } from 'vitest';

import { handleGetLastSyncTime } from './indexeddb-handlers';

function run(metadata: { key: string; value: unknown }[]) {
  const sendResponse = vi.fn();
  const db = { getAllUserMetadata: vi.fn().mockResolvedValue(metadata) };
  return handleGetLastSyncTime({ userEmail: 'u@x.com' }, sendResponse, db as never).then(() => sendResponse.mock.calls[0][0]);
}

describe('handleGetLastSyncTime', () => {
  it('returns the newest last_sync when stored as Date objects (as sync writes them)', async () => {
    const res = await run([
      { key: 'last_sync_a', value: { last_sync: new Date('2026-01-01T00:00:00Z') } },
      { key: 'last_sync_b', value: { last_sync: new Date('2026-03-01T12:00:00Z') } },
      { key: 'last_full_sync', value: { last_sync: new Date('2030-01-01T00:00:00Z') } },
    ]);
    expect(res).toEqual({ success: true, data: '2026-03-01T12:00:00.000Z' });
  });

  it('still handles ISO strings and returns null when nothing synced', async () => {
    expect((await run([{ key: 'last_sync_a', value: { last_sync: '2026-02-01T00:00:00.000Z' } }])).data).toBe('2026-02-01T00:00:00.000Z');
    expect((await run([])).data).toBeNull();
  });
});
