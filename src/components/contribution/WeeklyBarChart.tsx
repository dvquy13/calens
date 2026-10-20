import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { formatDuration } from '@/lib/calendar-utils';
import { CELL_WIDTH, WEEKDAY_LABEL_WIDTH } from '@/lib/contribution-constants';
import type { WeeklyContribution } from '@/lib/weekly-aggregation-utils';

interface WeeklyBarChartProps {
  weeklyData: WeeklyContribution[];
  colorScale: string[];
}

const CHART_HEIGHT = 70;

export function WeeklyBarChart({
  weeklyData,
  colorScale,
}: WeeklyBarChartProps) {
  if (weeklyData.length === 0) {
    return null;
  }

  // Calculate Y-axis scale
  const maxHours = Math.max(...weeklyData.map(w => w.totalHours));
  const roundedMax = Math.ceil(maxHours / 10) * 10;
  const maxWithPadding = roundedMax;
  const ticks = maxHours === 0 ? [0] : [0, maxWithPadding / 2, maxWithPadding];

  return (
    <div className="w-full">
      {/* Bars left-aligned to match contribution graph */}
      <div className="flex items-end" style={{ height: CHART_HEIGHT }}>
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between h-full pr-2" style={{ width: WEEKDAY_LABEL_WIDTH }}>
          {ticks.reverse().map((tick, index) => (
            <div key={index} className="text-xs text-muted-foreground text-left leading-none">
              {Math.round(tick / 10) * 10}h
            </div>
          ))}
        </div>

        {/* Bars */}
        <div className="flex items-end gap-[2px]">
          {weeklyData.map((week, index) => {
            const barHeight = maxHours === 0 ? 0 : (week.totalHours / maxWithPadding) * CHART_HEIGHT;
            const tooltipText = `Week of ${week.weekLabel}: ${formatDuration(week.totalHours)} (${week.eventCount} ${week.eventCount === 1 ? 'event' : 'events'})`;

            return (
              <TooltipProvider key={index} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="rounded-sm cursor-default transition-opacity hover:opacity-100"
                      style={{
                        width: CELL_WIDTH,
                        height: barHeight,
                        backgroundColor: colorScale[3],
                        opacity: 0.9,
                      }}
                      aria-label={tooltipText}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center">
                    <p>{tooltipText}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>
    </div>
  );
}