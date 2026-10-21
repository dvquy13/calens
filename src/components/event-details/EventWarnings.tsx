import { AlertCircle, Repeat } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { canEditSeries, type EditScope } from '../../lib/recurring/recurring-edit';
import type { GoogleCalendarEvent, GoogleCalendar } from '../../types/calendar';

interface EventWarningsProps {
  event: GoogleCalendarEvent;
  calendars: GoogleCalendar[];
  selectedCalendarId: string;
  /** The series master, once fetched. Null while loading or after a failed fetch. */
  master: GoogleCalendarEvent | null;
  masterError: string | null;
  scope: EditScope;
  onScopeChange: (scope: EditScope) => void;
}

const SCOPE_OPTIONS: { value: EditScope; label: string }[] = [
  { value: 'this', label: 'This event' },
  { value: 'following', label: 'This and following' },
  { value: 'all', label: 'All events' },
];

/**
 * EventWarnings component - Recurring-event scope control and read-only calendar warning
 */
export function EventWarnings({
  event,
  calendars,
  selectedCalendarId,
  master,
  masterError,
  scope,
  onScopeChange,
}: EventWarningsProps) {
  const calendar = calendars.find((c) => c.id === selectedCalendarId);
  const isReadOnly = calendar?.accessRole && !['writer', 'owner'].includes(calendar.accessRole);

  const seriesEditable = !!master && canEditSeries(master, calendar?.accessRole);
  const seriesDisabledReason = seriesEditable
    ? null
    : masterError
    ? 'The series could not be loaded'
    : !master
    ? 'Loading the series'
    : 'Only the organizer can edit the whole series';

  return (
    <>
      {/* Recurring Event Scope */}
      {event.recurringEventId && (
        <div className="space-y-2 p-3 border border-border rounded-md">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Recurring event</p>
          </div>
          <div role="group" aria-label="Apply edits to" className="space-y-1">
            <p className="text-xs text-muted-foreground">Apply edits to</p>
            <TooltipProvider>
              <div className="grid grid-cols-3 gap-1">
                {SCOPE_OPTIONS.map((option) => {
                  const disabled = option.value !== 'this' && seriesDisabledReason !== null;
                  const selected = scope === option.value;
                  const button = (
                    <Button
                      type="button"
                      aria-pressed={selected}
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      className="w-full px-2 text-xs"
                      disabled={disabled}
                      onClick={() => onScopeChange(option.value)}
                    >
                      {option.label}
                    </Button>
                  );
                  if (!disabled || option.value === 'this') return <div key={option.value}>{button}</div>;
                  // Disabled buttons swallow pointer events, so the tooltip hangs on the wrapper.
                  return (
                    <Tooltip key={option.value}>
                      <TooltipTrigger asChild>
                        <span className="flex">{button}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs bg-white border border-border">
                        <p className="text-sm text-foreground">{seriesDisabledReason}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
          {masterError && (
            <p className="text-xs text-red-600 dark:text-red-400">{masterError}</p>
          )}
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
