import { useState } from 'react';
import { formatDateLocal } from '../lib/calendar-utils';
import { generateRandomCategoryStats } from '../lib/demo-data';
import type { TimeEntry, DateRangeMessage } from '../types/calendar';
import type { UseAuthReturn } from './useAuth';

export interface UseCalendarDataReturn {
  loadingCalendarData: boolean;
  calendarError: string | null;
  allEvents: TimeEntry[];
  loadCalendarData: (range?: DateRangeMessage['dateRange'] | null) => Promise<void>;
  handleRefresh: () => void;
  setAllEvents: (events: TimeEntry[]) => void;
}

export function useCalendarData(auth: UseAuthReturn): UseCalendarDataReturn {
  const [loadingCalendarData, setLoadingCalendarData] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [allEvents, setAllEvents] = useState<TimeEntry[]>([]);

  const generateDemoEvents = () => {
    const demoData = generateRandomCategoryStats();
    const now = new Date();
    const demoEvents: TimeEntry[] = demoData.map((item, index) => ({
      eventId: `demo-${index}`,
      calendarId: 'demo',
      calendarName: item.category,
      calendarColor: item.color,
      title: item.category,
      startTime: new Date(now.getTime() + index * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + (index + item.completed) * 60 * 60 * 1000),
      durationMinutes: item.completed * 60,
      date: formatDateLocal(now),
      isAllDay: false,
      hasAttendees: false,
      attendeeCount: 0,
    }));
    return demoEvents;
  };

  const handleRefresh = () => {
    if (auth.isAuthenticated) {
      loadCalendarData(null);
    } else {
      // Generate demo TimeEntry data
      const demoEvents = generateDemoEvents();
      setAllEvents(demoEvents);
    }
  };

  const loadCalendarData = async (range?: DateRangeMessage['dateRange'] | null) => {
    if (!auth.isAuthenticated || !auth.user?.email) return;

    setLoadingCalendarData(true);
    setCalendarError(null);

    try {
      // Fallback to current week (Monday to Sunday) if no date range from content script
      let startDate: string;
      let endDate: string;

      if (range?.startDate && range?.endDate) {
        startDate = range.startDate;
        endDate = range.endDate;
      } else {
        // Calculate Monday-Sunday of current week
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days; otherwise go back (dayOfWeek - 1) days

        const monday = new Date(now);
        monday.setDate(now.getDate() - daysToMonday);
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        startDate = monday.toISOString();
        endDate = sunday.toISOString();
      }

      console.log('[Calendar] Loading data from IndexedDB for range:', { startDate, endDate });

      // Load calendars from IndexedDB
      const calendarsResponse = await chrome.runtime.sendMessage({
        type: 'GET_CALENDARS',
        userEmail: auth.user.email
      });

      if (!calendarsResponse.success) {
        throw new Error(calendarsResponse.error || 'Failed to load calendars from IndexedDB');
      }

      const selectedCalendars = (calendarsResponse.data || []).filter(
        (cal: any) => cal.selected === true
      );

      console.log('[Calendar] Found', selectedCalendars.length, 'selected calendars in IndexedDB');

      // Load events from IndexedDB
      const eventsResponse = await chrome.runtime.sendMessage({
        type: 'GET_EVENTS_BY_RANGE',
        userEmail: auth.user.email,
        startDate,
        endDate
      });

      if (!eventsResponse.success) {
        throw new Error(eventsResponse.error || 'Failed to load events from IndexedDB');
      }

      const events = eventsResponse.data || [];
      console.log('[Calendar] Loaded', events.length, 'events from IndexedDB');

      // Convert to TimeEntry format
      const allEventsData = events.map((event: any) => {
        const calendar = selectedCalendars.find((cal: any) => cal.id === event.calendar_id);
        const startTime = new Date(event.start);
        const endTime = new Date(event.end);
        return {
          eventId: event.id,
          calendarId: event.calendar_id,
          calendarName: calendar?.summary || 'Unknown',
          calendarColor: calendar?.backgroundColor || '#4285f4',
          title: event.summary,
          startTime,
          endTime,
          durationMinutes: Math.round((endTime.getTime() - startTime.getTime()) / 60000),
          date: formatDateLocal(startTime),
          isAllDay: event.isAllDay,
          hasAttendees: event.attendees && event.attendees.length > 0,
          attendeeCount: event.attendees?.length || 0,
        };
      }).filter((event: TimeEntry) => !event.isAllDay);

      console.log('[Calendar] Total events loaded from IndexedDB (excluding all-day):', allEventsData.length);

      setAllEvents(allEventsData);
    } catch (error) {
      console.error('[Calendar] Failed to load calendar data from IndexedDB:', error);
      setCalendarError(error instanceof Error ? error.message : 'Failed to load calendar data');
      // Fallback to demo data
      const demoEvents = generateDemoEvents();
      setAllEvents(demoEvents);
    } finally {
      setLoadingCalendarData(false);
    }
  };

  return {
    loadingCalendarData,
    calendarError,
    allEvents,
    loadCalendarData,
    handleRefresh,
    setAllEvents,
  };
}
