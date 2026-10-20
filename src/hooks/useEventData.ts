import { useState, useEffect } from 'react';
import { decodeEventId } from '../lib/utils';
import { MessageType } from '../lib/message-types';
import { fetchWithSyncRetry } from './fetch-with-sync-retry';
import { diag } from '../lib/diag-panel';
import type { GoogleCalendarEvent, GoogleCalendar } from '../types/calendar';

interface GetEventResponseData {
  event: GoogleCalendarEvent;
  selectedCalendarId: string;
}

// Must comfortably cover the calendar-observer's 1s mutation debounce
// (calendar-observer.ts) plus however long the resulting Calendar API
// round-trip takes, since both precede the SYNC_COMPLETE this retry waits on.
const EVENT_FETCH_RETRY_TIMEOUT_MS = 8000;

interface UseEventDataParams {
  eventId: string | null;
  isOpen: boolean;
  createCalendarService: () => any;
  userEmail: string | null;
}

interface UseEventDataReturn {
  event: GoogleCalendarEvent | null;
  calendars: GoogleCalendar[];
  selectedCalendarId: string;
  isLoading: boolean;
  error: string | null;
}

/**
 * Custom hook to manage event and calendar data fetching
 * Extracts data fetching logic from EventDetailsPanel
 */
export function useEventData({
  eventId,
  isOpen,
  userEmail,
}: UseEventDataParams): UseEventDataReturn {
  const [event, setEvent] = useState<GoogleCalendarEvent | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch calendars from IndexedDB on mount
  useEffect(() => {
    if (!isOpen || !userEmail) return;

    chrome.runtime.sendMessage({
      type: 'GET_CALENDARS',
      userEmail
    })
      .then((response: any) => {
        if (response.success) {
          const calendarList = response.data || [];
          setCalendars(calendarList);
        }
      })
      .catch((err: any) => {
        console.error('[useEventData] Failed to fetch calendars from IndexedDB:', err);
        diag('fetch', 'error', 'calendars fetch failed', { reason: err instanceof Error ? err.message : String(err) });
      });
  }, [isOpen, userEmail]);

  // Fetch event from IndexedDB when eventId changes.
  // Race backstop: if the first fetch misses (typical when the side panel
  // opens for an event that's still being created/synced), retry on each
  // SYNC_COMPLETE within a budget before reporting an error. After that, keep
  // re-checking on later syncs so a slow sync still replaces the error.
  useEffect(() => {
    setEvent(null);

    if (!eventId || !isOpen) {
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const { eventId: decodedEventId } = decodeEventId(eventId);
    const signal = { aborted: false };
    let stopRecovery: (() => void) | null = null;
    const startedAt = Date.now();
    let attempts = 0;

    const fetchOnce = async () => {
      attempts++;
      const response: any = await chrome.runtime.sendMessage({
        type: MessageType.GET_EVENT,
        eventId: decodedEventId,
      });
      if (response?.success && response.data) {
        return { found: true, data: response.data as GetEventResponseData };
      }
      return { found: false, error: response?.error };
    };

    const registerSyncListener = (callback: () => void) => {
      const listener = (message: any) => {
        if (message?.type === MessageType.SYNC_COMPLETE) callback();
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    };

    const showEvent = (data: GetEventResponseData) => {
      setEvent(data.event);
      setSelectedCalendarId(data.selectedCalendarId);
      setError(null);
    };

    fetchWithSyncRetry<GetEventResponseData>({
      fetchOnce,
      registerSyncListener,
      timeoutMs: EVENT_FETCH_RETRY_TIMEOUT_MS,
      signal,
    })
      .then((result) => {
        if ('aborted' in result) return;
        const elapsedMs = Date.now() - startedAt;
        if (result.found && result.data) {
          diag('fetch', 'info', 'event hit', { eventId: decodedEventId, attempts, retries: attempts - 1, elapsedMs });
          showEvent(result.data);
          return;
        }
        diag('fetch', 'warn', 'event miss', {
          eventId: decodedEventId,
          attempts,
          retries: attempts - 1,
          elapsedMs,
          error: result.error || 'Event not found',
        });
        setError(result.error || 'Event not found');
        stopRecovery = registerSyncListener(async () => {
          const outcome = await fetchOnce();
          if (signal.aborted || !outcome.found || !outcome.data) return;
          stopRecovery?.();
          stopRecovery = null;
          diag('fetch', 'info', 'event recovered after miss', {
            eventId: decodedEventId,
            attempts,
            elapsedMs: Date.now() - startedAt,
          });
          showEvent(outcome.data);
        });
      })
      .catch((err: any) => {
        if (signal.aborted) return;
        console.error('[useEventData] Failed to fetch event from IndexedDB:', err);
        diag('fetch', 'error', 'event fetch failed', {
          eventId: decodedEventId,
          attempts,
          reason: err instanceof Error ? err.message : String(err),
        });
        setError(err instanceof Error ? err.message : 'Failed to fetch event');
      })
      .finally(() => {
        if (!signal.aborted) setIsLoading(false);
      });

    return () => {
      signal.aborted = true;
      stopRecovery?.();
    };
  }, [eventId, isOpen]);

  return {
    event,
    calendars,
    selectedCalendarId,
    isLoading,
    error,
  };
}
