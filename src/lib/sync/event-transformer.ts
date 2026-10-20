/**
 * Event Transformer
 * Transforms Google Calendar events to EventStore format
 */

import { EventStore } from '@/types/database';

export function transformGoogleEvent(userEmail: string, calendarId: string, googleEvent: any): EventStore {
  return {
    user_email: userEmail,
    id: googleEvent.id,
    calendar_id: calendarId,
    summary: googleEvent.summary || '(No title)',
    start: new Date(googleEvent.start.dateTime || googleEvent.start.date),
    end: new Date(googleEvent.end.dateTime || googleEvent.end.date),
    description: googleEvent.description,
    location: googleEvent.location,
    status: googleEvent.status,
    created_at: new Date(googleEvent.created),
    updated_at: new Date(googleEvent.updated),
    htmlLink: googleEvent.htmlLink,
    recurringEventId: googleEvent.recurringEventId,
    colorId: googleEvent.colorId,
    attendees: googleEvent.attendees,
    isAllDay: !googleEvent.start.dateTime,
    original_start: googleEvent.originalStartTime ? new Date(googleEvent.originalStartTime.dateTime || googleEvent.originalStartTime.date) : undefined,
    etag: googleEvent.etag,
    sequence: googleEvent.sequence
  };
}
