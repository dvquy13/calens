/**
 * Calendar Observer
 * Monitors DOM mutations to detect calendar changes and trigger sync
 */

// Message type constants (inlined because content scripts cannot use ES6 imports)
const MessageType = {
  TRIGGER_SYNC: 'TRIGGER_SYNC',
} as const;

// Debounce timeout for sync trigger
let syncTriggerTimeout: number | null = null;

// Calendars changed since the last sync trigger. Accumulated across the
// debounce window: creating an event and switching its calendar touches
// several calendars in quick succession, and all of them need syncing.
const pendingCalendarIds = new Set<string>();

/**
 * Trigger sync in side panel after observing calendar changes
 */
function triggerSyncAfterDelay(affectedCalendarIds: string[]) {
  affectedCalendarIds.forEach((id) => pendingCalendarIds.add(id));

  if (syncTriggerTimeout) {
    clearTimeout(syncTriggerTimeout);
  }

  syncTriggerTimeout = window.setTimeout(() => {
    const targetCalendarIds = Array.from(pendingCalendarIds);
    pendingCalendarIds.clear();
    console.log('[Event Enhancer] Triggering sync after calendar changes', `(calendars: ${targetCalendarIds.join(', ')})`);
    chrome.runtime.sendMessage({
      type: MessageType.TRIGGER_SYNC,
      targetCalendarIds
    });
    syncTriggerTimeout = null;
  }, 1000);
}

/**
 * Extract calendar ID from encoded event ID
 * Google Calendar event IDs are base64-encoded strings like "eventId calendarId"
 */
function extractCalendarIdFromEventId(encodedEventId: string): string | null {
  try {
    const decoded = atob(encodedEventId);
    const parts = decoded.split(' ');
    return parts.length >= 2 ? parts.slice(1).join(' ') : null;
  } catch (error) {
    console.warn('[Event Enhancer] Failed to decode event ID:', encodedEventId, error);
    return null;
  }
}

/**
 * Check if a mutation affects calendar events and extract affected calendar IDs
 * Returns array of calendar IDs if events were affected, or null if no events affected
 */
function extractAffectedCalendars(mutations: MutationRecord[]): string[] | null {
  const calendarIds = new Set<string>();

  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          const eventElement = node.hasAttribute('data-eventid') ? node : node.querySelector('[data-eventid]');
          if (eventElement) {
            const eventId = eventElement.getAttribute('data-eventid');
            if (eventId) {
              const calendarId = extractCalendarIdFromEventId(eventId);
              if (calendarId) calendarIds.add(calendarId);
            }
          }
        }
      }
      for (const node of mutation.removedNodes) {
        if (node instanceof HTMLElement) {
          const eventElement = node.hasAttribute('data-eventid') ? node : node.querySelector('[data-eventid]');
          if (eventElement) {
            const eventId = eventElement.getAttribute('data-eventid');
            if (eventId) {
              const calendarId = extractCalendarIdFromEventId(eventId);
              if (calendarId) calendarIds.add(calendarId);
            }
          }
        }
      }
    } else if (mutation.type === 'attributes') {
      const attributeName = mutation.attributeName;

      if (attributeName === 'data-eventid' || attributeName === 'data-pca-pending') {
        const target = mutation.target as HTMLElement;
        const eventElement = target.hasAttribute('data-eventid') ? target : target.closest('[data-eventid]');
        if (eventElement) {
          const eventId = eventElement.getAttribute('data-eventid');
          if (eventId) {
            const calendarId = extractCalendarIdFromEventId(eventId);
            if (calendarId) calendarIds.add(calendarId);
          }
        }
      }
    }
  }

  return calendarIds.size > 0 ? Array.from(calendarIds) : null;
}

/**
 * Initialize calendar mutation observer
 */
export function initCalendarObserver(): void {
  const calendarObserver = new MutationObserver((mutations) => {
    const affectedCalendars = extractAffectedCalendars(mutations);
    if (affectedCalendars) {
      console.log('[Event Enhancer] Calendar events changed, scheduling sync for calendars:', affectedCalendars);
      triggerSyncAfterDelay(affectedCalendars);
    }
  });

  calendarObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-eventid', 'data-pca-pending'],
  });

  console.log('[Event Enhancer] Calendar change observer initialized');
}
