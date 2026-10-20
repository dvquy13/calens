/**
 * Type-safe message constants for Chrome extension messaging
 * Replaces hardcoded string literals throughout the codebase
 */

export const MessageType = {
  DATE_RANGE_UPDATE: 'DATE_RANGE_UPDATE',
  GET_DATE_RANGE: 'GET_DATE_RANGE',
  CLOSE_SIDE_PANEL: 'closeSidePanel',
  TRIGGER_SYNC: 'TRIGGER_SYNC',
  SYNC_STARTED: 'SYNC_STARTED',
  SYNC_COMPLETE: 'SYNC_COMPLETE', // Notifies UI that sync is done, refresh from IndexedDB
  EVENT_SELECTED: 'EVENT_SELECTED',
  UPDATE_EVENT_START: 'UPDATE_EVENT_START',
  UPDATE_EVENT_SUCCESS: 'UPDATE_EVENT_SUCCESS',
  UPDATE_EVENT_FAILED: 'UPDATE_EVENT_FAILED',

  // IndexedDB query messages
  GET_CALENDARS: 'GET_CALENDARS',
  GET_EVENTS_BY_RANGE: 'GET_EVENTS_BY_RANGE',
  GET_EVENT: 'GET_EVENT',
  GET_CALENDAR_EVENTS: 'GET_CALENDAR_EVENTS',
  GET_EVENT_TAGS: 'GET_EVENT_TAGS',
  INITIAL_SYNC: 'INITIAL_SYNC',
  NAVIGATE_TO_DATE: 'NAVIGATE_TO_DATE',
  FORWARD_KEYBOARD_SHORTCUT: 'FORWARD_KEYBOARD_SHORTCUT',

  // Sync metadata management
  CLEAR_SYNC_CHECKPOINTS: 'CLEAR_SYNC_CHECKPOINTS',
  GET_LAST_SYNC_TIME: 'GET_LAST_SYNC_TIME',

  // Diagnostics
  DIAG_LOG: 'DIAG_LOG', // panel/content -> SW, fire-and-forget
  DIAG_CLEAR: 'DIAG_CLEAR', // panel -> SW, responds { success }
  GET_DIAGNOSTICS_REPORT: 'GET_DIAGNOSTICS_REPORT', // panel -> SW, responds { success, data: DiagnosticsReport }
} as const;

export type MessageTypeKeys = typeof MessageType[keyof typeof MessageType];

export interface DateRangeUpdateMessage {
  type: typeof MessageType.DATE_RANGE_UPDATE;
  dateRange: {
    startDate: string; // ISO string
    endDate: string; // ISO string
    viewMode: 'day' | 'week' | 'month' | 'agenda';
  };
}

export interface GetDateRangeMessage {
  type: typeof MessageType.GET_DATE_RANGE;
}

export interface CloseSidePanelMessage {
  type: typeof MessageType.CLOSE_SIDE_PANEL;
}

export interface TriggerSyncMessage {
  type: typeof MessageType.TRIGGER_SYNC;
  skipDebounce?: boolean; // Set to true to bypass debounce check
  targetCalendarIds?: string[]; // Optional: specific calendars to sync
}

export interface SyncStartedMessage {
  type: typeof MessageType.SYNC_STARTED;
  syncType: 'initial' | 'incremental' | 'manual';
}

export interface SyncCompleteMessage {
  type: typeof MessageType.SYNC_COMPLETE;
}

export interface EventSelectedMessage {
  type: typeof MessageType.EVENT_SELECTED;
  encodedEventId: string;
}

export interface UpdateEventStartMessage {
  type: typeof MessageType.UPDATE_EVENT_START;
}

export interface UpdateEventSuccessMessage {
  type: typeof MessageType.UPDATE_EVENT_SUCCESS;
  eventId: string;
}

export interface UpdateEventFailedMessage {
  type: typeof MessageType.UPDATE_EVENT_FAILED;
  error: string;
}

// IndexedDB query message interfaces
export interface GetCalendarsMessage {
  type: typeof MessageType.GET_CALENDARS;
  userEmail: string;
}

export interface GetEventsByRangeMessage {
  type: typeof MessageType.GET_EVENTS_BY_RANGE;
  userEmail: string;
  startDate: string;
  endDate: string;
}

export interface GetEventMessage {
  type: typeof MessageType.GET_EVENT;
  eventId: string;
}

export interface GetCalendarEventsMessage {
  type: typeof MessageType.GET_CALENDAR_EVENTS;
  userEmail: string;
  calendarId: string;
}

export interface GetEventTagsMessage {
  type: typeof MessageType.GET_EVENT_TAGS;
  eventIds: string[];
}

export interface InitialSyncMessage {
  type: typeof MessageType.INITIAL_SYNC;
  userEmail: string;
}

export interface NavigateToDateMessage {
  type: typeof MessageType.NAVIGATE_TO_DATE;
  date: string; // YYYY-MM-DD format
}

export interface ForwardKeyboardShortcutMessage {
  type: typeof MessageType.FORWARD_KEYBOARD_SHORTCUT;
  key: string;
}

export interface ClearSyncCheckpointsMessage {
  type: typeof MessageType.CLEAR_SYNC_CHECKPOINTS;
  userEmail: string;
}

export interface GetLastSyncTimeMessage {
  type: typeof MessageType.GET_LAST_SYNC_TIME;
  userEmail: string;
}

export interface DiagLogMessage {
  type: typeof MessageType.DIAG_LOG;
  cat: import('./diag-log').DiagCat;
  level: import('./diag-log').DiagLevel;
  msg: string;
  data?: Record<string, unknown>;
}

export interface DiagClearMessage {
  type: typeof MessageType.DIAG_CLEAR;
}

export interface GetDiagnosticsReportMessage {
  type: typeof MessageType.GET_DIAGNOSTICS_REPORT;
  panelState: { selectedEventId?: string | null; currentError?: string | null };
}

export type ChromeMessage =
  | DateRangeUpdateMessage
  | GetDateRangeMessage
  | CloseSidePanelMessage
  | TriggerSyncMessage
  | SyncStartedMessage
  | SyncCompleteMessage
  | EventSelectedMessage
  | UpdateEventStartMessage
  | UpdateEventSuccessMessage
  | UpdateEventFailedMessage
  | GetCalendarsMessage
  | GetEventsByRangeMessage
  | GetEventMessage
  | GetCalendarEventsMessage
  | GetEventTagsMessage
  | InitialSyncMessage
  | NavigateToDateMessage
  | ForwardKeyboardShortcutMessage
  | ClearSyncCheckpointsMessage
  | GetLastSyncTimeMessage
  | DiagLogMessage
  | DiagClearMessage
  | GetDiagnosticsReportMessage;
