# Debug Session: Event Drag-from-Top Feature

**Date**: 2025-11-26  
**Feature**: Enable dragging from the top of calendar events to edit start time

## Problem Statement

The Chrome extension for Google Calendar should allow users to drag from the **top edge** of an event to edit the start time (in addition to the default bottom-edge drag for end time). The initial implementation was not working - the cursor wouldn't change to a drag icon when hovering over the top of an event.

## Issues Found & Fixed

### Issue 1: Content Script Variable Collision ✅ FIXED

**Symptom**: Script not loading, `Uncaught SyntaxError: Identifier 'g' has already been declared`

**Root Cause**: Both content scripts ([`date-detector.ts`](../src/content/date-detector.ts) and [`event-enhancer.ts`](../src/content/event-enhancer.ts)) were minified by Vite and both used the same short variable name `g`. Since they run in the same page context (not isolated), the second script failed.

**Solution**: Wrapped both content scripts in IIFE (Immediately Invoked Function Expression) to isolate their scopes:
```typescript
(function() {
'use strict';
// ... script code ...
})();
```

### Issue 2: DOM Elements Being Destroyed by Google Calendar ✅ FIXED

**Symptom**: Handles were created (verified: true) but disappeared immediately (count: 0)

**Root Cause**: Google Calendar uses a React-like virtual DOM that frequently re-renders event elements, destroying any DOM modifications we made.

**Solution**: Switched from **DOM manipulation** (adding handle elements) to **event delegation** (single document-level listeners):

```typescript
// Instead of adding elements to each event:
// element.appendChild(handle);  // Gets destroyed!

// Use event delegation:
document.addEventListener('mousemove', (e) => {
    const eventElement = findEventElementAt(e.clientX, e.clientY);
    if (eventElement && isAtTopEdge(eventElement, e.clientY)) {
        eventElement.style.cursor = 'ns-resize';
    }
});

document.addEventListener('mousedown', (e) => {
    const eventElement = findEventElementAt(e.clientX, e.clientY);
    if (eventElement && isAtTopEdge(eventElement, e.clientY)) {
        initDrag(e, eventElement);
    }
});
```

### Issue 3: API Call Using Wrong Calendar ID 🔄 IN PROGRESS

**Symptom**: `[Background] Fetch event failed:` when trying to update event via API

**Root Cause**: The background script uses `calendars/primary` but events can be on different calendars. The encoded `data-eventid` contains both:
- Event ID: `4gbkiosss0492hn89sa812ap4h`
- Calendar ID: `p3eeh43nuic2kc3gja7sie6f24@group.calendar.google.com`

The current decoding extracts the event ID but uses "primary" as the calendar ID.

**Next Step**: Update [`background.ts`](../src/background/index.ts) to extract and use the correct calendar ID from the decoded event ID.

## Current Status

| Component | Status |
|-----------|--------|
| Content script loading | ✅ Working |
| Cursor change on hover | ✅ Working |
| Visual drag feedback | ✅ Working |
| API event update | ❌ Needs calendar ID fix |

## Files Modified

1. [`src/content/event-enhancer.ts`](../src/content/event-enhancer.ts) - Rewrote to use event delegation
2. [`src/content/date-detector.ts`](../src/content/date-detector.ts) - Added IIFE wrapper

## Next Steps

1. **Fix calendar ID extraction** in [`background.ts`](../src/background/index.ts):
   ```typescript
   // Current:
   const decoded = atob(encodedEventId);
   const parts = decoded.split(' ');
   eventId = parts[0];
   // Uses: calendars/primary/events/${eventId}
   
   // Should be:
   const [eventId, calendarId] = decoded.split(' ');
   // Use: calendars/${encodeURIComponent(calendarId)}/events/${eventId}
   ```

2. **Test with events on different calendars** (primary vs shared calendars)

3. **Add error handling** for edge cases (all-day events, recurring events)

4. **Remove debug logging** once feature is stable

## Key Learnings

1. **Content scripts share page context** - Variable collisions can occur between minified scripts
2. **Google Calendar re-renders frequently** - DOM modifications are unreliable; use event delegation
3. **Event IDs are encoded** - Base64 encoded format contains both event ID and calendar ID
