import { useState, useMemo } from 'react';
import { ContributionGraph } from '@/components/contribution/ContributionGraph';
import { WeeklyBarChart } from '@/components/contribution/WeeklyBarChart';
import { UnifiedFilter, PinnedCalendar } from '@/components/contribution/UnifiedFilter';
import { aggregateByDate, calculateColorIntensity } from '@/lib/contribution-aggregator';
import { aggregateByWeek } from '@/lib/weekly-aggregation-utils';
import { aggregateCurrentWeekByWeekday } from '@/lib/weekday-aggregation-utils';
import { filterEvents, getUnifiedColor } from '@/lib/event-filter-utils';
import { generateColorScale, generateNeutralGrayScale } from '@/lib/color-utils';
import {
  generateMockTimeEntries,
  generateMockEventTagsMap,
  MOCK_CALENDARS,
  DEMO_DATE_RANGE,
  DEMO_WEEK_DATE_RANGE,
} from '../../mock-data';

// Generate mock data once (stable across renders via useMemo)
const useMockData = () => {
  return useMemo(() => {
    const events = generateMockTimeEntries();
    const tagsMap = generateMockEventTagsMap(events);
    return { events, tagsMap };
  }, []);
};

// Convert MOCK_CALENDARS to PinnedCalendar format for initial pins
const initialPinnedCalendars: PinnedCalendar[] = MOCK_CALENDARS.map((cal) => ({
  id: cal.id,
  name: cal.label,
  color: cal.color,
}));

export default function ActivityLensDemo() {
  const { events, tagsMap } = useMockData();

  // Filter state
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  const [visibleWeeks, setVisibleWeeks] = useState(13);

  // Use static date range for demo
  const dateRange = DEMO_DATE_RANGE;
  const weekDateRange = DEMO_WEEK_DATE_RANGE;

  // Filter events based on selections
  const filteredEvents = useMemo(() => {
    return filterEvents(events, selectedCalendarIds, selectedTags, tagsMap, selectedEventName);
  }, [events, selectedCalendarIds, selectedTags, tagsMap, selectedEventName]);

  // Aggregate filtered events into contributions
  const contributions = useMemo(() => {
    if (filteredEvents.length === 0) return [];
    const aggregated = aggregateByDate(filteredEvents, dateRange.startDate, dateRange.endDate);
    return calculateColorIntensity(aggregated);
  }, [filteredEvents, dateRange]);

  // Weekly data for bar chart
  const weeklyData = useMemo(() => {
    if (contributions.length === 0) return [];
    return aggregateByWeek(contributions, visibleWeeks);
  }, [contributions, visibleWeeks]);

  // Current week data for weekday bar chart (use static demo week)
  const currentWeekData = useMemo(() => {
    if (contributions.length === 0) return [];
    return aggregateCurrentWeekByWeekday(contributions, weekDateRange.start);
  }, [contributions, weekDateRange.start]);

  // Detect unified color from filtered events (when all events share the same color)
  const unifiedColor = useMemo(() => {
    if (selectedTags.length > 0 || selectedEventName) {
      return getUnifiedColor(filteredEvents);
    }
    return undefined;
  }, [filteredEvents, selectedTags, selectedEventName]);

  // Color scale based on selected calendar or unified color
  const colorScale = useMemo(() => {
    if (selectedCalendarIds.length === 1) {
      const calendar = MOCK_CALENDARS.find((c) => c.id === selectedCalendarIds[0]);
      if (calendar?.color) {
        return generateColorScale(calendar.color);
      }
    }
    if (unifiedColor) {
      return generateColorScale(unifiedColor);
    }
    return generateNeutralGrayScale();
  }, [selectedCalendarIds, unifiedColor]);

  return (
    <div className="w-full space-y-4">
      <UnifiedFilter
        events={events}
        eventTagsMap={tagsMap}
        selectedCalendarIds={selectedCalendarIds}
        onCalendarChange={setSelectedCalendarIds}
        selectedTags={selectedTags}
        onTagChange={setSelectedTags}
        selectedEventName={selectedEventName}
        onEventNameChange={setSelectedEventName}
        initialPinnedCalendars={initialPinnedCalendars}
        persistPins={false}
        placeholder="Filter by calendar, tag, or event name..."
        unifiedColor={unifiedColor}
      />

      <div className="flex justify-center">
        <div className="w-fit space-y-4">
          <ContributionGraph
            contributions={contributions}
            colorScale={colorScale}
            onVisibleWeeksChange={setVisibleWeeks}
            currentWeekData={currentWeekData}
            weekDateRange={weekDateRange}
          />

          {weeklyData.length > 0 && (
            <WeeklyBarChart weeklyData={weeklyData} colorScale={colorScale} />
          )}
        </div>
      </div>
    </div>
  );
}
