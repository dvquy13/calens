/**
 * Date Detector for Google Calendar
 *
 * ⚠️  CRITICAL: Content Script - No ES6 Imports Allowed
 *
 * Chrome extension content scripts run in an isolated context and CANNOT use
 * ES6 import/export statements. All dependencies must be:
 * - Inlined directly in this file
 * - Or loaded via manifest.json as separate script files
 *
 * If you need shared constants or utilities:
 * ✅ Inline them directly (see MessageType constants below)
 * ✅ Or add them as separate scripts in manifest.json content_scripts array
 * ❌ DO NOT add: import { ... } from '...'
 *
 * Why: Content scripts execute in the page context, not as ES modules.
 * See: https://developer.chrome.com/docs/extensions/mv3/content_scripts/
 */

// Wrapped in IIFE to avoid global scope pollution and variable collisions with other content scripts
(function() {
'use strict';

// Message type constants (inlined because content scripts cannot use ES6 imports)
const MessageType = {
  DATE_RANGE_UPDATE: 'DATE_RANGE_UPDATE',
  GET_DATE_RANGE: 'GET_DATE_RANGE',
} as const;

// Inline date utilities to avoid import issues in content script
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as first day
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
}

type DateRangeMessage = {
  type: typeof MessageType.DATE_RANGE_UPDATE;
  dateRange: {
    startDate: string;
    endDate: string;
    viewMode: 'day' | 'week' | 'month' | 'agenda';
  };
};

// Parse Google Calendar URL to extract date range
function parseDateRangeFromURL(): DateRangeMessage['dateRange'] | null {
  const url = window.location.pathname;
  console.log('[Content Script] Parsing URL:', url);

  // URL pattern: /calendar/u/0/r/{view}/{year}/{month}/{day}
  // Example: /calendar/u/0/r/week/2025/11/24
  // Or current period: /calendar/u/0/r/week (no date = use current date)

  const match = url.match(/\/calendar\/u\/\d+\/r\/(\w+)(?:\/(\d{4})\/(\d{1,2})\/(\d{1,2}))?/);

  if (!match) {
    console.log('[Content Script] URL pattern did not match');
    return null;
  }

  console.log('[Content Script] URL matched:', match);

  const [, viewMode, year, month, day] = match;

  // Determine reference date
  let referenceDate: Date;
  if (year && month && day) {
    // URL has explicit date
    referenceDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  } else {
    // URL has no date (current period)
    referenceDate = new Date();
  }

  let startDate: Date;
  let endDate: Date;

  switch (viewMode) {
    case 'week':
      // Week starts on Monday, ends on Sunday
      startDate = startOfWeek(referenceDate);
      endDate = endOfWeek(referenceDate);
      break;

    case 'day':
      // Single day
      startDate = new Date(referenceDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(referenceDate);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'month':
      // Full month
      startDate = startOfMonth(referenceDate);
      endDate = endOfMonth(referenceDate);
      break;

    case 'agenda':
      // Agenda view typically shows 4 weeks ahead
      startDate = new Date(referenceDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(referenceDate);
      endDate.setDate(endDate.getDate() + 28);
      endDate.setHours(23, 59, 59, 999);
      break;

    default:
      return null;
  }

  const result = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    viewMode: viewMode as 'day' | 'week' | 'month' | 'agenda',
  };

  console.log('[Content Script] Parsed date range:', result);
  return result;
}

// Send date range to sidepanel
function sendDateRangeUpdate() {
  console.log('[Content Script] sendDateRangeUpdate called');
  const dateRange = parseDateRangeFromURL();

  if (dateRange) {
    const message: DateRangeMessage = {
      type: MessageType.DATE_RANGE_UPDATE,
      dateRange,
    };

    console.log('[Content Script] Sending message:', message);
    chrome.runtime.sendMessage(message).catch((error) => {
      console.error('[Content Script] Failed to send date range update:', error);
    });
  } else {
    console.log('[Content Script] No date range to send');
  }
}

// Initialize on page load
sendDateRangeUpdate();

// Listen for requests from sidepanel for current date range
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Content Script] Message received:', message);

  if (message.type === MessageType.GET_DATE_RANGE) {
    console.log('[Content Script] Date range requested, responding...');
    const dateRange = parseDateRangeFromURL();

    if (dateRange) {
      const response: DateRangeMessage = {
        type: MessageType.DATE_RANGE_UPDATE,
        dateRange,
      };
      sendResponse(response);
      console.log('[Content Script] Sent date range response:', response);
    } else {
      sendResponse(null);
      console.log('[Content Script] No date range available');
    }
    return true; // Keep channel open for async response
  }

  return false;
});

// Listen for URL changes (navigation within Google Calendar)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    sendDateRangeUpdate();
  }
});

// Observe URL changes via navigation
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Also listen for popstate events (back/forward navigation)
window.addEventListener('popstate', sendDateRangeUpdate);

})(); // End IIFE
