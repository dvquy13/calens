/**
 * Save decision for one autosaved field of a recurring instance. Pure over the
 * RecurringClient interface, so the React hook only wires state and messages.
 *
 * Tags always go to the series (writeSeriesTags), whatever the scope. The other
 * fields follow the scope through applyRecurringEdit, patching only the field
 * that changed: a title edit with "All events" must not overwrite every
 * occurrence's notes.
 */
import type { GoogleCalendarEvent } from '../../types/calendar';
import { mergeTagsIntoDescription } from '../tag-utils';
import { applyRecurringEdit, writeSeriesTags, type EditScope, type RecurringClient } from './recurring-edit';

export type RecurringField = 'summary' | 'location' | 'description' | 'tags';

export interface RecurringSaveValues {
  summary: string;
  location: string;
  description: string; // description without the tags front-matter
  tags: string;
}

export interface RecurringSaveArgs {
  client: RecurringClient;
  calendarId: string;
  instance: GoogleCalendarEvent; // the selected occurrence (recurringEventId + originalStartTime)
  field: RecurringField;
  scope: EditScope;
  values: RecurringSaveValues;
  window: { timeMin: string; timeMax: string };
}

export interface RecurringSaveResult {
  /** Set after a "following" split: the first occurrence of the new series. */
  reselectInstanceId?: string;
  /** Set after a tags write: the master as Google returns it now. */
  master?: GoogleCalendarEvent;
}

function fieldPatch(field: Exclude<RecurringField, 'tags'>, values: RecurringSaveValues): Partial<GoogleCalendarEvent> {
  if (field === 'summary') return { summary: values.summary };
  if (field === 'location') return { location: values.location };
  return { description: mergeTagsIntoDescription(values.description, values.tags) };
}

export async function saveRecurringField(args: RecurringSaveArgs): Promise<RecurringSaveResult> {
  const { client, calendarId, instance, field, scope, values, window } = args;
  const seriesId = instance.recurringEventId;
  if (!seriesId) throw new Error(`Event ${instance.id} is not a recurring instance`);

  if (field === 'tags') {
    await writeSeriesTags(client, calendarId, seriesId, values.tags, window);
    const master = await client.get(calendarId, seriesId);
    return { master };
  }

  const result = await applyRecurringEdit(client, {
    calendarId,
    instance,
    scope,
    buildPatch: () => fieldPatch(field, values),
  });

  if (result.affectedSeriesIds.length === 2 && !result.newInstanceId) {
    throw new Error('The series was split, but its new first occurrence could not be found. Reopen it from the calendar.');
  }
  return { reselectInstanceId: scope === 'following' ? result.newInstanceId : undefined };
}
