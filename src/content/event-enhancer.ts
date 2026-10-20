/**
 * Event Enhancer for Google Calendar
 * Adds top-edge resizing to events using EVENT DELEGATION
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
 * Exception: './toast', './time-parser', './calendar-observer', './drag-handler',
 * './click-event-resolver', './dialog-selection' imports work
 * because Vite bundles content scripts during build.
 * However, for maximum compatibility, prefer inlining or using separate manifest entries.
 *
 * Why: Content scripts execute in the page context, not as ES modules.
 * See: https://developer.chrome.com/docs/extensions/mv3/content_scripts/
 */

import { initToastProvider } from './toast';
import { diagContent, installContentErrorCapture } from './diag';
import { initCalendarObserver } from './calendar-observer';
import { initDragHandlers, initDragResponseHandlers } from './drag-handler';
import { resolveEventForClick } from './click-event-resolver';
import { isInDialog, eventHasOpenDialog, selectWhenDialogCloses, cancelDeferredSelection } from './dialog-selection';

console.log('[Event Enhancer] Script loaded at', new Date().toISOString());

// Liveness marker for the agent browser harness: the DOM is shared with the main world, so tooling can
// tell whether this content script is injected in the page (orphaned scripts after a reload leave it stale).
document.documentElement.setAttribute('data-calens-content-script', new Date().toISOString());

// Initialize toast provider
installContentErrorCapture();
initToastProvider();

// Initialize calendar mutation observer
initCalendarObserver();

// Inject CSS for cursor change and animations
const style = document.createElement('style');
style.textContent = `
  /* Style for events when dragging from top */
  [data-eventid].pca-dragging-top {
    opacity: 0.8;
  }

  /* Toast notification animations */
  @keyframes pca-toast-slide-in {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes pca-toast-fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }

`;
document.head.appendChild(style);

// Initialize drag handlers
initDragHandlers();
initDragResponseHandlers();

// Message type constants (inlined because content scripts cannot use ES6 imports)
const MessageType = {
  EVENT_SELECTED: 'EVENT_SELECTED',
  FORWARD_KEYBOARD_SHORTCUT: 'FORWARD_KEYBOARD_SHORTCUT',
} as const;

function getEventId(element: HTMLElement): string | null {
  // Try data-eventid
  const eventId = element.getAttribute('data-eventid');
  if (eventId) return eventId;

  // Try finding parent with data-eventid
  const parent = element.closest('[data-eventid]');
  if (parent) return parent.getAttribute('data-eventid');

  return null;
}

// Whether the pressed event already had a Google dialog open (the draft block
// while drafting). Captured at pointerdown, before Google opens or retargets
// its details popover in response to this same click.
let pressedEventHadDialog = false;
document.addEventListener('pointerdown', (e: PointerEvent) => {
  const eventElement = resolveEventForClick(e.target);
  pressedEventHadDialog = eventElement !== null && eventHasOpenDialog(eventElement);
}, { capture: true });

/**
 * EVENT DELEGATION: Handle click on document to detect event selection
 */
document.addEventListener('click', (e: MouseEvent) => {
  const hadDialog = pressedEventHadDialog;
  pressedEventHadDialog = false;

  // Don't trigger on top-edge drag (the drag handler blocks clicks after drag)
  if ((e.target as HTMLElement).closest('.pca-dragging-top')) return;

  // Resolve the event from the click target's ancestor chain. Using
  // elementsFromPoint here would walk past portal-rendered overlays
  // (e.g. the calendar-picker dropdown inside the create-event dialog)
  // and incorrectly pick up an event element behind them.
  const eventElement = resolveEventForClick(e.target);
  if (!eventElement) return;

  // Don't trigger if this was a drag operation
  if (eventElement.classList.contains('pca-dragging-top')) return;

  const eventId = getEventId(eventElement);
  if (!eventId) return;

  // Clicks while the event has a Google dialog open (drafting, details
  // popover) select it only once the dialog closes and the event still exists.
  if (isInDialog(eventElement) || hadDialog) {
    console.log('[Event Enhancer] Selection deferred until its dialog closes:', eventId, `(${decodeForLog(eventId)})`);
    diagContent('select', 'info', 'selection deferred until dialog closes', {
      ...idParts(eventId),
      dialogOpenAtPress: hadDialog,
    });
    selectWhenDialogCloses(eventElement, selectEvent);
    return;
  }

  cancelDeferredSelection();
  selectEvent(eventId);
}, { capture: false }); // Let drag events take priority

/** Human-readable "<eventId> <calendar>" for logs; the raw id is base64. */
function decodeForLog(encodedEventId: string): string {
  try {
    return atob(encodedEventId);
  } catch {
    return '<undecodable>';
  }
}

/** Structured IDs for diagnostics (the encoded id is base64 of "<eventId> <calendarId>"). */
function idParts(encodedEventId: string): { eventId?: string; calendarId?: string } {
  try {
    const [eventId, calendarId] = atob(encodedEventId).split(' ');
    return { eventId, calendarId };
  } catch {
    return {};
  }
}

function selectEvent(encodedEventId: string) {
  console.log('[Event Enhancer] Event selected:', encodedEventId, `(${decodeForLog(encodedEventId)})`);
  diagContent('select', 'info', 'event selected', idParts(encodedEventId));
  chrome.runtime.sendMessage({
    type: MessageType.EVENT_SELECTED,
    encodedEventId
  });
}

console.log('[Event Enhancer] Event click detection initialized');

/**
 * Listen for keyboard shortcuts forwarded from the side panel
 * and navigate Google Calendar via URL changes.
 *
 * Since Google Calendar checks `isTrusted` on synthetic keyboard events,
 * we use URL-based navigation which works reliably with their SPA router.
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MessageType.FORWARD_KEYBOARD_SHORTCUT) {
    const key = message.key.toLowerCase();
    
    // Map keyboard shortcuts to their corresponding view URLs
    const viewMap: Record<string, string> = {
      'd': 'day',
      'w': 'week',
      'm': 'month',
      'a': 'agenda',
      'y': 'year',
      'x': 'customday',
    };
    
    // Navigation shortcuts (j/p = previous, k/n = next)
    const navigationMap: Record<string, number> = {
      'j': -1,
      'p': -1,
      'k': 1,
      'n': 1,
    };
    
    const path = window.location.pathname;
    const viewMatch = path.match(/\/calendar\/u\/\d+\/r\/(\w+)(?:\/(\d{4})\/(\d{1,2})\/(\d{1,2}))?/);
    const currentView = viewMatch ? viewMatch[1] : 'week';
    
    let newUrl: string | null = null;
    
    if (key === 't') {
      // "T" = Today
      const today = new Date();
      newUrl = `/calendar/u/0/r/${currentView}/${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
    } else if (viewMap[key]) {
      // View change shortcuts (D, W, M, A, Y, X)
      const dateMatch = path.match(/\/calendar\/u\/\d+\/r\/\w+\/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      const dateStr = dateMatch ? `/${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}` : '';
      newUrl = `/calendar/u/0/r/${viewMap[key]}${dateStr}`;
    } else if (navigationMap[key] !== undefined && viewMatch) {
      // Previous/Next navigation (J/P/K/N)
      const direction = navigationMap[key];
      let refDate: Date;
      if (viewMatch[2] && viewMatch[3] && viewMatch[4]) {
        refDate = new Date(parseInt(viewMatch[2]), parseInt(viewMatch[3]) - 1, parseInt(viewMatch[4]));
      } else {
        refDate = new Date();
      }
      
      // Calculate offset based on view type
      let offsetDays = 1;
      if (currentView === 'week') offsetDays = 7;
      else if (currentView === 'month') offsetDays = 30;
      else if (currentView === 'year') offsetDays = 365;
      
      refDate.setDate(refDate.getDate() + (direction * offsetDays));
      newUrl = `/calendar/u/0/r/${currentView}/${refDate.getFullYear()}/${refDate.getMonth() + 1}/${refDate.getDate()}`;
    }
    
    if (newUrl) {
      window.history.pushState({}, '', newUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }
  return false;
});
