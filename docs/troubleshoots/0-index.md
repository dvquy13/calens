## Objective

This serves as an index page for troubleshooting guides related to issues encountered while developing the application.

## Issues Resolved

### Event Drag from Top Edge Not Working

**Symptom**: Users cannot drag events from the top edge to resize them.

**Root Cause**: The drag handle was being removed when the event was re-rendered.

**Solution**: Implemented event delegation to handle drag interactions without modifying the DOM.

**Reference**: See [Debug Session: Event Drag-from-Top Feature](./debug-event-drag-from-top-session.md) for detailed debugging steps and resolution.

---

### Bottom-Edge Drag Interference in Event Enhancer

**Date Resolved:** 2025-11-27
**Component:** Chrome Extension - Event Enhancer (`src/content/event-enhancer.ts`)

**Problem:**
Custom top-edge drag implementation interfered with Google Calendar's native bottom-edge resize functionality. Users were unable to drag events from the bottom edge, especially for short events (8-15px tall).

**Root Cause:**
Edge calculation bug where events shorter than 20px had overlapping top/bottom edge detection zones:
- Top edge threshold: 10px from top
- Bottom edge threshold: 10px from bottom
- Events < 20px tall: Zones overlap, entire event treated as "top edge"
- Result: Extension hijacked all clicks, blocking Google's bottom-drag

**Solution:**
Implemented dynamic edge zone calculation in `isAtTopEdge()` function:
1. Explicit bottom edge exclusion - immediately return `false` if within 10px of bottom
2. Dynamic top threshold based on event height: `Math.max(5, Math.min(10, (eventHeight - 10) / 2))`
3. Ensures zones never overlap, prioritizes Google's native behavior for small events

**Debug Process:**
See `./debug-default-drag-broken.md` for detailed systematic debugging process and diagnostic logs.

---

### Calendar ID Truncation in Event Updates

**Date Resolved:** 2025-11-27
**Component:** Chrome Extension - Background Service Worker (`src/background/index.ts`)

**Problem:**
Event top-edge drag updates failed with 404 errors when updating group calendar events. Google Calendar API rejected requests due to truncated calendar IDs.

**Root Cause:**
Google Calendar's DOM truncates group calendar IDs in `data-eventid` attribute from `@group.calendar.google.com` to `@g`, causing API calls to fail.

**Solution:**
Implemented calendar ID reconstruction logic that detects and expands truncated IDs:
- Pattern detection: IDs ending in `@g`
- Reconstruction: Replace `@g` with `@group.calendar.google.com`
- Enhanced error logging for debugging future truncation patterns

**Key Learning:**
Google Calendar's DOM data may be incomplete/truncated. Always validate and reconstruct critical identifiers before API calls.

**Reference:** See `./debug-event-top-drag-update-fail.md` for investigation process and diagnostic logs.

---

### Event Snap-Back After Top-Edge Drag

**Date Resolved:** 2025-11-27
**Component:** Chrome Extension - Event Enhancer (`src/content/event-enhancer.ts`)

**Problem:**
After dragging an event from the top edge and releasing the mouse:
1. Event visually snapped back to original position immediately
2. Event detail popup opened (as if clicked)
3. Event disappeared temporarily before reappearing
4. Final position only updated after 1-10 seconds (when Google Calendar refreshed)

**Root Causes:**
1. **Click event propagation**: The `mouseup` event wasn't being prevented, so Google Calendar interpreted the drag release as a click and opened the event detail popup.
2. **Premature style clearing**: On API success, inline styles (`style.top`, `style.height`) were being cleared before Google Calendar had refreshed its internal state, causing the element to render at the old position.
3. **MutationObserver conflict**: The MutationObserver was fighting with Google Calendar's re-render cycle, causing the event to disappear temporarily.

**Solution:**
1. **Block click after drag**: Added `upEvent.preventDefault()`, `upEvent.stopPropagation()`, and a one-time capture-phase click blocker in `onMouseUp()` to prevent Google Calendar from interpreting drag-end as a click.
2. **Keep inline styles on success**: Removed the code that cleared `style.top` and `style.height` on `UPDATE_EVENT_SUCCESS`. The inline styles now persist until Google Calendar naturally refreshes and overwrites them.
3. **Removed MutationObserver**: Simplified the approach by removing the MutationObserver that was causing conflicts with Google Calendar's rendering.

**Key Learnings:**
1. **mouseup ≠ click prevention**: Preventing `mousedown` doesn't stop the subsequent `click` event. Must explicitly block the click that follows a drag operation.
2. **Don't fight the framework**: Instead of using MutationObserver to fight Google Calendar's re-renders, it's better to keep inline styles applied and let the application naturally overwrite them when it refreshes.
3. **Optimistic UI timing**: When doing optimistic UI updates, don't clear visual state until the underlying system has confirmed the change in its own render cycle.

---

### Side Panel Description Persists When Switching Events

**Date Resolved:** 2025-11-29
**Component:** Chrome Extension - Side Panel (`src/components/EventDetailsPanel.tsx`, `src/components/ui/lexical-markdown-editor.tsx`)

**Problem:**
When switching between events in the side panel, the Lexical markdown editor displayed the previous event's description instead of updating to show the current event's content. All other fields (title, location, calendar) updated correctly, but the description field showed stale data.

**Root Cause:**
Two interrelated issues:
1. **InitialMarkdownPlugin race condition**: The plugin used an `initialized` boolean flag that prevented it from loading new markdown after the first load, even when the `markdown` prop changed.
2. **Dual state architecture**: Having both `event.description` (API data) and `formData.description` (form data) created sync issues. The editor would mount with stale `formData.description` before the new event data was fetched and synced.

**Solution:**
Implemented a hybrid fix combining plugin repair and architectural simplification:
1. **Fixed InitialMarkdownPlugin**: Replaced the `initialized` flag with ref-based change detection (`prevMarkdownRef`). The plugin now detects when markdown changes and reloads the editor content by clearing and repopulating it.
2. **Simplified architecture**: Eliminated the dual state by:
   - Removing `description` from FormData interface
   - Using `event.description` directly as the editor's `initialValue` (single source of truth)
   - Tracking user edits in a separate `descriptionDraft` state
   - Removing complex sync tracking logic (`_loadedForEventId`, `isFormDataSynced`)

**Key Learning:**
When integrating third-party editor components with React state, avoid dual sources of truth. Use the API data as the initialValue and track edits separately. Additionally, plugins that manage initialization state should use refs (not boolean flags) to allow re-initialization when props change.

**Reference:** See `./debug-side-panel-description-persists.md` for detailed debugging process, failed attempts, and complete solution documentation.
