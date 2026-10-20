import { useState, useMemo, useEffect, useRef } from 'react';
import { aggregateByCalendar, aggregateByTitle, aggregateByTag, type AggregationMode } from '../lib/event-aggregator';
import type { TimeEntry, CategoryTimeStats, DateRangeMessage } from '../types/calendar';

export type SortColumn = keyof TimeEntry;

const AGGREGATION_MODE_KEY = 'aggregation_mode';

export interface UseEventFilteringReturn {
  sortColumn: SortColumn;
  sortDirection: 'asc' | 'desc';
  handleSort: (column: SortColumn) => void;
  filteredEvents: TimeEntry[];
  sortedEvents: TimeEntry[];
  chartData: CategoryTimeStats[];
  aggregationMode: AggregationMode;
  setAggregationMode: (mode: AggregationMode) => void;
}

export function useEventFiltering(
  allEvents: TimeEntry[],
  _dateRange: DateRangeMessage['dateRange'] | null,
  eventTagsMap?: Map<string, string[]>
): UseEventFilteringReturn {
  const [sortColumn, setSortColumn] = useState<SortColumn>('startTime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [aggregationMode, setAggregationMode] = useState<AggregationMode>('calendar');
  const hasLoadedRef = useRef(false);

  // Load aggregation mode from chrome.storage on mount
  useEffect(() => {
    const loadAggregationMode = async () => {
      const result = await chrome.storage.local.get([AGGREGATION_MODE_KEY]);
      const mode = result[AGGREGATION_MODE_KEY] as AggregationMode | undefined;
      if (mode) {
        setAggregationMode(mode);
      }
      hasLoadedRef.current = true;
    };
    loadAggregationMode();
  }, []);

  // Save aggregation mode when it changes
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    chrome.storage.local.set({ [AGGREGATION_MODE_KEY]: aggregationMode });
  }, [aggregationMode]);

  // Filter events based on current date range (no additional timeView filter)
  const filteredEvents = useMemo(() => {
    return allEvents;
  }, [allEvents]);

  // Sort events based on current sort state
  const sortedEvents = useMemo(() => {
    return [...allEvents].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === undefined || bVal === undefined) return 0;

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [allEvents, sortColumn, sortDirection]);

  // Compute chart data from filtered events based on aggregation mode
  const chartData = useMemo(() => {
    if (aggregationMode === 'calendar') {
      return aggregateByCalendar(filteredEvents);
    } else if (aggregationMode === 'title') {
      return aggregateByTitle(filteredEvents);
    } else {
      return aggregateByTag(filteredEvents, eventTagsMap || new Map());
    }
  }, [filteredEvents, aggregationMode, eventTagsMap]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  return {
    sortColumn,
    sortDirection,
    handleSort,
    filteredEvents,
    sortedEvents,
    chartData,
    aggregationMode,
    setAggregationMode,
  };
}
