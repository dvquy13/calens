import { describe, it, expect, vi } from 'vitest';

import { handleGetEvent, handleGetLastSyncTime } from './indexeddb-handlers';

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

describe('handleGetEvent originalStartTime', () => {
  const base = {
    id: 'series1_20261026T090000Z',
    summary: 'Standup',
    start: new Date('2026-10-26T09:00:00Z'),
    end: new Date('2026-10-26T09:30:00Z'),
    isAllDay: false,
    calendar_id: 'me@example.com',
  };

  async function getEvent(store: Record<string, unknown>) {
    const db = { getEvent: vi.fn(async () => ({ ...base, ...store })) };
    let response: { data: { event: { originalStartTime?: unknown } } } | undefined;
    await handleGetEvent({ eventId: base.id }, (r) => (response = r), db as never);
    if (!response) throw new Error('handleGetEvent sent no response');
    return response.data.event;
  }

  it('maps original_start of a timed instance to originalStartTime.dateTime', async () => {
    const event = await getEvent({
      recurringEventId: 'series1',
      original_start: new Date('2026-10-26T09:00:00Z'),
    });
    expect(event.originalStartTime).toEqual({ dateTime: '2026-10-26T09:00:00.000Z' });
  });

  it('maps original_start of an all-day instance to originalStartTime.date', async () => {
    const event = await getEvent({
      isAllDay: true,
      recurringEventId: 'series1',
      original_start: new Date('2026-10-26T00:00:00Z'),
    });
    expect(event.originalStartTime).toEqual({ date: '2026-10-26' });
  });

  it('leaves originalStartTime undefined for a non-recurring event', async () => {
    const event = await getEvent({});
    expect(event.originalStartTime).toBeUndefined();
  });
});
