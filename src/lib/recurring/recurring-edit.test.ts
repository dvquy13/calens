import { describe, it, expect, vi } from 'vitest';
import type { GoogleCalendarEvent } from '../../types/calendar';
import { applyRecurringEdit, canEditSeries, writeSeriesTags, type RecurringClient } from './recurring-edit';

const CAL = 'me@example.com';

const MASTER: GoogleCalendarEvent = {
  id: 'series1',
  summary: 'Standup',
  description: '---\ntags: Team\n---\nDaily sync',
  location: 'Room 4',
  colorId: '5',
  start: { dateTime: '2026-10-19T09:00:00Z', timeZone: 'Europe/Berlin' },
  end: { dateTime: '2026-10-19T09:30:00Z', timeZone: 'Europe/Berlin' },
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
  organizer: { email: 'me@example.com', self: true },
};

const INSTANCE: GoogleCalendarEvent = {
  id: 'series1_20261026T090000Z',
  summary: 'Standup',
  recurringEventId: 'series1',
  originalStartTime: { dateTime: '2026-10-26T09:00:00Z', timeZone: 'Europe/Berlin' },
  start: { dateTime: '2026-10-26T09:00:00Z', timeZone: 'Europe/Berlin' },
  end: { dateTime: '2026-10-26T09:30:00Z', timeZone: 'Europe/Berlin' },
};

type Call = [string, ...unknown[]];

function fakeClient(
  master: GoogleCalendarEvent,
  options: { countInstances?: GoogleCalendarEvent[] } = {}
) {
  const calls: Call[] = [];
  const client: RecurringClient = {
    get: async (calendarId, eventId) => {
      calls.push(['get', calendarId, eventId]);
      return structuredClone(master);
    },
    patch: async (calendarId, eventId, body) => {
      calls.push(['patch', calendarId, eventId, body]);
      return { ...master, ...body, id: eventId };
    },
    insert: async (calendarId, body) => {
      calls.push(['insert', calendarId, body]);
      return { id: 'series2', summary: body.summary ?? '', start: body.start ?? {}, end: body.end ?? {} };
    },
    instances: async (calendarId, seriesId, params) => {
      calls.push(['instances', calendarId, seriesId, params]);
      if (params?.showDeleted) return options.countInstances ?? [];
      return [{ id: `${seriesId}_first`, summary: '', start: {}, end: {} }];
    },
  };
  return { client, calls };
}

describe('applyRecurringEdit: this', () => {
  it('patches only the instance and reports no affected series', async () => {
    const { client, calls } = fakeClient(MASTER);
    const buildPatch = vi.fn(() => ({ summary: 'Renamed' }));

    const result = await applyRecurringEdit(client, { calendarId: CAL, instance: INSTANCE, scope: 'this', buildPatch });

    expect(calls).toEqual([['patch', CAL, INSTANCE.id, { summary: 'Renamed' }]]);
    expect(buildPatch).toHaveBeenCalledWith(INSTANCE);
    expect(result).toEqual({ affectedSeriesIds: [] });
  });
});

describe('applyRecurringEdit: all', () => {
  it('patches the master with the patch built from the master', async () => {
    const { client, calls } = fakeClient(MASTER);
    const buildPatch = vi.fn(() => ({ location: 'Room 9' }));

    const result = await applyRecurringEdit(client, { calendarId: CAL, instance: INSTANCE, scope: 'all', buildPatch });

    expect(calls).toEqual([
      ['get', CAL, 'series1'],
      ['patch', CAL, 'series1', { location: 'Room 9' }],
    ]);
    expect(buildPatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'series1', summary: 'Standup' }));
    expect(result).toEqual({ affectedSeriesIds: ['series1'] });
  });
});

describe('applyRecurringEdit: following', () => {
  it('bounds the old series, inserts a new series from the instance and returns its first instance', async () => {
    const { client, calls } = fakeClient(MASTER);
    const buildPatch = vi.fn(() => ({ summary: 'Renamed' }));

    const result = await applyRecurringEdit(client, {
      calendarId: CAL,
      instance: INSTANCE,
      scope: 'following',
      buildPatch,
    });

    expect(calls).toEqual([
      ['get', CAL, 'series1'],
      ['patch', CAL, 'series1', { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261026T085959Z'] }],
      [
        'insert',
        CAL,
        {
          summary: 'Renamed',
          description: MASTER.description,
          location: 'Room 4',
          colorId: '5',
          start: { dateTime: '2026-10-26T09:00:00Z', timeZone: 'Europe/Berlin' },
          end: { dateTime: '2026-10-26T09:30:00.000Z', timeZone: 'Europe/Berlin' },
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
        },
      ],
      [
        'instances',
        CAL,
        'series2',
        { timeMin: '2026-10-26T09:00:00.000Z', maxResults: 1 },
      ],
    ]);
    expect(result).toEqual({
      affectedSeriesIds: ['series1', 'series2'],
      newInstanceId: 'series2_first',
    });
  });

  it('builds the new series body without copying the organizer or ids, and passes that body to buildPatch', async () => {
    const { client, calls } = fakeClient(MASTER);
    const bases: GoogleCalendarEvent[] = [];

    await applyRecurringEdit(client, {
      calendarId: CAL,
      instance: INSTANCE,
      scope: 'following',
      buildPatch: (base) => {
        bases.push(base);
        return {};
      },
    });

    const insert = calls.find((c) => c[0] === 'insert');
    const body = insert?.[2] as Record<string, unknown>;
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('organizer');
    expect(bases).toHaveLength(1);
    expect(bases[0]).toEqual(body);
  });

  it('counts the occurrences before the split for a COUNT series and re-counts the new side', async () => {
    const countedBefore = [
      { id: 'a', summary: '', start: {}, end: {} },
      { id: 'b', summary: '', start: {}, end: {} },
      { id: 'c', summary: '', start: {}, end: {} },
    ];
    const master = { ...MASTER, recurrence: ['RRULE:FREQ=DAILY;COUNT=10'] };
    const { client, calls } = fakeClient(master, { countInstances: countedBefore });

    await applyRecurringEdit(client, {
      calendarId: CAL,
      instance: INSTANCE,
      scope: 'following',
      buildPatch: () => ({}),
    });

    expect(calls[1]).toEqual([
      'instances',
      CAL,
      'series1',
      { timeMax: '2026-10-26T09:00:00.000Z', showDeleted: true },
    ]);
    expect(calls[2]).toEqual(['patch', CAL, 'series1', { recurrence: ['RRULE:FREQ=DAILY;UNTIL=20261026T085959Z'] }]);
    expect((calls[3][2] as GoogleCalendarEvent).recurrence).toEqual(['RRULE:FREQ=DAILY;COUNT=7']);
  });

  it('treats the first occurrence as a whole-series edit', async () => {
    const { client, calls } = fakeClient(MASTER);
    const firstInstance: GoogleCalendarEvent = {
      ...INSTANCE,
      id: 'series1_20261019T090000Z',
      originalStartTime: { dateTime: '2026-10-19T09:00:00Z' },
    };
    const buildPatch = vi.fn(() => ({ summary: 'Renamed' }));

    const result = await applyRecurringEdit(client, {
      calendarId: CAL,
      instance: firstInstance,
      scope: 'following',
      buildPatch,
    });

    expect(calls).toEqual([
      ['get', CAL, 'series1'],
      ['patch', CAL, 'series1', { summary: 'Renamed' }],
    ]);
    expect(result).toEqual({ affectedSeriesIds: ['series1'] });
  });

  it('compares all-day first occurrences by date', async () => {
    const allDayMaster: GoogleCalendarEvent = {
      ...MASTER,
      start: { date: '2026-10-19' },
      end: { date: '2026-10-20' },
    };
    const firstInstance: GoogleCalendarEvent = {
      ...INSTANCE,
      originalStartTime: { date: '2026-10-19' },
    };
    const { client, calls } = fakeClient(allDayMaster);

    await applyRecurringEdit(client, { calendarId: CAL, instance: firstInstance, scope: 'following', buildPatch: () => ({}) });

    expect(calls.map((c) => c[0])).toEqual(['get', 'patch']);
  });

  it('splits an all-day series by date and keeps the all-day duration', async () => {
    const allDayMaster: GoogleCalendarEvent = {
      ...MASTER,
      start: { date: '2026-10-19' },
      end: { date: '2026-10-21' },
      recurrence: ['RRULE:FREQ=WEEKLY'],
    };
    const allDayInstance: GoogleCalendarEvent = {
      ...INSTANCE,
      originalStartTime: { date: '2026-10-26' },
      start: { date: '2026-10-26' },
      end: { date: '2026-10-28' },
    };
    const { client, calls } = fakeClient(allDayMaster);

    await applyRecurringEdit(client, { calendarId: CAL, instance: allDayInstance, scope: 'following', buildPatch: () => ({}) });

    expect(calls[1]).toEqual(['patch', CAL, 'series1', { recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20261025'] }]);
    const body = calls[2][2] as GoogleCalendarEvent;
    expect(body.start).toEqual({ date: '2026-10-26' });
    expect(body.end).toEqual({ date: '2026-10-28' });
  });

  it('lets the buildPatch result override the new series start', async () => {
    const { client, calls } = fakeClient(MASTER);
    const moved = { dateTime: '2026-10-26T10:00:00Z', timeZone: 'Europe/Berlin' };

    await applyRecurringEdit(client, {
      calendarId: CAL,
      instance: INSTANCE,
      scope: 'following',
      buildPatch: () => ({ start: moved }),
    });

    expect((calls[2][2] as GoogleCalendarEvent).start).toEqual(moved);
    expect(calls[3]).toEqual(['instances', CAL, 'series2', { timeMin: '2026-10-26T10:00:00.000Z', maxResults: 1 }]);
  });

  it('restores the old series rules and rethrows when inserting the new series fails', async () => {
    const { client, calls } = fakeClient(MASTER);
    client.insert = async () => {
      throw new Error('insert failed');
    };

    await expect(
      applyRecurringEdit(client, { calendarId: CAL, instance: INSTANCE, scope: 'following', buildPatch: () => ({}) })
    ).rejects.toThrow('insert failed');

    const patches = calls.filter((c) => c[0] === 'patch');
    expect(patches).toHaveLength(2);
    expect(patches[1]).toEqual(['patch', CAL, 'series1', { recurrence: MASTER.recurrence }]);
  });

  it('throws when the instance has no recurringEventId', async () => {
    const { client } = fakeClient(MASTER);
    await expect(
      applyRecurringEdit(client, {
        calendarId: CAL,
        instance: { ...INSTANCE, recurringEventId: undefined },
        scope: 'following',
        buildPatch: () => ({}),
      })
    ).rejects.toThrow(/not a recurring instance/);
  });
});

describe('canEditSeries', () => {
  it('allows writers and owners who organize the series', () => {
    expect(canEditSeries(MASTER, 'writer')).toBe(true);
    expect(canEditSeries(MASTER, 'owner')).toBe(true);
  });

  it('denies readers, free-busy viewers and missing roles', () => {
    expect(canEditSeries(MASTER, 'reader')).toBe(false);
    expect(canEditSeries(MASTER, 'freeBusyReader')).toBe(false);
    expect(canEditSeries(MASTER, undefined)).toBe(false);
  });

  it('denies a series the user does not organize', () => {
    const notMine = { ...MASTER, organizer: { email: 'boss@example.com', self: false } };
    expect(canEditSeries(notMine, 'owner')).toBe(false);
    expect(canEditSeries({ ...MASTER, organizer: undefined }, 'owner')).toBe(false);
  });
});

describe('writeSeriesTags', () => {
  const WINDOW = { timeMin: '2026-10-01T00:00:00Z', timeMax: '2026-11-01T00:00:00Z' };
  const MASTER_DESC = '---\ntags: Old\n---\n\nDaily sync';

  function tagClient(instances: GoogleCalendarEvent[]) {
    const calls: Call[] = [];
    const client: RecurringClient = {
      get: async () => ({ ...MASTER, description: MASTER_DESC }),
      patch: async (calendarId, eventId, body) => {
        calls.push(['patch', calendarId, eventId, body]);
        return { ...MASTER, ...body, id: eventId };
      },
      insert: async () => {
        throw new Error('not used');
      },
      instances: async (calendarId, seriesId, params) => {
        calls.push(['instances', calendarId, seriesId, params]);
        return instances;
      },
    };
    return { client, calls };
  }

  it('patches only the master when no occurrence has its own notes', async () => {
    const { client, calls } = tagClient([
      { ...INSTANCE, id: 'i1', description: MASTER_DESC },
      { ...INSTANCE, id: 'i2', description: '---\ntags: Old\n---\n\nDaily sync' },
    ]);

    const result = await writeSeriesTags(client, CAL, 'series1', 'New', WINDOW);

    expect(calls.filter((c) => c[0] === 'patch')).toEqual([
      ['patch', CAL, 'series1', { description: '---\ntags: New\n---\n\nDaily sync' }],
    ]);
    expect(result).toEqual({ restoredInstanceIds: [] });
  });

  it('restores an occurrence with its own notes after the master write, keeping those notes', async () => {
    const { client, calls } = tagClient([
      { ...INSTANCE, id: 'i1', description: '---\ntags: Old\n---\n\nDaily sync\n\nBring slides' },
    ]);

    const result = await writeSeriesTags(client, CAL, 'series1', 'New', WINDOW);

    expect(calls.filter((c) => c[0] === 'patch')).toEqual([
      ['patch', CAL, 'series1', { description: '---\ntags: New\n---\n\nDaily sync' }],
      ['patch', CAL, 'i1', { description: '---\ntags: New\n---\n\nDaily sync\n\nBring slides' }],
    ]);
    expect(result).toEqual({ restoredInstanceIds: ['i1'] });
  });

  it('does not patch an occurrence whose notes match the master even if its tags differ', async () => {
    const { client, calls } = tagClient([
      { ...INSTANCE, id: 'i1', description: '---\ntags: Other\n---\n\nDaily sync' },
    ]);

    const result = await writeSeriesTags(client, CAL, 'series1', 'New', WINDOW);

    expect(calls.filter((c) => c[0] === 'patch').map((c) => c[2])).toEqual(['series1']);
    expect(result).toEqual({ restoredInstanceIds: [] });
  });

  it('queries instances with the given window', async () => {
    const { client, calls } = tagClient([]);
    await writeSeriesTags(client, CAL, 'series1', 'New', WINDOW);
    expect(calls[0]).toEqual(['instances', CAL, 'series1', WINDOW]);
  });
});
