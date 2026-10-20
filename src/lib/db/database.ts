/**
 * IndexedDB Database Setup for Calendar Chrome Extension using idb library
 */

import { openDB, IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, STORE_NAMES } from '@/types/database';
import type { CalendarStore, EventStore, MetadataStore, TagStore } from '@/types/database';
import { CalendarDBSchema } from './schema';
import * as calendarStore from './calendar-store';
import * as eventStore from './event-store';
import * as tagStore from './tag-store';
import * as metadataStore from './metadata-store';

export class CalendarDatabase {
  private dbPromise: Promise<IDBPDatabase<CalendarDBSchema>> | null = null;

  constructor() {
    // Lazy initialization
  }

  async init(): Promise<IDBPDatabase<CalendarDBSchema>> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = this.openDatabase();
    return this.dbPromise;
  }

  private async openDatabase(): Promise<IDBPDatabase<CalendarDBSchema>> {
    try {
      return await openDB<CalendarDBSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Create calendars object store
          if (!db.objectStoreNames.contains(STORE_NAMES.CALENDARS)) {
            const calendarsStore = db.createObjectStore(STORE_NAMES.CALENDARS, {
              keyPath: 'id'
            });

            calendarsStore.createIndex('user_email', 'user_email', { unique: false });
            calendarsStore.createIndex('user_calendar', ['user_email', 'id'], { unique: true });
            calendarsStore.createIndex('selected', 'selected', { unique: false });
          }

          // Create events object store
          if (!db.objectStoreNames.contains(STORE_NAMES.EVENTS)) {
            const eventsStore = db.createObjectStore(STORE_NAMES.EVENTS, {
              keyPath: 'id'
            });

            eventsStore.createIndex('user_email', 'user_email', { unique: false });
            eventsStore.createIndex('user_calendar_start', ['user_email', 'calendar_id', 'start'], { unique: false });
            eventsStore.createIndex('user_start', ['user_email', 'start'], { unique: false });
            eventsStore.createIndex('calendar_id', 'calendar_id', { unique: false });
            eventsStore.createIndex('start', 'start', { unique: false });
          }

          // Create metadata object store
          if (!db.objectStoreNames.contains(STORE_NAMES.METADATA)) {
            const metadataStore = db.createObjectStore(STORE_NAMES.METADATA, {
              keyPath: ['user_email', 'key']
            });

            metadataStore.createIndex('user_email', 'user_email', { unique: false });
            metadataStore.createIndex('last_updated', 'last_updated', { unique: false });
          }

          // Create tags object store
          if (!db.objectStoreNames.contains(STORE_NAMES.TAGS)) {
            const tagsStore = db.createObjectStore(STORE_NAMES.TAGS, {
              keyPath: 'id',
              autoIncrement: true
            });

            tagsStore.createIndex('user_email', 'user_email', { unique: false });
            tagsStore.createIndex('event_id', 'event_id', { unique: false });
            tagsStore.createIndex('user_event', ['user_email', 'event_id'], { unique: false });
            tagsStore.createIndex('user_tag', ['user_email', 'tag_name'], { unique: false });
            tagsStore.createIndex('calendar_id', 'calendar_id', { unique: false });
          }

          // Create logged_events object store
          if (!db.objectStoreNames.contains(STORE_NAMES.LOGGED_EVENTS)) {
            const loggedEventsStore = db.createObjectStore(STORE_NAMES.LOGGED_EVENTS, {
              keyPath: 'id'
            });

            loggedEventsStore.createIndex('user_email', 'user_email', { unique: false });
          }

          // Create time_entries object store
          if (!db.objectStoreNames.contains(STORE_NAMES.TIME_ENTRIES)) {
            const timeEntriesStore = db.createObjectStore(STORE_NAMES.TIME_ENTRIES, {
              keyPath: 'id',
              autoIncrement: true
            });

            timeEntriesStore.createIndex('user_email', 'user_email', { unique: false });
          }

          // Create analytics_config object store
          if (!db.objectStoreNames.contains(STORE_NAMES.ANALYTICS_CONFIG)) {
            const analyticsConfigStore = db.createObjectStore(STORE_NAMES.ANALYTICS_CONFIG, {
              keyPath: ['user_email', 'id']
            });

            analyticsConfigStore.createIndex('user_email', 'user_email', { unique: false });
          }

          // Create analytics_cache object store
          if (!db.objectStoreNames.contains(STORE_NAMES.ANALYTICS_CACHE)) {
            const analyticsCacheStore = db.createObjectStore(STORE_NAMES.ANALYTICS_CACHE, {
              keyPath: ['user_email', 'cache_key']
            });

            analyticsCacheStore.createIndex('user_email', 'user_email', { unique: false });
          }
        },
        blocked() {
          console.error('[CalendarDB] Database upgrade blocked - another connection is open');
        },
        blocking() {
          console.warn('[CalendarDB] This connection is blocking a database upgrade');
        },
        terminated() {
          console.error('[CalendarDB] Database connection unexpectedly terminated');
        }
      });
    } catch (error) {
      console.error('[CalendarDB] Failed to open database:', error);

      // Handle VersionError by retrying with database deletion
      if (error instanceof Error && error.name === 'VersionError') {
        console.log('[CalendarDB] Version conflict detected, attempting recovery...');
        await this.deleteDatabase();
        // Retry opening
        return await openDB<CalendarDBSchema>(DB_NAME, DB_VERSION, {
          upgrade() {
            console.log('[CalendarDB] Recreating database after version conflict');
          }
        });
      }

      throw error;
    }
  }

  async deleteDatabase(): Promise<void> {
    this.dbPromise = null;
    const databases = await indexedDB.databases();
    const exists = databases.some(db => db.name === DB_NAME);

    if (exists) {
      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });
    }
  }

  // ============ Calendar CRUD Operations ============

  async createCalendar(calendar: CalendarStore): Promise<void> {
    const db = await this.init();
    return calendarStore.createCalendar(db, calendar);
  }

  async getCalendar(id: string): Promise<CalendarStore | undefined> {
    const db = await this.init();
    return calendarStore.getCalendar(db, id);
  }

  async getUserCalendars(userEmail: string): Promise<CalendarStore[]> {
    const db = await this.init();
    return calendarStore.getUserCalendars(db, userEmail);
  }

  async updateCalendar(calendar: CalendarStore): Promise<void> {
    const db = await this.init();
    return calendarStore.updateCalendar(db, calendar);
  }

  async deleteCalendar(id: string): Promise<void> {
    const db = await this.init();
    return calendarStore.deleteCalendar(db, id);
  }

  async batchCreateCalendars(calendars: CalendarStore[]): Promise<void> {
    const db = await this.init();
    return calendarStore.batchCreateCalendars(db, calendars);
  }

  // ============ Event CRUD Operations ============

  async createEvent(event: EventStore): Promise<void> {
    const db = await this.init();
    return eventStore.createEvent(db, event);
  }

  async getEvent(id: string): Promise<EventStore | undefined> {
    const db = await this.init();
    return eventStore.getEvent(db, id);
  }

  async getUserEvents(userEmail: string): Promise<EventStore[]> {
    const db = await this.init();
    return eventStore.getUserEvents(db, userEmail);
  }

  async getUserEventsByDateRange(userEmail: string, startDate: Date, endDate: Date): Promise<EventStore[]> {
    const db = await this.init();
    return eventStore.getUserEventsByDateRange(db, userEmail, startDate, endDate);
  }

  async getCalendarEvents(userEmail: string, calendarId: string): Promise<EventStore[]> {
    const db = await this.init();
    return eventStore.getCalendarEvents(db, userEmail, calendarId);
  }

  async updateEvent(event: EventStore): Promise<void> {
    const db = await this.init();
    return eventStore.updateEvent(db, event);
  }

  async deleteEvent(id: string): Promise<void> {
    const db = await this.init();
    return eventStore.deleteEvent(db, id);
  }

  async batchCreateEvents(events: EventStore[]): Promise<void> {
    const db = await this.init();
    return eventStore.batchCreateEvents(db, events);
  }

  // ============ Metadata CRUD Operations ============

  async setUserMetadata(userEmail: string, key: string, value: any, cacheExpiry?: Date): Promise<void> {
    const db = await this.init();
    return metadataStore.setUserMetadata(db, userEmail, key, value, cacheExpiry);
  }

  async getUserMetadata(userEmail: string, key: string): Promise<MetadataStore | undefined> {
    const db = await this.init();
    return metadataStore.getUserMetadata(db, userEmail, key);
  }

  async deleteUserMetadata(userEmail: string, key: string): Promise<void> {
    const db = await this.init();
    return metadataStore.deleteUserMetadata(db, userEmail, key);
  }

  async getAllUserMetadata(userEmail: string): Promise<MetadataStore[]> {
    const db = await this.init();
    return metadataStore.getAllUserMetadata(db, userEmail);
  }

  async clearSyncCheckpoints(userEmail: string): Promise<void> {
    const db = await this.init();
    return metadataStore.clearSyncCheckpoints(db, userEmail);
  }

  // ============ Tag CRUD Operations ============

  async batchCreateTags(tags: Omit<TagStore, 'id'>[]): Promise<void> {
    const db = await this.init();
    return tagStore.batchCreateTags(db, tags);
  }

  async getEventTags(eventId: string): Promise<TagStore[]> {
    const db = await this.init();
    return tagStore.getEventTags(db, eventId);
  }

  async deleteEventTags(eventId: string): Promise<void> {
    const db = await this.init();
    return tagStore.deleteEventTags(db, eventId);
  }

  async deleteCalendarTags(calendarId: string): Promise<void> {
    const db = await this.init();
    return tagStore.deleteCalendarTags(db, calendarId);
  }

  async getUserTagsByName(userEmail: string, tagName: string): Promise<TagStore[]> {
    const db = await this.init();
    return tagStore.getUserTagsByName(db, userEmail, tagName);
  }

  // ============ Cache Utilities ============

  async isUserDataFresh(userEmail: string, cacheKey: string, maxAge: number = 3600000): Promise<boolean> {
    const db = await this.init();
    return metadataStore.isUserDataFresh(db, userEmail, cacheKey, maxAge);
  }

  async getUserCacheTimestamp(userEmail: string, cacheKey: string): Promise<Date | null> {
    const db = await this.init();
    return metadataStore.getUserCacheTimestamp(db, userEmail, cacheKey);
  }

  async invalidateUserCache(userEmail: string, cacheKey: string): Promise<void> {
    const db = await this.init();
    return metadataStore.invalidateUserCache(db, userEmail, cacheKey);
  }
}
