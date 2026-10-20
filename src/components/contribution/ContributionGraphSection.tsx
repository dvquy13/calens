import { useState, useEffect, useMemo, useCallback } from 'react';
import { startOfWeek, subWeeks, endOfWeek } from 'date-fns';
import { TimeEntry } from '../../types/calendar';
import { aggregateByDate, calculateColorIntensity } from '../../lib/contribution-aggregator';
import { aggregateByWeek } from '../../lib/weekly-aggregation-utils';
import { aggregateCurrentWeekByWeekday } from '../../lib/weekday-aggregation-utils';
import { filterEvents, getUniqueCalendars, getUnifiedColor } from '../../lib/event-filter-utils';
import { generateColorScale, generateNeutralGrayScale } from '../../lib/color-utils';
import { formatDateLocal, formatDuration } from '../../lib/calendar-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { ContributionGraph } from './ContributionGraph';
import { UnifiedFilter } from './UnifiedFilter';
import { WeeklyBarChart } from './WeeklyBarChart';
import { MessageType } from '../../lib/message-types';
import type { EventStore } from '../../types/database';

interface ContributionGraphSectionProps {
  userEmail: string | null;
  calendarDateRange?: {
    startDate: string;
    endDate: string;
    viewMode: 'day' | 'week' | 'month' | 'agenda';
  } | null;
}

export function ContributionGraphSection({ userEmail, calendarDateRange }: ContributionGraphSectionProps) {
  const [events, setEvents] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleWeeks, setVisibleWeeks] = useState(26);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  const [eventTagsMap, setEventTagsMap] = useState<Map<string, string[]>>(new Map());
  const [loadingTags, setLoadingTags] = useState(false);

  // Calculate 52 weeks (1 year) ending at the current week (Sunday is end of week)
  const dateRange = useMemo(() => {
    const today = new Date();
    const endDate = endOfWeek(today, { weekStartsOn: 1 }); // End of current week (Sunday)
    const startDate = startOfWeek(subWeeks(endDate, 51), { weekStartsOn: 1 }); // 52 weeks back (Monday)
    return { startDate, endDate };
  }, []);

  // Fetch events from IndexedDB for the 52-week period
  const loadEvents = useCallback(() => {
    if (!userEmail) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fetch calendars first to get calendar names and colors
    Promise.all([
      chrome.runtime.sendMessage({
        type: MessageType.GET_CALENDARS,
        userEmail,
      }),
      chrome.runtime.sendMessage({
        type: MessageType.GET_EVENTS_BY_RANGE,
        userEmail,
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      })
    ])
      .then(([calendarsResponse, eventsResponse]) => {
        if (calendarsResponse.success && eventsResponse.success && eventsResponse.data) {
          const calendars = calendarsResponse.data || [];

          // Convert EventStore to TimeEntry and filter out all-day events
          const timeEntries: TimeEntry[] = eventsResponse.data
            .filter((event: EventStore) => !event.isAllDay) // Filter all-day events FIRST
            .map((event: EventStore) => {
              const calendar = calendars.find((cal: any) => cal.id === event.calendar_id);
              const startTime = new Date(event.start);
              const endTime = new Date(event.end);
              return {
                eventId: event.id,
                calendarId: event.calendar_id,
                calendarName: calendar?.summary || 'Unknown',
                calendarColor: calendar?.backgroundColor || '#4285f4',
                title: event.summary || '(No title)',
                startTime,
                endTime,
                durationMinutes: (endTime.getTime() - startTime.getTime()) / 60000,
                date: formatDateLocal(startTime), // YYYY-MM-DD in local timezone
                isAllDay: event.isAllDay,
                hasAttendees: (event.attendees?.length || 0) > 0,
                attendeeCount: event.attendees?.length || 0,
                location: event.location,
              };
            });
          setEvents(timeEntries);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error('[ContributionGraph] Failed to fetch data:', error);
        setLoading(false);
      });
  }, [userEmail, dateRange]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Listen for SYNC_COMPLETE message to refresh data after sync
  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === MessageType.SYNC_COMPLETE) {
        console.log('[ContributionGraph] Sync complete, refreshing data from IndexedDB');
        loadEvents();
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [loadEvents]);

  // Load tags for all events
  useEffect(() => {
    if (!userEmail || events.length === 0) {
      return;
    }

    setLoadingTags(true);
    const eventIds = events.map(e => e.eventId);

    chrome.runtime.sendMessage({
      type: MessageType.GET_EVENT_TAGS,
      eventIds,
    })
      .then(response => {
        if (response.success && response.data) {
          const map = new Map<string, string[]>();
          Object.entries(response.data).forEach(([eventId, tags]) => {
            map.set(eventId, tags as string[]);
          });
          setEventTagsMap(map);
        }
        setLoadingTags(false);
      })
      .catch((error) => {
        console.error('[ContributionGraph] Failed to fetch tags:', error);
        setLoadingTags(false);
      });
  }, [events, userEmail]);

  const availableCalendars = useMemo(() =>
    getUniqueCalendars(events),
    [events]
  );

  const filteredEvents = useMemo(() =>
    filterEvents(events, selectedCalendarIds, selectedTags, eventTagsMap, selectedEventName),
    [events, selectedCalendarIds, selectedTags, eventTagsMap, selectedEventName]
  );

  const contributions = useMemo(() => {
    if (filteredEvents.length === 0) return [];
    const aggregated = aggregateByDate(filteredEvents, dateRange.startDate, dateRange.endDate);
    return calculateColorIntensity(aggregated);
  }, [filteredEvents, dateRange]);

  const weeklyData = useMemo(() => {
    if (contributions.length === 0) return [];
    return aggregateByWeek(contributions, visibleWeeks);
  }, [contributions, visibleWeeks]);

  const currentWeekData = useMemo(() => {
    if (contributions.length === 0) return [];
    const referenceDate = calendarDateRange?.startDate
      ? new Date(calendarDateRange.startDate)
      : undefined;
    return aggregateCurrentWeekByWeekday(contributions, referenceDate);
  }, [contributions, calendarDateRange?.startDate]);

  const weekDateRange = useMemo(() => {
    const referenceDate = calendarDateRange?.startDate
      ? new Date(calendarDateRange.startDate)
      : new Date();
    return {
      start: startOfWeek(referenceDate, { weekStartsOn: 1 }),
      end: endOfWeek(referenceDate, { weekStartsOn: 1 }),
    };
  }, [calendarDateRange?.startDate]);

  // Detect unified color from filtered events (when all events share the same color)
  const unifiedColor = useMemo(() => {
    // Only detect unified color when filtering by tag or event name (not just calendar)
    if (selectedTags.length > 0 || selectedEventName) {
      return getUnifiedColor(filteredEvents);
    }
    return undefined;
  }, [filteredEvents, selectedTags, selectedEventName]);

  const colorScale = useMemo(() => {
    // Priority 1: Single calendar explicitly selected
    if (selectedCalendarIds.length === 1) {
      const calendar = availableCalendars.find(cal => cal.id === selectedCalendarIds[0]);
      if (calendar?.color) {
        return generateColorScale(calendar.color);
      }
    }
    // Priority 2: All filtered events share the same color (e.g., tag filter on single-color events)
    if (unifiedColor) {
      return generateColorScale(unifiedColor);
    }
    return generateNeutralGrayScale();
  }, [selectedCalendarIds, availableCalendars, unifiedColor]);

  const baseCalendarColor = useMemo(() => {
    // Priority 1: Single calendar explicitly selected
    if (selectedCalendarIds.length === 1) {
      const calendar = availableCalendars.find(cal => cal.id === selectedCalendarIds[0]);
      return calendar?.color;
    }
    // Priority 2: Unified color from filtered events
    if (unifiedColor) {
      return unifiedColor;
    }
    return undefined;
  }, [selectedCalendarIds, availableCalendars, unifiedColor]);

  const { totalVisibleHours, totalVisibleEvents } = useMemo(() => {
    // Slice contributions to match visible weeks (last visibleWeeks * 7 days)
    const visibleContributions = contributions.slice(-visibleWeeks * 7);
    const totalHours = visibleContributions.reduce((sum, c) => sum + c.totalHours, 0);
    const totalEvents = visibleContributions.reduce((sum, c) => sum + c.eventCount, 0);
    return { totalVisibleHours: totalHours, totalVisibleEvents: totalEvents };
  }, [contributions, visibleWeeks]);

  if (loading) {
    return (
      <Card className="bg-transparent">
        <CardHeader>
          <CardTitle className="text-lg">Activity Lens</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-transparent">
      <CardHeader>
        <CardTitle className="text-lg">Activity Lens</CardTitle>
        <CardDescription>Last {visibleWeeks} weeks of calendar events</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <UnifiedFilter
          events={events}
          eventTagsMap={eventTagsMap}
          selectedCalendarIds={selectedCalendarIds}
          onCalendarChange={setSelectedCalendarIds}
          selectedTags={selectedTags}
          onTagChange={setSelectedTags}
          selectedEventName={selectedEventName}
          onEventNameChange={setSelectedEventName}
          placeholder="Filter by calendar, tag, or event name..."
          disabled={loadingTags}
          unifiedColor={unifiedColor}
        />
        <ContributionGraph
          contributions={contributions}
          colorScale={colorScale}
          onVisibleWeeksChange={setVisibleWeeks}
          currentWeekData={currentWeekData}
          weekDateRange={weekDateRange}
        />
        {weeklyData.length > 0 && (
          <WeeklyBarChart
            weeklyData={weeklyData}
            colorScale={colorScale}
          />
        )}
        {/* Total Hours Footer */}
        <div className="flex flex-col items-start gap-2 text-sm mt-3">
          <div className="leading-none">
            Total <span style={baseCalendarColor ? { color: baseCalendarColor } : undefined}>
              {formatDuration(totalVisibleHours)}
            </span> · <span className="text-muted-foreground">{totalVisibleEvents} {totalVisibleEvents === 1 ? 'event' : 'events'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
