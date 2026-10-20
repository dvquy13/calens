/**
 * Event Store Operations
 * CRUD operations for events
 */

import { IDBPDatabase } from 'idb';
import { STORE_NAMES, EventStore } from '@/types/database';
import { CalendarDBSchema } from './schema';

export async function createEvent(
  db: IDBPDatabase<CalendarDBSchema>,
  event: EventStore
): Promise<void> {
  await db.put(STORE_NAMES.EVENTS, event);
}

export async function getEvent(
  db: IDBPDatabase<CalendarDBSchema>,
  id: string
): Promise<EventStore | undefined> {
  return await db.get(STORE_NAMES.EVENTS, id);
}

export async function getUserEvents(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string
): Promise<EventStore[]> {
  return await db.getAllFromIndex(STORE_NAMES.EVENTS, 'user_email', userEmail);
}

export async function getUserEventsByDateRange(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string,
  startDate: Date,
  endDate: Date
): Promise<EventStore[]> {
  // Ensure endDate includes the entire day
  const inclusiveEndDate = new Date(endDate);
  inclusiveEndDate.setHours(23, 59, 59, 999);

  const lowerBound: [string, Date] = [userEmail, startDate];
  const upperBound: [string, Date] = [userEmail, inclusiveEndDate];

  return await db.getAllFromIndex(
    STORE_NAMES.EVENTS,
    'user_start',
    IDBKeyRange.bound(lowerBound, upperBound)
  );
}

export async function getCalendarEvents(
  db: IDBPDatabase<CalendarDBSchema>,
  userEmail: string,
  calendarId: string
): Promise<EventStore[]> {
  const lowerBound: [string, string, Date] = [userEmail, calendarId, new Date(0)];
  const upperBound: [string, string, Date] = [userEmail, calendarId, new Date(9999, 11, 31)];

  return await db.getAllFromIndex(
    STORE_NAMES.EVENTS,
    'user_calendar_start',
    IDBKeyRange.bound(lowerBound, upperBound)
  );
}

export async function updateEvent(
  db: IDBPDatabase<CalendarDBSchema>,
  event: EventStore
): Promise<void> {
  await db.put(STORE_NAMES.EVENTS, event);
}

export async function deleteEvent(
  db: IDBPDatabase<CalendarDBSchema>,
  id: string
): Promise<void> {
  await db.delete(STORE_NAMES.EVENTS, id);
}

export async function batchCreateEvents(
  db: IDBPDatabase<CalendarDBSchema>,
  events: EventStore[]
): Promise<void> {
  const tx = db.transaction(STORE_NAMES.EVENTS, 'readwrite');

  await Promise.all([
    ...events.map(event => tx.store.put(event)),
    tx.done
  ]);
}
