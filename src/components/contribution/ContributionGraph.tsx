import { useRef, useState, useEffect, useMemo } from 'react';
import { startOfWeek, format as formatDate } from 'date-fns';
import { DayContribution } from '../../lib/contribution-aggregator';
import { ContributionCell } from './ContributionCell';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { formatDuration } from '@/lib/calendar-utils';
import { CELL_WIDTH, CELL_GAP, WEEKDAY_LABEL_WIDTH } from '@/lib/contribution-constants';
import { getTextColorForBackground } from '@/lib/color-utils';
import { getTextWidth } from '@/lib/text-utils';
import type { WeekdayContribution } from '@/lib/weekday-aggregation-utils';

interface ContributionGraphProps {
  contributions: Array<DayContribution & { intensity: number }>;
  colorScale: string[];
  onVisibleWeeksChange?: (weeks: number) => void;
  currentWeekData?: WeekdayContribution[];
  weekDateRange?: { start: Date; end: Date };
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Width calculation constants
const MIN_WEEKS = 4;
const WEEK_WIDTH = CELL_WIDTH + CELL_GAP; // 14px
const MIN_BAR_CHART_SPACE = 80; // Minimum space for bar chart section (bar + label)
const MAX_BAR_WIDTH = 80; // Maximum bar width (increased since bar chart now fills remaining space)

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Calculate visible weeks based on container width
function calculateVisibleWeeks(containerWidth: number, hasBarChart: boolean): number {
  const barChartSpace = hasBarChart ? MIN_BAR_CHART_SPACE + 16 : 0; // 16px gap
  const availableWidth = containerWidth - WEEKDAY_LABEL_WIDTH - barChartSpace;
  const weeks = Math.floor((availableWidth + CELL_GAP) / WEEK_WIDTH);
  return Math.max(MIN_WEEKS, weeks);
}

export function ContributionGraph({ contributions, colorScale, onVisibleWeeksChange, currentWeekData, weekDateRange }: ContributionGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleWeeks, setVisibleWeeks] = useState(13);

  const hasBarChart = Boolean(currentWeekData && currentWeekData.length > 0);

  // Initial measurement and ResizeObserver setup
  useEffect(() => {
    if (!containerRef.current) return;

    // Initial measurement
    const initialWeeks = calculateVisibleWeeks(containerRef.current.offsetWidth, hasBarChart);
    setVisibleWeeks(initialWeeks);
    onVisibleWeeksChange?.(initialWeeks);

    // Setup ResizeObserver with debouncing
    const debouncedResize = debounce((entries: ResizeObserverEntry[]) => {
      const width = entries[0].contentRect.width;
      const weeks = calculateVisibleWeeks(width, hasBarChart);
      setVisibleWeeks(weeks);
      onVisibleWeeksChange?.(weeks);
    }, 300);

    const observer = new ResizeObserver(debouncedResize);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [onVisibleWeeksChange, hasBarChart]);

  // Calculate max hours for bar scaling
  const maxBarHours = useMemo(() => {
    if (!currentWeekData || currentWeekData.length === 0) return 0;
    return Math.max(...currentWeekData.map((d) => d.totalHours));
  }, [currentWeekData]);

  // Show most recent N weeks that fit in the container width
  // Slice to show last N weeks (ending with current week)
  const visibleContributions = useMemo(
    () => contributions.slice(-visibleWeeks * 7),
    [contributions, visibleWeeks]
  );

  // Group contributions by week (columns) - memoized for efficiency
  const weeks = useMemo(() => {
    const result: Array<Map<number, DayContribution & { intensity: number }>> = [];
    let currentWeek = new Map<number, DayContribution & { intensity: number }>();
    let currentWeekStart: Date | null = null;

    visibleContributions.forEach((contrib) => {
      const date = new Date(contrib.date);
      const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
      const weekKey = formatDate(weekStart, 'yyyy-MM-dd');

      // Check if we need to start a new week
      if (!currentWeekStart || formatDate(currentWeekStart, 'yyyy-MM-dd') !== weekKey) {
        if (currentWeek.size > 0) {
          result.push(currentWeek);
        }
        currentWeek = new Map();
        currentWeekStart = weekStart;
      }

      // Add contribution to current week at the appropriate weekday
      currentWeek.set(contrib.weekday, contrib);
    });

    // Add the last week
    if (currentWeek.size > 0) {
      result.push(currentWeek);
    }

    return result;
  }, [visibleContributions]);

  // Find the week that matches weekDateRange for bar chart colors
  const barChartWeek = useMemo(() => {
    if (!weekDateRange) return weeks[weeks.length - 1];

    const weekStartStr = formatDate(weekDateRange.start, 'yyyy-MM-dd');
    const weekEndStr = formatDate(weekDateRange.end, 'yyyy-MM-dd');

    // Find the week that contains days within the weekDateRange
    for (const week of weeks) {
      for (const contrib of week.values()) {
        if (contrib.date >= weekStartStr && contrib.date <= weekEndStr) {
          return week;
        }
      }
    }

    // Fallback to last week if not found
    return weeks[weeks.length - 1];
  }, [weeks, weekDateRange]);

  // Generate month headers - find the first day with data in each week to determine month
  const monthHeaders = useMemo(() => {
    const headers: Array<{ month: string; weekIndex: number; span: number }> = [];
    let lastMonth = '';
    let monthStart = 0;

    weeks.forEach((week, weekIndex) => {
      // Find first day with data in this week (check Mon, Tue, Wed... in order)
      let firstDayWithData: (DayContribution & { intensity: number }) | undefined;
      for (let i = 0; i < 7; i++) {
        const day = week.get(i);
        if (day) {
          firstDayWithData = day;
          break;
        }
      }

      if (firstDayWithData && firstDayWithData.month !== lastMonth) {
        if (lastMonth) {
          headers.push({
            month: lastMonth,
            weekIndex: monthStart,
            span: weekIndex - monthStart,
          });
        }
        lastMonth = firstDayWithData.month;
        monthStart = weekIndex;
      }
    });

    if (lastMonth) {
      headers.push({
        month: lastMonth,
        weekIndex: monthStart,
        span: weeks.length - monthStart,
      });
    }

    return headers;
  }, [weeks]);

  if (contributions.length === 0) {
    return <div className="text-sm text-muted-foreground">No data available</div>;
  }

  return (
    <div ref={containerRef} className="space-y-2 w-full">
      {/* Month headers */}
      <div className="flex items-start">
        <div className="w-10 flex-shrink-0" /> {/* Space for weekday labels */}
        <div className="flex gap-[2px]">
          {weeks.map((_week, weekIndex) => {
            // Find which month this week belongs to
            const monthHeaderIndex = monthHeaders.findIndex(
              (h) => weekIndex >= h.weekIndex && weekIndex < h.weekIndex + h.span
            );
            const monthHeader = monthHeaderIndex >= 0 ? monthHeaders[monthHeaderIndex] : undefined;
            const isFirstWeekOfMonth = monthHeader && weekIndex === monthHeader.weekIndex;
            const isLastMonth = monthHeaderIndex === monthHeaders.length - 1;
            // Show label if there's enough span (at least 3 weeks) OR it's the last month
            const hasEnoughSpace = monthHeader && (monthHeader.span >= 3 || isLastMonth);

            return (
              <div key={weekIndex} className="flex-shrink-0" style={{ width: 12 }}>
                {isFirstWeekOfMonth && hasEnoughSpace && (
                  <div className="text-xs text-muted-foreground">{monthHeader.month}</div>
                )}
              </div>
            );
          })}
        </div>
        {/* Week date range header for bar chart */}
        {hasBarChart && (
          <div className="ml-4 flex-1 text-xs text-muted-foreground whitespace-nowrap">
            {weekDateRange
              ? `${formatDate(weekDateRange.start, 'MMM d')} - ${formatDate(weekDateRange.end, 'MMM d')}`
              : 'This Week'}
          </div>
        )}
      </div>

          {/* Contribution grid */}
          <div className="space-y-[2px]">
            {WEEKDAY_LABELS.map((label, weekdayIndex) => {
              const weekdayData = currentWeekData?.[weekdayIndex];
              const barWidth = maxBarHours === 0 ? 0 : ((weekdayData?.totalHours || 0) / maxBarHours) * MAX_BAR_WIDTH;

              return (
                <div key={label} className="flex items-center">
                  {/* Weekday label */}
                  <div className="w-10 text-xs text-muted-foreground text-left flex-shrink-0">
                    {label}
                  </div>
                  {/* Cells for this weekday across all weeks */}
                  <div className="flex gap-[2px]">
                    {weeks.map((week, weekIndex) => {
                      const contrib = week.get(weekdayIndex);
                      if (contrib) {
                        return (
                          <ContributionCell
                            key={`${weekIndex}-${weekdayIndex}`}
                            date={contrib.date}
                            totalHours={contrib.totalHours}
                            eventCount={contrib.eventCount}
                            intensity={contrib.intensity}
                            colorScale={colorScale}
                            size={12}
                            aggregatedEvents={contrib.aggregatedEvents}
                          />
                        );
                      } else {
                        // Empty cell - use same styling as intensity 0 to maintain alignment
                        return (
                          <div
                            key={`${weekIndex}-${weekdayIndex}-empty`}
                            className="rounded border border-transparent"
                            style={{ width: 12, height: 12, backgroundColor: colorScale[0] }}
                          />
                        );
                      }
                    })}
                  </div>
                  {/* Inline bar for this weekday */}
                  {hasBarChart && weekdayData && (() => {
                    const durationText = formatDuration(weekdayData.totalHours);
                    const textWidth = getTextWidth(durationText, 10);
                    const fitsInside = textWidth !== null && barWidth >= textWidth + 8;
                    // Get bar color from corresponding cell in the week matching weekDateRange
                    const cellForDay = barChartWeek?.get(weekdayIndex);
                    const barColor = cellForDay ? colorScale[cellForDay.intensity] : colorScale[0];

                    return (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="ml-4 flex-1 flex items-center cursor-default">
                              <div
                                className="relative rounded-sm transition-opacity hover:opacity-100 flex items-center justify-end"
                                style={{
                                  width: barWidth,
                                  height: CELL_WIDTH,
                                  backgroundColor: weekdayData.totalHours > 0 ? barColor : 'transparent',
                                  opacity: 0.9,
                                  minWidth: weekdayData.totalHours > 0 ? 2 : 0,
                                }}
                              >
                                {weekdayData.totalHours > 0 && fitsInside && (
                                  <span
                                    className="text-[10px] pr-1"
                                    style={{ color: getTextColorForBackground(barColor) }}
                                  >
                                    {durationText}
                                  </span>
                                )}
                              </div>
                              {weekdayData.totalHours > 0 && !fitsInside && (
                                <span className="ml-1 text-[11px] text-muted-foreground">
                                  {durationText}
                                </span>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" align="center">
                            <p>{weekdayData.weekdayLabel}: {formatDuration(weekdayData.totalHours)} ({weekdayData.eventCount} {weekdayData.eventCount === 1 ? 'event' : 'events'})</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })()}
                </div>
              );
            })}
      </div>
    </div>
  );
}
