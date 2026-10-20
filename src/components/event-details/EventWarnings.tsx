import { AlertCircle } from 'lucide-react';
import type { GoogleCalendarEvent, GoogleCalendar } from '../../types/calendar';

interface EventWarningsProps {
  event: GoogleCalendarEvent;
  calendars: GoogleCalendar[];
  selectedCalendarId: string;
}

/**
 * EventWarnings component - Displays warning banners for recurring events and read-only calendars
 */
export function EventWarnings({ event, calendars, selectedCalendarId }: EventWarningsProps) {
  const calendar = calendars.find((c) => c.id === selectedCalendarId);
  const isReadOnly = calendar?.accessRole && !['writer', 'owner'].includes(calendar.accessRole);

  return (
    <>
      {/* Recurring Event Warning */}
      {event.recurringEventId && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900 rounded-md">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Recurring Event
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              Editing recurring events is not supported yet.
            </p>
          </div>
        </div>
      )}

      {/* Read-only Calendar Warning */}
      {isReadOnly && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900 rounded-md">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Read-only Calendar
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              You don't have permission to edit events on this calendar.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
