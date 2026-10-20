import { AggregatedEvent } from '../../types/calendar';
import { formatDuration } from '../../lib/calendar-utils';

interface AggregatedEventsListProps {
  events: AggregatedEvent[];
}

export function AggregatedEventsList({ events }: AggregatedEventsListProps) {
  if (events.length === 0) return null;

  return (
    <div className="border-t pt-1">
      <div className="grid grid-cols-[1fr_auto] gap-2 text-xs text-muted-foreground">
        <div className="space-y-1">
          {events.map((event, index) => (
            <div key={index} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: event.calendarColor }}
              />
              <span>{event.title}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1 font-medium">
          {events.map((event, index) => (
            <div key={index} className="text-right">
              {formatDuration(event.totalHours)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}