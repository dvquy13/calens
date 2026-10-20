import { parseISO, differenceInMinutes } from 'date-fns';
import type { GoogleCalendarEvent, TimeEntry } from '../types/calendar';

/**
 * Parse Google Calendar event datetime to Date object
 */
export function parseEventDateTime(
  dateTime?: string,
  date?: string,
  _timeZone?: string
): Date {
  if (dateTime) {
    // Event with specific time
    return parseISO(dateTime);
  } else if (date) {
    // All-day event
    return parseISO(date);
  }
  throw new Error('Event must have either dateTime or date');
}

/**
 * Calculate duration in minutes between start and end times
 */
export function calculateDuration(startTime: Date, endTime: Date): number {
  return differenceInMinutes(endTime, startTime);
}

/**
 * Check if event has completed (ended before current time)
 */
export function isEventCompleted(endTime: Date): boolean {
  return endTime < new Date();
}

/**
 * Format duration in hours to human-readable format (e.g., "7h45m", "30m", "2h")
 */
export function formatDuration(hours: number): string {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);

  if (wholeHours === 0) {
    return `${minutes}m`; // "30m" for sub-hour durations
  }
  if (minutes === 0) {
    return `${wholeHours}h`; // "7h" for exact hours
  }
  return `${wholeHours}h${minutes}m`; // "7h45m" for mixed
}

/**
 * Format date to YYYY-MM-DD in local timezone (not UTC)
 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert Google Calendar event to TimeEntry
 */
export function convertToTimeEntry(
  event: GoogleCalendarEvent,
  calendarName: string,
  calendarColor?: string
): TimeEntry {
  const startTime = parseEventDateTime(
    event.start.dateTime,
    event.start.date,
    event.start.timeZone
  );
  const endTime = parseEventDateTime(
    event.end.dateTime,
    event.end.date,
    event.end.timeZone
  );

  const durationMinutes = calculateDuration(startTime, endTime);
  const isAllDay = !event.start.dateTime; // All-day events don't have dateTime
  const attendeeCount = event.attendees?.length || 0;

  // Format date as YYYY-MM-DD for grouping (in local timezone)
  const date = formatDateLocal(startTime);

  return {
    eventId: event.id,
    calendarId: event.organizer?.email || event.creator?.email || '',
    calendarName,
    calendarColor,
    title: event.summary,
    startTime,
    endTime,
    durationMinutes,
    date,
    isAllDay,
    hasAttendees: attendeeCount > 0,
    attendeeCount,
    location: event.location,
  };
}
