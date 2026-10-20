/**
 * Calendar Store Operations
 * CRUD operations for calendars
 */

import { IDBPDatabase } from 'idb';
import { STORE_NAMES, CalendarStore } from '@/types/database';
import { CalendarDBSchema } from './schema';

export async function createCalendar(
  db: IDBPDatabase<CalendarDBSchema>,
  calendar: CalendarStore
): Promise<void> {
  await db.put(STORE_NAMES.CALENDARS, calendar);
}

export async function getCalendar(
  db: IDBPDatabase<CalendarDBSchema>,
  id: string
): Promise<CalendarStore | undefined> {
  return await db.get(STORE_NAMES.CALENDARS, id);
}

export async function getUserCalendars(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string
): Promise<CalendarStore[]> {
  return await db.getAllFromIndex(STORE_NAMES.CALENDARS, 'user_email', userEmail);
}

export async function updateCalendar(
  db: IDBPDatabase<CalendarDBSchema>,
  calendar: CalendarStore
): Promise<void> {
  await db.put(STORE_NAMES.CALENDARS, calendar);
}

export async function deleteCalendar(
  db: IDBPDatabase<CalendarDBSchema>,
  id: string
): Promise<void> {
  await db.delete(STORE_NAMES.CALENDARS, id);
}

export async function batchCreateCalendars(
  db: IDBPDatabase<CalendarDBSchema>,
  calendars: CalendarStore[]
): Promise<void> {
  const tx = db.transaction(STORE_NAMES.CALENDARS, 'readwrite');

  await Promise.all([
    ...calendars.map(calendar => tx.store.put(calendar)),
    tx.done
  ]);
}
