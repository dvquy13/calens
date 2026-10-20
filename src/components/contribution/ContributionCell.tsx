import { format, parseISO } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { AggregatedEvent } from '../../types/calendar';
import { AggregatedEventsList } from '../ui/aggregated-events-list';
import { formatDuration } from '@/lib/calendar-utils';
import { MessageType } from '../../lib/message-types';

interface ContributionCellProps {
  date: string; // YYYY-MM-DD
  totalHours: number;
  eventCount: number;
  intensity: number; // 0-4
  colorScale: string[]; // Array of 5 hex colors
  size?: number; // Default 12px
  aggregatedEvents: AggregatedEvent[];
}

export function ContributionCell({
  date,
  totalHours,
  eventCount,
  intensity,
  colorScale,
  size = 12,
  aggregatedEvents,
}: ContributionCellProps) {
  // Format tooltip: "Mon, Jan 15: 4h30m (3 events)"
  const dateObj = parseISO(date);
  const weekday = format(dateObj, 'EEE'); // Mon, Tue, etc.
  const monthDay = format(dateObj, 'MMM d'); // Jan 15
  const hoursText = formatDuration(totalHours);
  const eventsText = eventCount === 1 ? '1 event' : `${eventCount} events`;
  const mainTooltipText = `${weekday}, ${monthDay}: ${hoursText} (${eventsText})`;

  const handleClick = () => {
    chrome.runtime.sendMessage({
      type: MessageType.NAVIGATE_TO_DATE,
      date, // Already in YYYY-MM-DD format
    }).catch(console.error);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="rounded border border-transparent hover:border-primary transition-colors cursor-pointer"
            style={{
              width: size,
              height: size,
              backgroundColor: colorScale[intensity]
            }}
            aria-label={mainTooltipText}
            onClick={handleClick}
          />
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          <div className="space-y-1">
            <p>{mainTooltipText}</p>
            <AggregatedEventsList events={aggregatedEvents} />
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
