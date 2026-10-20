/**
 * Background Service Worker for Personal Calendar AI Assistant Chrome Extension
 *
 * Main entry point for background script
 * Handles message routing and service initialization
 */

import { MessageType } from '../lib/message-types';
import { decodeEventId } from '../lib/event-id-utils';
import { CalendarDatabase } from '../lib/db/database';
import { SyncService } from '../lib/sync/sync-service';
import { CalendarService } from '../lib/calendar-service';
import { initSidePanelListeners, openSidePanelForTab } from './side-panel-manager';
import { handleUpdateEventStartOptimistic } from './event-update-handler';
import {
  handleGetCalendars,
  handleGetEventsByRange,
  handleGetEvent,
  handleGetCalendarEvents,
  handleGetEventTags,
  handleGetLastSyncTime
} from './indexeddb-handlers';
import { handleInitialSync, handleManualSync } from './sync-handlers';
import { appendDiagEntry, clearDiag, diag, installSwErrorCapture, installSwLifecycleLogging, DIAG_CATS, DIAG_LEVELS } from '../lib/diag-log';
import { buildDiagnosticsReport } from './diagnostics-report';
import { describeMessage } from './message-log';

// Lazy initialization pattern for service worker restarts
let dbInstance: CalendarDatabase | null = null;
let syncService: SyncService | null = null;

async function getDatabase(): Promise<CalendarDatabase> {
  if (!dbInstance) {
    dbInstance = new CalendarDatabase();
    await dbInstance.init();
    console.log('[Background] CalendarDB (re-)initialized after worker restart');
  }
  return dbInstance;
}

async function getSyncService(): Promise<SyncService> {
  if (!syncService) {
    const db = await getDatabase();
    const calendarService = new CalendarService(async () => {
      return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, token => {
          resolve(token || '');
        });
      });
    });
    syncService = new SyncService(calendarService, db);
    console.log('[Background] SyncService initialized');
  }
  return syncService;
}

function handleNavigateToDate(date: string) {
  console.log(`[Background] handleNavigateToDate called with date: ${date}`);
  
  // Parse date string YYYY-MM-DD
  const [year, month, day] = date.split('-').map(Number);

  // Construct URL: /calendar/u/0/r/day/{year}/{month}/{day}
  // Note: Month and day should NOT have leading zeros
  const url = `https://calendar.google.com/calendar/u/0/r/day/${year}/${month}/${day}`;

  // First, try to find the ACTIVE calendar tab in the last focused window
  chrome.tabs.query({ url: 'https://calendar.google.com/*', active: true, lastFocusedWindow: true }, (activeTabs) => {
    console.log(`[Background] Active calendar tabs in focused window: ${activeTabs.length}`);
    
    if (activeTabs.length > 0) {
      // Found an active calendar tab - use it
      const calendarTab = activeTabs[0];
      console.log(`[Background] Using ACTIVE calendar tab id=${calendarTab.id}, url=${calendarTab.url}`);
      navigateTab(calendarTab.id!, url);
      return;
    }

    // Fallback: Query ALL calendar tabs and pick the first one
    chrome.tabs.query({ url: 'https://calendar.google.com/*' }, (allTabs) => {
      console.log(`[Background] All calendar tabs: ${allTabs.length}`, allTabs.map(t => ({ id: t.id, url: t.url, active: t.active })));
      
      if (allTabs.length === 0) {
        console.log('[Background] No Google Calendar tab found, ignoring navigation');
        return;
      }

      // Prefer an active tab from any window, fallback to first tab
      const activeTab = allTabs.find(t => t.active);
      const calendarTab = activeTab || allTabs[0];
      console.log(`[Background] Using calendar tab id=${calendarTab.id}, active=${calendarTab.active}, url=${calendarTab.url}`);
      navigateTab(calendarTab.id!, url);
    });
  });
}

function navigateTab(tabId: number, url: string) {
  console.log(`[Background] Calling tabs.update(${tabId}, { url: ${url} })`);
  chrome.tabs.update(tabId, { url }, (updatedTab) => {
    if (chrome.runtime.lastError) {
      console.error('[Background] tabs.update error:', chrome.runtime.lastError.message);
    } else {
      console.log('[Background] tabs.update success:', updatedTab?.url);
    }
  });
}

installSwErrorCapture();
installSwLifecycleLogging();

// On extension install/update, create alarm
chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create('incrementalSync', { periodInMinutes: 15 });
  console.log('[Background] Incremental sync alarm created (15 min interval)');

  if (details.reason === 'update') {
    // Subscription gating was removed; drop the state older versions cached.
    chrome.storage.local.remove(['subscription_status', 'subscription_status_timestamp', 'remote_config_cache'])
      .catch((error) => console.error('[Background] Failed to clear legacy subscription cache:', error));
  }
});

// Listen to alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'incrementalSync') {
    console.log('[Background] Alarm triggered: incrementalSync');
    diag('lifecycle', 'info', 'alarm fired', { alarm: alarm.name });

    const storage = await chrome.storage.local.get('google_user');
    const user = storage.google_user ? JSON.parse(storage.google_user) : null;
    const userEmail = user?.email;

    if (!userEmail) {
      console.log('[Background] No authenticated user, skipping sync');
      diag('sync', 'info', 'alarm sync skipped: not signed in');
      return;
    }

    chrome.runtime.sendMessage({
      type: MessageType.SYNC_STARTED,
      syncType: 'incremental'
    }).catch(() => {});

    const service = await getSyncService();

    try {
      await service.performIncrementalSync(userEmail);
      console.log('[Background] Incremental sync completed successfully');

      chrome.runtime.sendMessage({ type: MessageType.SYNC_COMPLETE }).catch(() => {
        // Sidepanel not open, ignore
      });
    } catch (error) {
      console.error('[Background] Incremental sync failed:', error);
    }
  }
});

// Initialize side panel behavior
initSidePanelListeners();

/**
 * Message handler with IndexedDB query support
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Message received:', describeMessage(message));

  if (message.type === MessageType.UPDATE_EVENT_START) {
    // Fire-and-forget optimistic update with callback support
    handleUpdateEventStartOptimistic(
      message.eventId,
      message.minutesShift,
      message.originalTop,
      message.originalHeight,
      getDatabase,
      sender.tab?.id
    );
    return false; // No response needed (fully async)
  }

  if (message.type === MessageType.EVENT_SELECTED) {
    const { eventId, calendarId } = decodeEventId(message.encodedEventId);
    console.log('[Background] Event selected:', message.encodedEventId, `(${eventId} ${calendarId})`);
    diag('select', 'info', 'EVENT_SELECTED received', { eventId, calendarId, tabId: sender.tab?.id });

    // Auto-open sidepanel if not already open
    if (sender.tab?.id) {
      openSidePanelForTab(sender.tab.id);
    }

    // Forward to sidepanel
    chrome.runtime.sendMessage(message).catch(() => {
      // Sidepanel not ready yet, ignore
    });

    return false;
  }

  if (message.type === MessageType.DIAG_LOG) {
    if (!DIAG_CATS.includes(message.cat) || !DIAG_LEVELS.includes(message.level)) {
      console.warn('[Background] Ignoring DIAG_LOG with invalid cat/level:', message.cat, message.level);
      return false;
    }
    // Extension pages (side panel) have a chrome-extension:// sender URL; content scripts report the page URL.
    const ctx = sender.url?.startsWith('chrome-extension://') ? 'panel' : 'content';
    void appendDiagEntry(ctx, message.cat, message.level, message.msg, message.data);
    return false;
  }

  if (message.type === MessageType.DIAG_CLEAR) {
    clearDiag().then(
      () => sendResponse({ success: true }),
      (error) => sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) })
    );
    return true;
  }

  if (message.type === MessageType.GET_DIAGNOSTICS_REPORT) {
    getDatabase()
      .then((db) => buildDiagnosticsReport(message.panelState, db))
      .then(
        (report) => sendResponse({ success: true, data: report }),
        (error) => {
          console.error('[Background] GET_DIAGNOSTICS_REPORT error:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
      );
    return true;
  }

  // IndexedDB query handlers
  if (message.type === MessageType.GET_CALENDARS) {
    getDatabase().then(db => handleGetCalendars(message, sendResponse, db));
    return true; // Async response
  }

  if (message.type === MessageType.GET_EVENTS_BY_RANGE) {
    getDatabase().then(db => handleGetEventsByRange(message, sendResponse, db));
    return true;
  }

  if (message.type === MessageType.GET_EVENT) {
    getDatabase().then(db => handleGetEvent(message, sendResponse, db));
    return true;
  }

  if (message.type === MessageType.GET_CALENDAR_EVENTS) {
    getDatabase().then(db => handleGetCalendarEvents(message, sendResponse, db));
    return true;
  }

  if (message.type === MessageType.GET_EVENT_TAGS) {
    getDatabase().then(db => handleGetEventTags(message, sendResponse, db));
    return true;
  }

  if (message.type === MessageType.GET_LAST_SYNC_TIME) {
    getDatabase().then(db => handleGetLastSyncTime(message, sendResponse, db));
    return true;
  }

  if (message.type === MessageType.INITIAL_SYNC) {
    getSyncService().then(service => handleInitialSync(message, sendResponse, service));
    return true;
  }

  if (message.type === MessageType.TRIGGER_SYNC) {
    getSyncService().then(service => handleManualSync(message, sendResponse, service));
    return true;
  }

  if (message.type === MessageType.NAVIGATE_TO_DATE) {
    handleNavigateToDate(message.date);
    return false; // No async response needed
  }

  if (message.type === MessageType.FORWARD_KEYBOARD_SHORTCUT) {
    // Forward keyboard shortcut to active Google Calendar tab
    chrome.tabs.query({ url: 'https://calendar.google.com/*', active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {
          // Tab may not have content script ready, ignore
        });
      } else {
        // Fallback: try any calendar tab
        chrome.tabs.query({ url: 'https://calendar.google.com/*' }, (allTabs) => {
          if (allTabs.length > 0 && allTabs[0].id) {
            chrome.tabs.sendMessage(allTabs[0].id, message).catch(() => {});
          }
        });
      }
    });
    return false;
  }

  if (message.type === MessageType.CLEAR_SYNC_CHECKPOINTS) {
    getDatabase().then(db => {
      db.clearSyncCheckpoints(message.userEmail)
        .then(() => {
          console.log('[Background] Cleared sync checkpoints for', message.userEmail);
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('[Background] Failed to clear sync checkpoints:', error);
          sendResponse({ success: false, error: error.message });
        });
    });
    return true; // Async response
  }

  return false;
});
