// Calendar Types for Chrome Extension

export interface User {
  name?: string;
  email?: string;
  picture?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
  location?: string;
  creator?: {
    email: string;
    displayName?: string;
  };
  organizer?: {
    email: string;
    displayName?: string;
  };
  recurringEventId?: string;
  recurrence?: string[];
  status?: string;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: 'email' | 'popup'; minutes: number }>;
  };
  htmlLink?: string;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  selected?: boolean;
  primary?: boolean;
  accessRole?: string;
}

export interface TimeEntry {
  eventId: string;
  calendarId: string;
  calendarName: string;
  calendarColor?: string; // Google Calendar backgroundColor
  title: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  date: string; // YYYY-MM-DD format for grouping
  isAllDay: boolean;
  hasAttendees: boolean;
  attendeeCount: number;
  location?: string;
}

export interface AggregatedEvent {
  title: string;
  totalHours: number;
  calendarColor: string;
}

export interface CategoryTimeStats {
  category: string;
  completed: number; // Hours
  planned: number; // Hours
  color?: string; // Calendar backgroundColor
  aggregatedEvents: AggregatedEvent[];
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
  viewMode: 'day' | 'week' | 'month' | 'agenda';
}

export interface DateRangeMessage {
  type: 'DATE_RANGE_UPDATE';
  dateRange: {
    startDate: string; // ISO string
    endDate: string; // ISO string
    viewMode: 'day' | 'week' | 'month' | 'agenda';
  };
}
