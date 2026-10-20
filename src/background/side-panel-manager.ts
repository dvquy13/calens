/**
 * Side Panel Manager
 * Manages tab-specific side panel behavior:
 * - Side panel only opens/visible on calendar.google.com
 * - Automatically closes when navigating away or switching tabs
 */

import { MessageType } from '../lib/message-types';

const CALENDAR_URL = 'https://calendar.google.com';
const SIDE_PANEL_PATH = 'sidepanel.html';

/**
 * Opens the side panel for a specific tab.
 * Must be called synchronously to preserve user gesture context.
 */
export function openSidePanelForTab(tabId: number): void {
  chrome.sidePanel.setOptions({
    tabId,
    path: SIDE_PANEL_PATH,
    enabled: true
  });

  chrome.sidePanel.open({ tabId }).catch((error) => {
    console.error('[Background] Failed to open side panel:', error);
  });
}

/**
 * Enables/disables side panel based on URL and closes it if on non-calendar page
 */
export async function setSidePanelForTab(tabId: number, url?: string): Promise<void> {
  const isCalendarPage = url?.includes(CALENDAR_URL) ?? false;

  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: SIDE_PANEL_PATH,
      enabled: isCalendarPage
    });

    if (!isCalendarPage) {
      // Add small delay to ensure side panel is ready to receive message
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: MessageType.CLOSE_SIDE_PANEL }).catch(() => {
          // Side panel not open, ignore
        });
      }, 100);
    }
  } catch (error) {
    console.error('[Background] Failed to set side panel options:', error);
  }
}

/**
 * Extension icon click handler: Opens side panel on calendar.google.com
 */
export function handleActionClick(tab: chrome.tabs.Tab): void {
  if (!tab.id) return;

  if (tab.url?.includes(CALENDAR_URL)) {
    openSidePanelForTab(tab.id);
  } else {
    // Navigate to calendar, then open side panel
    chrome.tabs.update(tab.id, { url: CALENDAR_URL });

    const navigationListener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete' && tab.id) {
        chrome.sidePanel.setOptions({
          tabId: tab.id,
          path: SIDE_PANEL_PATH,
          enabled: true
        }).then(() => {
          return chrome.sidePanel.open({ tabId: tab.id! });
        }).catch((error) => {
          console.error('[Background] Failed to open side panel after navigation:', error);
        });

        chrome.tabs.onUpdated.removeListener(navigationListener);
      }
    };

    chrome.tabs.onUpdated.addListener(navigationListener);
  }
}

/**
 * Initialize side panel behavior listeners
 */
export function initSidePanelListeners(): void {
  // Make side panel tab-specific (not global)
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => {
    console.error('[Background] Failed to set panel behavior:', error);
  });

  // Extension icon click handler
  chrome.action.onClicked.addListener(handleActionClick);

  // Enable/disable side panel when page loads
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      setSidePanelForTab(tabId, tab.url);
    }
  });

  // Close side panel when switching to non-calendar tabs
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      await setSidePanelForTab(activeInfo.tabId, tab.url);
    } catch (error) {
      console.error('[Background] Failed to handle tab activation:', error);
    }
  });
}
