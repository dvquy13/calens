export const DB_NAME = 'CalendarDB';
export const DB_VERSION = 2;

export const STORE_NAMES = {
  CALENDARS: 'calendars',
  EVENTS: 'events',
  METADATA: 'metadata',
  TAGS: 'tags',
  LOGGED_EVENTS: 'logged_events',
  TIME_ENTRIES: 'time_entries',
  ANALYTICS_CONFIG: 'analytics_config',
  ANALYTICS_CACHE: 'analytics_cache'
} as const;

export interface CalendarStore {
  user_email: string;
  id: string; // Google Calendar ID
  summary: string;
  description?: string;
  primary: boolean;
  selected: boolean; // User preference: sync this calendar?
  backgroundColor?: string;
  accessRole: string;
  created_at: Date;
}

export interface EventStore {
  user_email: string;
  id: string; // Google event ID
  calendar_id: string;
  summary: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  status: string;
  created_at: Date;
  updated_at: Date;

  // Additional fields from review
  htmlLink?: string;           // Link to event in Google Calendar
  recurringEventId?: string;  // For recurring event instances
  colorId?: string;            // Event color override
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  isAllDay: boolean;          // Explicit flag (not derived)
  original_start?: Date;        // For recurring instances
  etag?: string;                // For conflict detection
  sequence?: number;            // For update ordering
}

export interface MetadataStore {
  user_email: string;
  key: string; // Compound primary key part
  value: any; // JSON-serializable metadata
  last_updated: Date;
  cache_expiry?: Date;
  data_version?: number;
}

export interface TagStore {
  user_email: string;
  id?: number; // Auto-increment
  event_id: string;
  calendar_id: string;
  tag_name: string; // Case-sensitive
  created_at: Date;
}

export const SYNC_METADATA_KEYS = {
  LAST_FULL_SYNC: 'last_full_sync',
  LAST_SYNC_PREFIX: 'last_sync_', // Followed by calendar ID
} as const;

export interface SyncMetadata {
  calendar_id: string;
  calendar_name: string;
  events_updated: number;
  last_sync: Date;
}

export interface FullSyncMetadata {
  timestamp: Date;
  calendars_synced: number;
  events_updated: number;
}
