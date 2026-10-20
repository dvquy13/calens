import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageType } from '../lib/message-types';
import type { DateRangeMessage } from '../types/calendar';

export interface UseDateRangeReturn {
  dateRange: DateRangeMessage['dateRange'] | null;
  lastSyncTime: number;
  requestDateRange: () => void;
  syncCalendar: () => void;
  setDateRange: (range: DateRangeMessage['dateRange'] | null) => void;
  setLastSyncTime: (time: number) => void;
}

export function useDateRange(
  isAuthenticated: boolean,
  loadCalendarData: (range?: DateRangeMessage['dateRange'] | null) => Promise<void>
): UseDateRangeReturn {
  const [dateRange, setDateRange] = useState<DateRangeMessage['dateRange'] | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);

  // Store latest values in refs to avoid recreating listener
  const isAuthenticatedRef = useRef(isAuthenticated);
  const dateRangeRef = useRef(dateRange);
  const lastSyncTimeRef = useRef(lastSyncTime);
  const loadCalendarDataRef = useRef(loadCalendarData);

  // Update refs when values change
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    dateRangeRef.current = dateRange;
  }, [dateRange]);

  useEffect(() => {
    lastSyncTimeRef.current = lastSyncTime;
  }, [lastSyncTime]);

  useEffect(() => {
    loadCalendarDataRef.current = loadCalendarData;
  }, [loadCalendarData]);

  const requestDateRange = () => {
    console.log('[Sidepanel] Requesting current date range from content script...');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: MessageType.GET_DATE_RANGE },
          (response: DateRangeMessage | null) => {
            if (chrome.runtime.lastError) {
              console.error('[Sidepanel] Failed to get date range:', chrome.runtime.lastError);
              return;
            }
            if (response && response.type === MessageType.DATE_RANGE_UPDATE) {
              console.log('[Sidepanel] Received date range response:', response.dateRange);
              setDateRange(response.dateRange);
            } else {
              console.log('[Sidepanel] No date range available from content script');
            }
          }
        );
      }
    });
  };

  // Stable syncCalendar function using refs
  const syncCalendar = useCallback(async (skipDebounce = false) => {
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;
    const MIN_SYNC_INTERVAL = 2000; // 2 seconds

    if (!skipDebounce && timeSinceLastSync < MIN_SYNC_INTERVAL) {
      console.log(`[Sidepanel] Ignoring sync request (last sync was ${Math.round(timeSinceLastSync / 1000)}s ago)`);
      return;
    }

    // Perform sync
    if (isAuthenticatedRef.current) {
      setLastSyncTime(now);
      await loadCalendarDataRef.current(dateRangeRef.current);
    }
  }, []); // Empty dependencies - stable reference

  // Listen for date range updates from content script
  // Message listener with stable syncCalendar dependency only
  useEffect(() => {
    const messageListener = (
      message: DateRangeMessage | { type: typeof MessageType.CLOSE_SIDE_PANEL } | { type: typeof MessageType.SYNC_COMPLETE } | { type: typeof MessageType.EVENT_SELECTED; encodedEventId: string },
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: any) => void
    ) => {
      if (message.type === MessageType.DATE_RANGE_UPDATE) {
        console.log('[Sidepanel] Date range updated:', message.dateRange);
        setDateRange(message.dateRange);
      } else if (message.type === MessageType.CLOSE_SIDE_PANEL) {
        console.log('[Sidepanel] Received close request, closing side panel');
        window.close();
      } else if (message.type === MessageType.SYNC_COMPLETE) {
        console.log('[Sidepanel] Sync complete, refreshing UI from IndexedDB');
        syncCalendar(true); // Skip debounce for post-sync refresh
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [syncCalendar]); // Only depends on stable syncCalendar

  // Request current date range from active tab on mount
  useEffect(() => {
    requestDateRange();
  }, []); // Run once on mount

  // Load calendar data when user signs in AND we have a date range
  useEffect(() => {
    if (isAuthenticated && dateRange) {
      setLastSyncTime(Date.now());
      loadCalendarData(dateRange);
    }
  }, [isAuthenticated, dateRange]);

  return {
    dateRange,
    lastSyncTime,
    requestDateRange,
    syncCalendar,
    setDateRange,
    setLastSyncTime,
  };
}
