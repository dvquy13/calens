import { describe, it, expect, vi } from 'vitest';
import { toRecurringClient, syncWindow, type CalendarEventsClient } from './panel-client';

function fakeEvents() {
  return {
    get: vi.fn(async () => ({ id: 'series1' })),
    update: vi.fn(async (_c: string, id: string, body: Record<string, unknown>) => ({ id, ...body })),
    insert: vi.fn(async (_c: string, body: Record<string, unknown>) => ({ id: 'new', ...body })),
    instances: vi.fn(async () => [{ id: 'series1_a' }]),
  };
}

describe('toRecurringClient', () => {
  it('maps patch to events.update and forwards the other calls unchanged', async () => {
    const events = fakeEvents();
    const client = toRecurringClient(events as unknown as CalendarEventsClient);

    await client.get('cal', 'series1');
    await client.patch('cal', 'series1', { description: 'x' });
    await client.insert('cal', { summary: 'New' });
    const params = { timeMin: 'a', timeMax: 'b', showDeleted: true };
    await client.instances('cal', 'series1', params);

    expect(events.get).toHaveBeenCalledWith('cal', 'series1');
    expect(events.update).toHaveBeenCalledWith('cal', 'series1', { description: 'x' });
    expect(events.insert).toHaveBeenCalledWith('cal', { summary: 'New' });
    expect(events.instances).toHaveBeenCalledWith('cal', 'series1', params);
  });
});

describe('syncWindow', () => {
  it('spans one year back to one year ahead from the same calendar day', () => {
    const window = syncWindow(new Date(2026, 9, 21, 15, 30));
    expect(window).toEqual({
      timeMin: new Date(2025, 9, 21).toISOString(),
      timeMax: new Date(2027, 9, 21).toISOString(),
    });
  });
});
