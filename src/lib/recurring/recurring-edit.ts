/**
 * Scope-aware writes for recurring events. Pure orchestration over a small
 * client interface, so it runs in the service worker and the side panel alike
 * and is tested against an in-memory fake.
 *
 * Series edits go through the master event. "This and following" splits the
 * series: the old master gets an UNTIL before the instance, and a new master
 * starts at the instance (see rrule-split.ts).
 */
import type { GoogleCalendarEvent } from '../../types/calendar';
import { splitRecurrence } from './rrule-split';
import { mergeTagsIntoDescription, stripTagsFromDescription } from '../tag-utils';

export type EditScope = 'this' | 'following' | 'all';

export interface RecurringClient {
  get(calendarId: string, eventId: string): Promise<GoogleCalendarEvent>;
  patch(calendarId: string, eventId: string, body: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent>;
  insert(calendarId: string, body: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent>;
  instances(
    calendarId: string,
    seriesId: string,
    params?: { timeMin?: string; timeMax?: string; maxResults?: number; showDeleted?: boolean }
  ): Promise<GoogleCalendarEvent[]>;
}

export interface ApplyRecurringEditArgs {
  calendarId: string;
  instance: GoogleCalendarEvent; // must have recurringEventId + originalStartTime for series scopes
  scope: EditScope;
  buildPatch: (base: GoogleCalendarEvent) => Partial<GoogleCalendarEvent>;
}

export interface ApplyRecurringEditResult {
  affectedSeriesIds: string[];
  newInstanceId?: string;
}

type EventTime = GoogleCalendarEvent['start'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds for a date-time, or UTC midnight for an all-day date. */
function toMs(time: EventTime): number {
  if (time.dateTime !== undefined) return Date.parse(time.dateTime);
  if (time.date !== undefined) return Date.parse(`${time.date}T00:00:00Z`);
  throw new Error('Event time has neither dateTime nor date');
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function withoutUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function requireSeriesId(instance: GoogleCalendarEvent): string {
  if (!instance.recurringEventId) {
    throw new Error(`Event ${instance.id} is not a recurring instance`);
  }
  return instance.recurringEventId;
}

function requireOriginalStart(instance: GoogleCalendarEvent): EventTime {
  if (!instance.originalStartTime) {
    throw new Error(`Recurring instance ${instance.id} has no originalStartTime`);
  }
  return instance.originalStartTime;
}

/** Series scopes need write access to the calendar and to the master (the organizer can change it). */
export function canEditSeries(master: GoogleCalendarEvent, accessRole?: string): boolean {
  return ['writer', 'owner'].includes(accessRole ?? '') && master.organizer?.self === true;
}

/** Fields copied from the master onto a new series. Ids, etag, conference data and the like are not. */
function buildNewSeriesBody(
  master: GoogleCalendarEvent,
  start: EventTime,
  recurrence: string[]
): Partial<GoogleCalendarEvent> {
  const durationMs = toMs(master.end) - toMs(master.start);
  const end: EventTime =
    start.date !== undefined
      ? { date: addDays(start.date, durationMs / DAY_MS), timeZone: master.end.timeZone }
      : { dateTime: new Date(toMs(start) + durationMs).toISOString(), timeZone: master.end.timeZone };

  return withoutUndefined({
    summary: master.summary,
    description: master.description,
    location: master.location,
    attendees: master.attendees,
    reminders: master.reminders,
    colorId: master.colorId,
    visibility: master.visibility,
    transparency: master.transparency,
    guestsCanModify: master.guestsCanModify,
    start,
    end,
    recurrence,
  });
}

export async function applyRecurringEdit(
  client: RecurringClient,
  args: ApplyRecurringEditArgs
): Promise<ApplyRecurringEditResult> {
  const { calendarId, instance, scope, buildPatch } = args;

  if (scope === 'this') {
    await client.patch(calendarId, instance.id, buildPatch(instance));
    return { affectedSeriesIds: [] };
  }

  const seriesId = requireSeriesId(instance);
  const master = await client.get(calendarId, seriesId);

  if (scope === 'all') {
    await client.patch(calendarId, master.id, buildPatch(master));
    return { affectedSeriesIds: [master.id] };
  }

  // scope === 'following'
  const originalStart = requireOriginalStart(instance);
  if (toMs(originalStart) === toMs(master.start)) {
    // Splitting at the first occurrence leaves nothing behind, so it is a whole-series edit.
    await client.patch(calendarId, master.id, buildPatch(master));
    return { affectedSeriesIds: [master.id] };
  }

  if (!master.recurrence?.length) {
    throw new Error(`Series ${master.id} has no recurrence rules to split`);
  }

  const splitAt = new Date(toMs(originalStart));
  const hasCount = master.recurrence.some((line) => /^RRULE:(?:.*;)?COUNT=/i.test(line));
  const countBefore = hasCount
    ? (await client.instances(calendarId, master.id, { timeMax: splitAt.toISOString(), showDeleted: true })).length
    : undefined;

  const isAllDay = master.start.date !== undefined;
  const { oldRecurrence, newRecurrence } = splitRecurrence(master.recurrence, splitAt, isAllDay, countBefore);

  await client.patch(calendarId, master.id, { recurrence: oldRecurrence });

  const start: EventTime = isAllDay
    ? withoutUndefined({ date: originalStart.date, timeZone: master.start.timeZone })
    : withoutUndefined({ dateTime: originalStart.dateTime, timeZone: master.start.timeZone });
  const newBody = buildNewSeriesBody(master, start, newRecurrence);
  // The new series has no id yet; buildPatch only reads content fields, so the partial base is passed as-is.
  const body: Partial<GoogleCalendarEvent> = { ...newBody, ...buildPatch(newBody as GoogleCalendarEvent) };

  let created: GoogleCalendarEvent;
  try {
    created = await client.insert(calendarId, body);
  } catch (error) {
    // The old series is already cut short; put its rules back so a failed split loses nothing.
    await client.patch(calendarId, master.id, { recurrence: master.recurrence });
    throw error;
  }
  const newStart = body.start ?? start;
  const [firstInstance] = await client.instances(calendarId, created.id, {
    timeMin: new Date(toMs(newStart)).toISOString(),
    maxResults: 1,
  });

  return {
    affectedSeriesIds: [master.id, created.id],
    newInstanceId: firstInstance?.id,
  };
}

/**
 * Write tags to a whole series. The master's description is shared by every
 * occurrence that does not override it, and PATCHing it overwrites the
 * per-occurrence notes of exceptions. So occurrences whose notes differ from the
 * master's are snapshotted first and given their own notes back with the new tags.
 */
export async function writeSeriesTags(
  client: RecurringClient,
  calendarId: string,
  seriesId: string,
  tagsInput: string,
  window: { timeMin: string; timeMax: string }
): Promise<{ restoredInstanceIds: string[] }> {
  const master = await client.get(calendarId, seriesId);
  const instances = await client.instances(calendarId, seriesId, window);
  const notes = (description?: string) => stripTagsFromDescription(description ?? '');

  const masterNotes = notes(master.description);
  const toRestore = instances.filter((i) => notes(i.description) !== masterNotes);

  await client.patch(calendarId, seriesId, {
    description: mergeTagsIntoDescription(masterNotes, tagsInput),
  });
  for (const instance of toRestore) {
    await client.patch(calendarId, instance.id, {
      description: mergeTagsIntoDescription(notes(instance.description), tagsInput),
    });
  }

  return { restoredInstanceIds: toRestore.map((i) => i.id) };
}
