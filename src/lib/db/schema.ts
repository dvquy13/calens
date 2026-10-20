/**
 * Database Schema Definition
 */

import { DBSchema } from 'idb';
import { STORE_NAMES } from '@/types/database';
import type { CalendarStore, EventStore, MetadataStore, TagStore } from '@/types/database';

export interface CalendarDBSchema extends DBSchema {
  [STORE_NAMES.CALENDARS]: {
    key: string;
    value: CalendarStore;
    indexes: {
      'user_email': string;
      'user_calendar': [string, string];
      // Booleans are not valid IndexedDB keys, so this index never holds entries.
      'selected': IDBValidKey;
    };
  };
  [STORE_NAMES.EVENTS]: {
    key: string;
    value: EventStore;
    indexes: {
      'user_email': string;
      'user_calendar_start': [string, string, Date];
      'user_start': [string, Date];
      'calendar_id': string;
      'start': Date;
    };
  };
  [STORE_NAMES.METADATA]: {
    key: [string, string];
    value: MetadataStore;
    indexes: {
      'user_email': string;
      'last_updated': Date;
    };
  };
  [STORE_NAMES.TAGS]: {
    key: number;
    value: TagStore;
    indexes: {
      'user_email': string;
      'event_id': string;
      'user_event': [string, string];
      'user_tag': [string, string];
      'calendar_id': string;
    };
  };
  [STORE_NAMES.LOGGED_EVENTS]: {
    key: string;
    value: any;
    indexes: {
      'user_email': string;
    };
  };
  [STORE_NAMES.TIME_ENTRIES]: {
    key: number;
    value: any;
    indexes: {
      'user_email': string;
    };
  };
  [STORE_NAMES.ANALYTICS_CONFIG]: {
    key: [string, string];
    value: any;
    indexes: {
      'user_email': string;
    };
  };
  [STORE_NAMES.ANALYTICS_CACHE]: {
    key: [string, string];
    value: any;
    indexes: {
      'user_email': string;
    };
  };
}
