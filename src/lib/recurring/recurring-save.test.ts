import { describe, it, expect, vi } from 'vitest';
import type { GoogleCalendarEvent } from '../../types/calendar';
import type { RecurringClient } from './recurring-edit';
import { saveRecurringField, type RecurringSaveValues } from './recurring-save';

const CAL = 'me@example.com';
const WINDOW = { timeMin: '2025-10-21T00:00:00Z', timeMax: '2027-10-21T00:00:00Z' };

const MASTER: GoogleCalendarEvent = {
  id: 'series1',
  summary: 'Standup',
  description: '---\ntags: Team\n---\nDaily sync',
  location: 'Room 4',
  start: { dateTime: '2026-10-19T09:00:00Z', timeZone: 'Europe/Berlin' },
  end: { dateTime: '2026-10-19T09:30:00Z', timeZone: 'Europe/Berlin' },
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
  organizer: { email: CAL, self: true },
};

const INSTANCE: GoogleCalendarEvent = {
  id: 'series1_20261026T090000Z',
  summary: 'Standup',
  description: 'Daily sync',
  recurringEventId: 'series1',
  originalStartTime: { dateTime: '2026-10-26T09:00:00Z', timeZone: 'Europe/Berlin' },
  start: { dateTime: '2026-10-26T09:00:00Z', timeZone: 'Europe/Berlin' },
  end: { dateTime: '2026-10-26T09:30:00Z', timeZone: 'Europe/Berlin' },
};

const VALUES: RecurringSaveValues = {
  summary: 'Renamed',
  location: 'Room 4',
  description: 'Daily sync',
  tags: 'Team, Ops',
};

function fakeClient() {
  const patch = vi.fn(async (_c: string, eventId: string, body: Partial<GoogleCalendarEvent>) => ({
    ...MASTER,
    ...body,
    id: eventId,
  }));
  const client: RecurringClient = {
    get: vi.fn(async () => structuredClone(MASTER)),
    patch,
    insert: vi.fn(async (_c, body) => ({ id: 'series2', ...body }) as GoogleCalendarEvent),
    instances: vi.fn(async (_c, seriesId, params) => {
      if (params?.showDeleted) return [];
      return [{ id: `${seriesId}_first`, start: {}, end: {} } as GoogleCalendarEvent];
    }),
  };
  return { client, patch };
}

describe('saveRecurringField: tags', () => {
  it('writes tags to the series master even when the scope is "following"', async () => {
    const { client, patch } = fakeClient();
    const result = await saveRecurringField({
      client,
      calendarId: CAL,
      instance: INSTANCE,
      field: 'tags',
      scope: 'following',
      values: VALUES,
      window: WINDOW,
    });

    expect(patch).toHaveBeenCalledWith(CAL, 'series1', {
      description: expect.stringContaining('tags: Team, Ops'),
    });
    expect(patch.mock.calls[0][1]).toBe('series1');
    expect(client.insert).not.toHaveBeenCalled();
    expect(result.reselectInstanceId).toBeUndefined();
    expect(result.master?.id).toBe('series1');
  });
});

describe('saveRecurringField: scope', () => {
  it('"this" patches only the selected instance, with only the changed field', async () => {
    const { client, patch } = fakeClient();
    const result = await saveRecurringField({
      client,
      calendarId: CAL,
      instance: INSTANCE,
      field: 'summary',
      scope: 'this',
      values: VALUES,
      window: WINDOW,
    });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(CAL, INSTANCE.id, { summary: 'Renamed' });
    expect(result).toEqual({ reselectInstanceId: undefined });
  });

  it('"all" patches the master with only the changed field, so occurrence notes are not touched', async () => {
    const { client, patch } = fakeClient();
    await saveRecurringField({
      client,
      calendarId: CAL,
      instance: INSTANCE,
      field: 'location',
      scope: 'all',
      values: VALUES,
      window: WINDOW,
    });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(CAL, 'series1', { location: 'Room 4' });
  });

  it('"following" splits and returns the first occurrence of the new series to reselect', async () => {
    const { client } = fakeClient();
    const later: GoogleCalendarEvent = {
      ...INSTANCE,
      id: 'series1_20261102T090000Z',
      originalStartTime: { dateTime: '2026-11-02T09:00:00Z', timeZone: 'Europe/Berlin' },
      start: { dateTime: '2026-11-02T09:00:00Z', timeZone: 'Europe/Berlin' },
    };

    const result = await saveRecurringField({
      client,
      calendarId: CAL,
      instance: later,
      field: 'description',
      scope: 'following',
      values: VALUES,
      window: WINDOW,
    });

    expect(client.insert).toHaveBeenCalledTimes(1);
    expect(result.reselectInstanceId).toBe('series2_first');
  });

  it('"following" on the first occurrence is a whole-series edit and reselects nothing', async () => {
    const { client, patch } = fakeClient();
    const first: GoogleCalendarEvent = {
      ...INSTANCE,
      id: 'series1_20261019T090000Z',
      originalStartTime: { dateTime: '2026-10-19T09:00:00Z', timeZone: 'Europe/Berlin' },
      start: { dateTime: '2026-10-19T09:00:00Z', timeZone: 'Europe/Berlin' },
    };

    const result = await saveRecurringField({
      client,
      calendarId: CAL,
      instance: first,
      field: 'summary',
      scope: 'following',
      values: VALUES,
      window: WINDOW,
    });

    expect(client.insert).not.toHaveBeenCalled();
    expect(patch).toHaveBeenCalledWith(CAL, 'series1', { summary: 'Renamed' });
    expect(result.reselectInstanceId).toBeUndefined();
  });

  it('fails loudly when the split created a series but no first occurrence is found', async () => {
    const { client } = fakeClient();
    client.instances = vi.fn(async () => []);

    await expect(
      saveRecurringField({
        client,
        calendarId: CAL,
        instance: { ...INSTANCE, id: 'series1_20261102T090000Z', originalStartTime: { dateTime: '2026-11-02T09:00:00Z' } },
        field: 'summary',
        scope: 'following',
        values: VALUES,
        window: WINDOW,
      })
    ).rejects.toThrow('could not be found');
  });
});
