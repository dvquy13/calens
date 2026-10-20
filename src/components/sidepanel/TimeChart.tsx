import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip } from '../ui/chart';
import { BarChartTooltip } from '../BarChartTooltip';
import { formatDuration } from '../../lib/calendar-utils';
import { getTextColorForBackground } from '../../lib/color-utils';
import { getTextWidth } from '../../lib/text-utils';
import { ButtonGroup } from '../ui/button-group';
import { Button } from '../ui/button';
import type { CategoryTimeStats } from '../../types/calendar';
import type { AggregationMode } from '../../lib/event-aggregator';

export interface TimeChartProps {
  chartData: CategoryTimeStats[];
  totalHours: number;
  totalCompleted: number;
  totalPlanned: number;
  aggregationMode: AggregationMode;
  onAggregationModeChange: (mode: AggregationMode) => void;
}

const chartConfig = {
  completed: {
    label: "Completed",
    color: "hsl(var(--chart-1))",
  },
  planned: {
    label: "Planned",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export function TimeChart({
  chartData,
  totalHours,
  totalCompleted,
  totalPlanned,
  aggregationMode,
  onAggregationModeChange,
}: TimeChartProps) {
  return (
    <Card className="bg-transparent">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Calendar Progress</CardTitle>
          <ButtonGroup>
            <Button
              variant={aggregationMode === 'calendar' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onAggregationModeChange('calendar')}
            >
              Calendar
            </Button>
            <Button
              variant={aggregationMode === 'title' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onAggregationModeChange('title')}
            >
              Title
            </Button>
            <Button
              variant={aggregationMode === 'tag' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onAggregationModeChange('tag')}
            >
              Tag
            </Button>
          </ButtonGroup>
        </div>
        <CardDescription>Completed vs Planned Hours</CardDescription>
      </CardHeader>
      <CardContent className="pb-0">
        <ChartContainer config={chartConfig} style={{ height: `${chartData.length * 60}px` }}>
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ left: 0, right: 30}}  // right margin 20 so that have enough space to show the total time label to the right of the bar
            barSize={24}
            barCategoryGap={30}
          >
            {/* Y-axis for calendar names (categories) */}
            <YAxis
              dataKey="category"
              type="category"
              tickLine={false}
              axisLine={false}
              width={0}
              tick={false}
              className="text-xs"
            />

            {/* X-axis for hours (hidden) */}
            <XAxis
              type="number"
              hide
            />

            <ChartTooltip
              cursor={false}
              content={<BarChartTooltip />}
            />

            {/* Completed hours - solid fill with calendar color and border */}
            <Bar
              dataKey="completed"
              stackId="a"
              fill="hsl(var(--chart-1))"
              stroke="hsl(var(--chart-1))"
              strokeWidth={1}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-completed-${index}`}
                  fill={entry.color || 'hsl(var(--chart-1))'}
                  stroke={entry.color || 'hsl(var(--chart-1))'}
                  strokeWidth={1}
                  radius={(entry.planned > 0 ? [4, 0, 0, 4] : [4, 4, 4, 4]) as any}
                />
              ))}
              {/* Category label above bar */}
              <LabelList
                dataKey="category"
                content={(props) => {
                  const { x, y, value, index } = props;
                  if (typeof index !== 'number') return null;
                  if (!value) return null;

                  const entry = chartData[index];
                  const labelColor = entry?.color || 'hsl(var(--chart-1))';
                  const labelY = Number(y) - 6; // Position 6px above bar
                  const labelX = Number(x);     // Align with bar's left edge

                  return (
                    <text
                      x={labelX}
                      y={labelY}
                      fill={labelColor}
                      textAnchor="start"
                      dominantBaseline="alphabetic"
                      className="text-[12px] font-medium"
                    >
                      {value}
                    </text>
                  );
                }}
              />
              <LabelList
                dataKey="completed"
                position="insideEnd"
                content={(props) => {
                  const { x, y, width, height, value, index } = props;
                  if (typeof value !== 'number' || value === 0) return null;
                  if (typeof index !== 'number') return null;

                  const entry = chartData[index];
                  const backgroundColor = entry?.color || 'hsl(var(--chart-1))';
                  const textColor = getTextColorForBackground(backgroundColor);

                  // Check if text fits in available space
                  const text = formatDuration(value);
                  const textWidth = getTextWidth(text, 10);
                  if (textWidth === null || textWidth > Number(width) - 8) {
                    return null; // Not enough space
                  }

                  return (
                    <text
                      x={Number(x) + Number(width) - 4}
                      y={Number(y) + Number(height) / 2}
                      fill={textColor}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="text-[10px]"
                    >
                      {text}
                    </text>
                  );
                }}
              />
            </Bar>

            {/* Planned hours - transparent with colored border for progress effect */}
            <Bar
              dataKey="planned"
              stackId="a"
              fill="hsl(var(--chart-1))"
              fillOpacity={0}
              stroke="hsl(var(--chart-1))"
              strokeWidth={1}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-planned-${index}`}
                  fill={entry.color || 'hsl(var(--chart-1))'}
                  stroke={entry.color || 'hsl(var(--chart-1))'}
                  fillOpacity={0}
                  strokeWidth={1}
                  radius={(entry.completed > 0 ? [0, 4, 4, 0] : [4, 4, 4, 4]) as any}
                />
              ))}
              {/* Inside-end label for uncompleted hours */}
              <LabelList
                dataKey="planned"
                position="insideEnd"
                content={(props) => {
                  const { x, y, width, height, value, index } = props;
                  if (typeof value !== 'number' || value === 0) return null;
                  if (typeof index !== 'number') return null;

                  const entry = chartData[index];
                  const barColor = entry?.color || 'hsl(var(--chart-1))';

                  // Check if text fits in available space
                  const text = formatDuration(value);
                  const textWidth = getTextWidth(text, 10);
                  if (textWidth === null || textWidth > Number(width) - 8) {
                    return null; // Not enough space
                  }

                  return (
                    <text
                      x={Number(x) + Number(width) - 4}
                      y={Number(y) + Number(height) / 2}
                      fill={barColor}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="text-[10px]"
                    >
                      {text}
                    </text>
                  );
                }}
              />
              {/* Outside-end label for total hours */}
              <LabelList
                dataKey="planned"
                position="right"
                offset={8}
                content={(props) => {
                  const { x, y, width, height, value, index } = props;
                  if (typeof value !== 'number') return null;
                  if (typeof index !== 'number') return null;

                  const entry = chartData[index];
                  if (!entry) return null;

                  const totalHours = entry.completed + entry.planned;
                  const text = formatDuration(totalHours);

                  // Check if text fits in margin area
                  // Total label is outside, so use lenient threshold
                  const textWidth = getTextWidth(text, 10);
                  if (textWidth !== null && textWidth > 40) {
                    return null; // Hide only if text is very long (e.g., "100h")
                  }

                  return (
                    <text
                      x={Number(x) + Number(width) + 8}
                      y={Number(y) + Number(height) / 2}
                      fill="currentColor"
                      textAnchor="start"
                      dominantBaseline="middle"
                      className="fill-muted-foreground text-[10px]"
                    >
                      {text}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col !items-start gap-2 text-sm">
        <div className="leading-none">
          Total {formatDuration(totalHours)} · <span className="text-muted-foreground">{formatDuration(totalCompleted)} completed · {formatDuration(totalPlanned)} planned</span>
        </div>
      </CardFooter>
    </Card>
  );
}
