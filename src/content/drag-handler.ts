/**
 * Drag Handler
 * Manages drag operations for resizing events from the top edge
 */

import { extractStartTime, addMinutes, formatTimeAs } from './time-parser';
import { showSavingToast, showSuccessToast, showErrorToast } from './toast';
import { findEventElementAtPoint } from './event-hit-tester';
import { resolveEventForClick } from './click-event-resolver';
import { diagContent } from './diag';

// Message type constants (inlined because content scripts cannot use ES6 imports)
const MessageType = {
  TRIGGER_SYNC: 'TRIGGER_SYNC',
  UPDATE_EVENT_START: 'UPDATE_EVENT_START',
  UPDATE_EVENT_SUCCESS: 'UPDATE_EVENT_SUCCESS',
  UPDATE_EVENT_FAILED: 'UPDATE_EVENT_FAILED',
} as const;

// Constants
const TOP_EDGE_HEIGHT = 10; // pixels from top that count as "top edge"
const BOTTOM_EDGE_HEIGHT = 10; // pixels from bottom reserved for Google's native bottom-drag

// Google Calendar uses 48px per hour in week view
const PIXELS_PER_HOUR = 48;

function getEventId(element: HTMLElement): string | null {
  // Try data-eventid
  const eventId = element.getAttribute('data-eventid');
  if (eventId) return eventId;

  // Try finding parent with data-eventid
  const parent = element.closest('[data-eventid]');
  if (parent) return parent.getAttribute('data-eventid');

  return null;
}

/**
 * Check if mouse position is at the top edge of an event element
 * Uses dynamic threshold to avoid interfering with Google's bottom-drag
 */
function isAtTopEdge(element: HTMLElement, clientY: number): boolean {
  const rect = element.getBoundingClientRect();
  const distanceFromTop = clientY - rect.top;
  const distanceFromBottom = rect.bottom - clientY;

  // Reserve bottom edge for Google's native bottom-drag
  // Don't interfere if user is near bottom edge
  if (distanceFromBottom <= BOTTOM_EDGE_HEIGHT) {
    return false;
  }

  // Calculate dynamic top edge threshold to avoid overlap with bottom zone
  // For small events, use smaller threshold; for large events, use full threshold
  const eventHeight = rect.height;
  const maxTopEdgeHeight = Math.max(
    5,  // Minimum threshold (always allow some top-edge area for events > 15px)
    Math.min(
      TOP_EDGE_HEIGHT,  // Maximum threshold (10px for large events)
      (eventHeight - BOTTOM_EDGE_HEIGHT) / 2  // Half of remaining space after reserving bottom
    )
  );

  return distanceFromTop <= maxTopEdgeHeight;
}

/**
 * Initialize drag operation for resizing event from top
 */
function initDrag(e: MouseEvent, eventElement: HTMLElement) {
  const startY = e.clientY;
  const startTop = parseInt(eventElement.style.top || '0', 10);
  const startHeight = parseInt(eventElement.style.height || '0', 10);

  // Get event ID for error reporting
  const eventId = getEventId(eventElement);
  diagContent('drag', 'info', 'drag start', { eventId });

  // Find and store time element reference
  const timeElement = eventElement.querySelector('.gVNoLb') as HTMLElement | null;
  const originalTimeText = timeElement?.textContent || '';

  if (!timeElement) {
    console.warn('[Event Enhancer] Time element (.gVNoLb) not found for event', eventId, '- time display updates disabled');
    diagContent('drag', 'warn', 'initDrag:missingTimeElement', { eventId });
    if (eventId) {
      showErrorToast(eventId, 'Time display update failed: element not found');
    }
  }

  const parsedStart = extractStartTime(originalTimeText);

  if (!parsedStart) {
    console.warn('[Event Enhancer] Could not parse time text:', originalTimeText, 'for event', eventId, '- time display updates disabled');
    diagContent('drag', 'warn', 'initDrag:unparseableTime', { eventId, originalTimeText });
    if (timeElement && eventId) {
      showErrorToast(eventId, 'Time display update failed: could not parse time format');
    }
  }

  // A tile we can't actually resize (time element missing/unparseable) must
  // not hijack the mousedown -- otherwise a click that merely lands over
  // this tile (e.g. a Google dialog button rendered on top of it) gets its
  // click silently swallowed by the mouseup handler's click-blocker below.
  if (!timeElement || !parsedStart) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  // Store original time for rollback
  (eventElement as any)._pcaOriginalTimeText = originalTimeText;

  // Add dragging class
  eventElement.classList.add('pca-dragging-top');

  const onMouseMove = (moveEvent: MouseEvent) => {
    const deltaY = moveEvent.clientY - startY;

    // Snap to grid (15 mins = 1/4 hour)
    const pixelsPer15Min = PIXELS_PER_HOUR / 4;
    const snappedDeltaY = Math.round(deltaY / pixelsPer15Min) * pixelsPer15Min;

    const newTop = startTop + snappedDeltaY;
    const newHeight = startHeight - snappedDeltaY;

    if (newHeight > pixelsPer15Min) { // Minimum duration 15 mins
      // Modify styles directly for instant feedback
      eventElement.style.top = `${newTop}px`;
      eventElement.style.height = `${newHeight}px`;
    }

    // Update time display
    if (timeElement && parsedStart) {
      const minutesShift = (snappedDeltaY / PIXELS_PER_HOUR) * 60;
      const newTime = addMinutes(parsedStart.hours, parsedStart.minutes, minutesShift);
      const newStartStr = formatTimeAs(newTime.hours, newTime.minutes, parsedStart.is12h);
      timeElement.textContent = originalTimeText.replace(parsedStart.match, newStartStr);
    }
  };

  const onMouseUp = (upEvent: MouseEvent) => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    // CRITICAL: Prevent Google Calendar from interpreting this as a click
    upEvent.preventDefault();
    upEvent.stopPropagation();

    // Block the click event that follows mouseup (Google Calendar listens for clicks)
    const clickBlocker = (clickEvent: MouseEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      clickEvent.stopImmediatePropagation();
      console.log('[Event Enhancer] Blocked click after drag');
    };
    document.addEventListener('click', clickBlocker, { capture: true, once: true });
    // Safety: remove blocker after 100ms if it didn't fire
    setTimeout(() => {
      document.removeEventListener('click', clickBlocker, { capture: true });
    }, 100);

    // Remove dragging class
    eventElement.classList.remove('pca-dragging-top');

    const finalDeltaY = upEvent.clientY - startY;
    const pixelsPer15Min = PIXELS_PER_HOUR / 4;
    const snappedDeltaY = Math.round(finalDeltaY / pixelsPer15Min) * pixelsPer15Min;

    console.log('[Event Enhancer] Drag ended, deltaY:', finalDeltaY, 'snapped:', snappedDeltaY);

    if (snappedDeltaY !== 0) {
      // Calculate time shift in minutes
      const minutesShift = (snappedDeltaY / PIXELS_PER_HOUR) * 60;

      const eventId = getEventId(eventElement);
      console.log('[Event Enhancer] Raw data-eventid:', eventId);
      console.log('[Event Enhancer] data-eventid length:', eventId?.length);

      if (eventId) {
        console.log('[Event Enhancer] Sending UPDATE_EVENT_START, minutesShift:', minutesShift);
        diagContent('drag', 'info', 'update sent', { eventId, minutesShift });

        // Add subtle pending indicator
        eventElement.style.opacity = '0.9';
        eventElement.setAttribute('data-pca-pending', eventId);

        // Show saving toast
        showSavingToast(eventId);

        // Send message to background to update event (with rollback data)
        chrome.runtime.sendMessage({
          type: MessageType.UPDATE_EVENT_START,
          eventId,
          minutesShift,
          originalTop: startTop,
          originalHeight: startHeight
        });

        // Styles already updated during drag - just wait for API response

        // Store desired position for potential rollback
        const desiredTop = startTop + snappedDeltaY;
        const desiredHeight = startHeight - snappedDeltaY;
        console.log('[Event Enhancer] Desired styles - top:', desiredTop, 'height:', desiredHeight);

        (eventElement as any)._pcaDesiredTop = desiredTop;
        (eventElement as any)._pcaDesiredHeight = desiredHeight;
      }
    }

    // If no change, restore original time and clean up
    if (snappedDeltaY === 0) {
      if (timeElement) {
        timeElement.textContent = originalTimeText;
      }
      delete (eventElement as any)._pcaOriginalTimeText;
    }
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// Track cursor state
let currentHoverElement: HTMLElement | null = null;

/**
 * Initialize drag-related event listeners
 */
export function initDragHandlers(): void {
  // EVENT DELEGATION: Handle mousemove on document to detect top-edge hover
  document.addEventListener('mousemove', (e: MouseEvent) => {
    const eventElement = findEventElementAtPoint(e.clientX, e.clientY);

    if (eventElement && isAtTopEdge(eventElement, e.clientY)) {
      // Mouse is at top edge of an event
      if (currentHoverElement !== eventElement) {
        // Reset previous element's cursor
        if (currentHoverElement) {
          currentHoverElement.style.cursor = '';
        }
        currentHoverElement = eventElement;
      }
      eventElement.style.cursor = 'ns-resize';
    } else {
      // Mouse is not at top edge
      if (currentHoverElement) {
        currentHoverElement.style.cursor = '';
        currentHoverElement = null;
      }
    }
  }, { passive: true });

  // EVENT DELEGATION: Handle mousedown on document to start drag from top edge
  //
  // Resolve the tile from the mousedown's actual target (ancestor-based),
  // NOT from a point-based elementsFromPoint walk. The latter matches
  // whatever's visually underneath the click -- including an unrelated
  // event tile sitting behind a Google Calendar dialog/portal button -- and
  // would hijack that button's click for a resize on a tile the user never
  // touched. See resolveEventForClick's own doc comment for the same
  // reasoning applied to click delegation.
  document.addEventListener('mousedown', (e: MouseEvent) => {
    // Only handle left clicks
    if (e.button !== 0) return;

    const eventElement = resolveEventForClick(e.target);

    if (eventElement && isAtTopEdge(eventElement, e.clientY)) {
      initDrag(e, eventElement);
    }
  }, { capture: true });

  console.log('[Event Enhancer] Event delegation initialized - hover near top edge of events to resize');
}

/**
 * Listen for update success/failure from background script
 */
export function initDragResponseHandlers(): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'UPDATE_EVENT_SUCCESS') {
      const eventElement = document.querySelector(`[data-pca-pending="${message.eventId}"]`);
      if (eventElement instanceof HTMLElement) {
        // Clean up stored values
        delete (eventElement as any)._pcaDesiredTop;
        delete (eventElement as any)._pcaDesiredHeight;
        delete (eventElement as any)._pcaOriginalTimeText;

        // Clear pending indicator - API confirmed success
        // Our optimistic UI is already showing the correct position
        eventElement.removeAttribute('data-pca-pending');
        eventElement.style.opacity = '';
        console.log('[Event Enhancer] Event update confirmed by API, optimistic UI is now authoritative');
        diagContent('drag', 'info', 'update confirmed', { eventId: message.eventId, calendarId: message.calendarId });

        // No need to wait for Google Calendar to refresh - our optimistic update is already correct
        // Google will sync on next natural re-render (view change, window resize, etc.)

        // Show success toast
        showSuccessToast(message.eventId);

        // Trigger sync in side panel after 1 second
        // Only sync the affected calendar if we have the calendar ID
        setTimeout(() => {
          const targetCalendarIds = message.calendarId ? [message.calendarId] : undefined;
          chrome.runtime.sendMessage({
            type: MessageType.TRIGGER_SYNC,
            targetCalendarIds
          });
        }, 1000);
      }
    }

    if (message.type === 'UPDATE_EVENT_FAILED') {
      const eventElement = document.querySelector(`[data-pca-pending="${message.eventId}"]`);
      if (eventElement instanceof HTMLElement) {
        // Clean up stored values
        delete (eventElement as any)._pcaDesiredTop;
        delete (eventElement as any)._pcaDesiredHeight;

        // Revert to original position
        eventElement.style.top = `${message.originalTop}px`;
        eventElement.style.height = `${message.originalHeight}px`;
        eventElement.removeAttribute('data-pca-pending');
        eventElement.style.opacity = '';

        // Revert time text
        const timeEl = eventElement.querySelector('.gVNoLb') as HTMLElement | null;
        if (timeEl && (eventElement as any)._pcaOriginalTimeText) {
          timeEl.textContent = (eventElement as any)._pcaOriginalTimeText;
        }
        delete (eventElement as any)._pcaOriginalTimeText;

        // Show error toast
        showErrorToast(message.eventId, message.error);

        console.error('[Event Enhancer] Event update failed:', message.error);
        diagContent('drag', 'error', 'update failed', { eventId: message.eventId, reason: message.error });
      }
    }
  });
}
