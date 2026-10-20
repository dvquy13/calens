import { Area, AreaChart, XAxis, YAxis } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import { formatDuration } from '../../lib/calendar-utils';
import type { WeeklyContribution } from '../../lib/weekly-aggregation-utils';

interface WeeklyHoursAreaChartProps {
  weeklyData: WeeklyContribution[];
  colorScale: string[];
}

export function WeeklyHoursAreaChart({
  weeklyData,
  colorScale,
}: WeeklyHoursAreaChartProps) {
  const chartConfig = {
    totalHours: {
      label: "Hours",
      color: colorScale[4], // Use highest intensity color from scale
    },
  } satisfies ChartConfig;

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-lg font-semibold">Weekly Activity</h3>
        <p className="text-sm text-muted-foreground">Total hours per week</p>
      </div>
      <ChartContainer config={chartConfig} style={{ height: '200px' }}>
        <AreaChart
          accessibilityLayer
          data={weeklyData}
          margin={{
            top: 10,
            right: 10,
            bottom: 20,
            left: 0,
          }}
        >
          <XAxis
            dataKey="weekLabel"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            className="text-xs"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => formatDuration(value)}
            className="text-xs"
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(label, payload) => {
                  if (payload && payload.length > 0) {
                    return `Week of ${label}`;
                  }
                  return label;
                }}
                formatter={(value, name) => {
                  if (name === 'totalHours') {
                    const data = weeklyData.find(d => d.totalHours === value);
                    return [
                      <div key="hours" className="flex flex-col gap-0.5">
                        <span>{formatDuration(value as number)}</span>
                        {data && (
                          <span className="text-xs text-muted-foreground">
                            {data.eventCount} {data.eventCount === 1 ? 'event' : 'events'}
                          </span>
                        )}
                      </div>,
                      'Hours'
                    ];
                  }
                  return [value, name];
                }}
              />
            }
          />
          <Area
            dataKey="totalHours"
            type="monotone"
            fill={colorScale[2]} // Mid-level intensity for fill
            fillOpacity={0.4}
            stroke={colorScale[4]} // Highest intensity for stroke
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
