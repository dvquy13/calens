/**
 * Tag Store Operations
 * CRUD operations for tags
 */

import { IDBPDatabase } from 'idb';
import { STORE_NAMES, TagStore } from '@/types/database';
import { CalendarDBSchema } from './schema';

export async function batchCreateTags(
  db: IDBPDatabase<CalendarDBSchema>,
  tags: Omit<TagStore, 'id'>[]
): Promise<void> {
  const tx = db.transaction(STORE_NAMES.TAGS, 'readwrite');

  await Promise.all([
    ...tags.map(tag => tx.store.add(tag as TagStore)),
    tx.done
  ]);
}

export async function getEventTags(
  db: IDBPDatabase<CalendarDBSchema>,
  eventId: string
): Promise<TagStore[]> {
  return await db.getAllFromIndex(STORE_NAMES.TAGS, 'event_id', eventId);
}

export async function deleteEventTags(
  db: IDBPDatabase<CalendarDBSchema>,
  eventId: string
): Promise<void> {
  const tags = await getEventTags(db, eventId);
  const tx = db.transaction(STORE_NAMES.TAGS, 'readwrite');

  await Promise.all([
    ...tags.map(tag => tag.id ? tx.store.delete(tag.id) : Promise.resolve()),
    tx.done
  ]);
}

/** Deletes every tag of these events in one transaction (by event, so tags with a stale calendar_id go too). */
export async function deleteTagsForEvents(
  db: IDBPDatabase<CalendarDBSchema>,
  eventIds: string[]
): Promise<void> {
  const tx = db.transaction(STORE_NAMES.TAGS, 'readwrite');
  const index = tx.store.index('event_id');
  const keys = (await Promise.all(eventIds.map(id => index.getAllKeys(id)))).flat();

  await Promise.all([
    ...keys.map(key => tx.store.delete(key)),
    tx.done
  ]);
}

export async function deleteCalendarTags(
  db: IDBPDatabase<CalendarDBSchema>,
  calendarId: string
): Promise<void> {
  const tags = await db.getAllFromIndex(STORE_NAMES.TAGS, 'calendar_id', calendarId);
  const tx = db.transaction(STORE_NAMES.TAGS, 'readwrite');

  await Promise.all([
    ...tags.map(tag => tag.id ? tx.store.delete(tag.id) : Promise.resolve()),
    tx.done
  ]);
}

export async function getUserTagsByName(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string,
  tagName: string
): Promise<TagStore[]> {
  return await db.getAllFromIndex(STORE_NAMES.TAGS, 'user_tag', [userEmail, tagName]);
}
