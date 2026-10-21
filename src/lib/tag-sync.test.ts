import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GoogleCalendarEvent } from '../types/calendar';
import { findMatchingEvents, bulkUpdateEventTags, groupBySeries } from './tag-sync';
import { diag } from './diag-panel';

vi.mock('./diag-panel', () => ({ diag: vi.fn() }));

const CAL = 'cal@example.com';

function ev(id: string, extra: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent {
  return {
    id,
    summary: 'Standup',
    start: { dateTime: '2026-10-21T09:00:00Z' },
    end: { dateTime: '2026-10-21T09:30:00Z' },
    ...extra,
    calendar_id: CAL,
  } as GoogleCalendarEvent;
}

const occurrence = (seriesId: string, day: number, description?: string) =>
  ev(`${seriesId}_${day}`, { recurringEventId: seriesId, description });

describe('groupBySeries', () => {
  it('splits standalone events from occurrences and lists each series once', () => {
    const events = [
      ev('a'),
      occurrence('S1', 1),
      occurrence('S1', 2),
      ev('b'),
      occurrence('S2', 3),
    ];

    const { singles, seriesIds } = groupBySeries(events);

    expect(singles.map((e) => e.id)).toEqual(['a', 'b']);
    expect(seriesIds).toEqual(['S1', 'S2']);
  });
});

describe('findMatchingEvents', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sendMessage.mockReset();
  });

  const rows = [
    ev('current'),
    ev('single'),
    occurrence('S1', 1),
    occurrence('S1', 2),
    occurrence('S2', 3),
    ev('other', { summary: 'Lunch' }),
  ];

  it('excludes the current event and every occurrence of the current series', async () => {
    sendMessage.mockResolvedValue({ success: true, events: rows });

    const matches = await findMatchingEvents('Standup', CAL, 'current', 'me@example.com', 'S1');

    expect(matches.map((e) => e.id)).toEqual(['single', 'S2_3']);
  });

  it('keeps standalone events when the current event is not recurring', async () => {
    sendMessage.mockResolvedValue({ success: true, events: rows });

    const matches = await findMatchingEvents('Standup', CAL, 'current', 'me@example.com');

    expect(matches.map((e) => e.id)).toEqual(['single', 'S1_1', 'S1_2', 'S2_3']);
  });
});

describe('bulkUpdateEventTags', () => {
  function fakeService(options: { seriesInstances?: GoogleCalendarEvent[]; getFails?: boolean } = {}) {
    const master = { id: 'S1', summary: 'Standup', description: '---\ntags: Old\n---\nDaily notes', start: {}, end: {} };
    const events = {
      update: vi.fn(async (_c: string, id: string, body: object) => ({ id, ...body })),
      get: vi.fn(async () => {
        if (options.getFails) throw new Error('boom');
        return master;
      }),
      instances: vi.fn(async () => options.seriesInstances ?? []),
      insert: vi.fn(),
    };
    return { service: { events }, events };
  }

  it('PATCHes singles one by one and calls writeSeriesTags once per series', async () => {
    const seriesInstances = [
      occurrence('S1', 1, '---\ntags: Old\n---\nDaily notes'),
      occurrence('S1', 2, '---\ntags: Old\n---\nOwn note for this day'),
      occurrence('S1', 3, '---\ntags: Old\n---\nDaily notes'),
    ];
    const { service, events } = fakeService({ seriesInstances });
    const input = [ev('single1'), ev('single2'), ...seriesInstances];

    const result = await bulkUpdateEventTags(input, 'Work', () => service);

    // One PATCH per single, one master PATCH, one restore for the differing occurrence
    expect(events.update).toHaveBeenCalledTimes(4);
    expect(events.update).toHaveBeenCalledWith(CAL, 'single1', { description: expect.stringContaining('tags: Work') });
    expect(events.update).toHaveBeenCalledWith(CAL, 'single2', { description: expect.stringContaining('tags: Work') });
    expect(events.update).toHaveBeenCalledWith(CAL, 'S1', { description: expect.stringContaining('tags: Work') });
    expect(events.update).toHaveBeenCalledWith(CAL, 'S1_2', {
      description: expect.stringContaining('Own note for this day'),
    });
    expect(events.get).toHaveBeenCalledTimes(1);
    expect(events.get).toHaveBeenCalledWith(CAL, 'S1');
    expect(result).toEqual({ success: 5, failed: 0 });
    expect(diag).not.toHaveBeenCalled();
  });

  it('counts every occurrence of a failing series as failed and keeps going', async () => {
    const seriesInstances = [occurrence('S1', 1), occurrence('S1', 2)];
    const { service } = fakeService({ seriesInstances, getFails: true });

    const result = await bulkUpdateEventTags([ev('single'), ...seriesInstances], 'Work', () => service);

    expect(result).toEqual({ success: 1, failed: 2 });
    expect(diag).toHaveBeenCalledWith('api', 'error', 'series tag sync failed', expect.objectContaining({ occurrences: 2 }));
  });
});
