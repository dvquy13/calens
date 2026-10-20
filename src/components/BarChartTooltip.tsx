import React from 'react';
import { formatDuration } from '@/lib/calendar-utils';
import { AggregatedEventsList } from './ui/aggregated-events-list';

interface TooltipPayload {
  name?: string;
  value?: number;
  dataKey?: string;
  color?: string;
  payload?: {
    completed: number;
    planned: number;
    color?: string;
    category?: string;
    aggregatedEvents?: Array<{
      title: string;
      totalHours: number;
      calendarColor: string;
    }>;
  };
}

interface BarChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

export const BarChartTooltip = React.forwardRef<HTMLDivElement, BarChartTooltipProps>(
  ({ active, payload }, ref) => {
    if (!active || !payload?.length) {
      return null;
    }

    // Get the data from the payload
    const data = payload[0]?.payload;
    if (!data) {
      return null;
    }

    const { completed, planned, color, aggregatedEvents } = data;
    const total = completed + planned;

    // Calculate percentages
    const completedPercentage = total > 0 ? (completed / total) * 100 : 0;
    const plannedPercentage = total > 0 ? (planned / total) * 100 : 0;

    // Format values with percentages
    const completedText = total > 0
      ? `${formatDuration(completed)} (${completedPercentage.toFixed(0)}%)`
      : formatDuration(completed);
    const plannedText = total > 0
      ? `${formatDuration(planned)} (${plannedPercentage.toFixed(0)}%)`
      : formatDuration(planned);

    return (
      <div
        ref={ref}
        className="grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
      >
        <div className="grid gap-1.5">
          {/* Completed */}
          {completed > 0 && (
            <div className="flex w-full items-center gap-3">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: color || 'hsl(var(--chart-1))' }}
              />
              <div className="flex flex-1 justify-between items-center gap-4">
                <span className="text-muted-foreground">Completed</span>
                <span className="font-medium tabular-nums text-foreground">
                  {completedText}
                </span>
              </div>
            </div>
          )}

          {/* Planned */}
          {planned > 0 && (
            <div className="flex w-full items-center gap-3">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px] border"
                style={{
                  borderColor: color || 'hsl(var(--chart-1))',
                  backgroundColor: 'transparent'
                }}
              />
              <div className="flex flex-1 justify-between items-center gap-4">
                <span className="text-muted-foreground">Planned</span>
                <span className="font-medium tabular-nums text-foreground">
                  {plannedText}
                </span>
              </div>
            </div>
          )}

          <AggregatedEventsList events={aggregatedEvents || []} />
        </div>
      </div>
    );
  }
);

BarChartTooltip.displayName = 'BarChartTooltip';
