# Bug: Side Panel Description Persists When Switching Events

**Status**: ✅ RESOLVED
**Date**: 2025-11-29
**Date Resolved**: 2025-11-29
**Last Debug Session**: 2025-11-29 (Claude Debug Mode)
**Severity**: High - Core functionality broken

## Problem Description

When switching between events in the side panel, the description field (Lexical markdown editor) displays the **previous event's content** instead of updating to show the current event's description. All other fields (title, location, calendar) update correctly.

### Expected Behavior
1. User clicks Event A → Description shows Event A's content
2. User clicks Event B → Description shows Event B's content

### Actual Behavior
1. User clicks Event A → Description shows Event A's content ✓
2. User clicks Event B → Description **still shows Event A's content** ✗

### Variation Observed (2025-11-29)
- When switching to an event WITH a description: Sometimes shows correct content, sometimes shows old content (intermittent)
- When switching to an event WITHOUT a description: Always shows the previous event's description (consistent failure)

## Confirmed Root Cause

The bug is caused by a **race condition** in React's rendering lifecycle combined with how Lexical editor's `InitialMarkdownPlugin` manages its initialization state.

### The Race Condition (CONFIRMED via console logs)

```
1. eventId prop changes (Event A → Event B)
2. Component renders IMMEDIATELY with new eventId
3. At this moment:
   - isLoading = false (hasn't been set to true yet!)
   - event state still contains Event A's data
   - formData still contains Event A's description
4. Conditional {event && ...} is TRUE (event exists)
5. LexicalMarkdownEditor mounts with:
   - key={eventId} = Event B's ID (forces new instance)
   - id={eventId} = Event B's ID (unique namespace)
   - initialValue={formData.description} = Event A's description! ❌
6. InitialMarkdownPlugin loads Event A's markdown
7. Plugin sets initialized=true
8. THEN useEffect runs:
   - Sets event=null
   - Sets isLoading=true (TOO LATE!)
   - Fetches Event B
   - Updates formData with Event B's data
9. Component re-renders with Event B's data
10. Editor re-renders with initialValue=Event B's description
11. BUT InitialMarkdownPlugin says "already initialized" and skips! ❌
```

### Why isLoading Doesn't Help

The `isLoading` state is set to `true` **inside** the useEffect, which runs **after** the first render:
```javascript
useEffect(() => {
  setEvent(null);
  setFormData({ ... });
  setIsLoading(true);  // This happens AFTER the first render with stale data!
  // ... fetch
}, [eventId]);
```

So the first render after eventId changes still has `isLoading=false`, allowing the editor to mount.

## Console Log Evidence (Confirmed 2025-11-29)

When switching from Event A ("PCA Chrome Extension" with description "Hehe") to Event B ("Game" with no description):

```
[EventDetailsPanel] RENDER: {eventId: 'N7Fms...', isLoading: false, formDataDesc: 'Hehe...', willShowEditor: true}
[DEBUG] RENDERING LexicalMarkdownEditor with: {key: 'N7Fms...', initialValue: 'Hehe...'}  ← WRONG!
[InitialMarkdownPlugin] Effect running: {initialized: false, hasMarkdown: true, markdownPreview: 'Hehe...'}
[InitialMarkdownPlugin] ✓ Loading markdown into editor  ← Loads WRONG data!

[DEBUG] useEffect STARTED (this runs AFTER render!): {...}
[DEBUG] About to setEvent(null) and clear formData
[DEBUG] About to setIsLoading(true) - editor should hide after next render

[EventDetailsPanel] RENDER: {eventId: 'N7Fms...', isLoading: true, ...}  ← NOW loading, but editor already initialized!
...
[EventDetailsPanel] Event fetched: {id: '7qmsp8r...', summary: 'Game', description: undefined}
[EventDetailsPanel] Updating formData with event: {description: '(empty)'}

[InitialMarkdownPlugin] Effect running: {initialized: true, hasMarkdown: false, ...}
[InitialMarkdownPlugin] ✗ Skipping load - already initialized  ← Too late!
```

**Key insight**: The editor loads "Hehe..." (Event A's description) even though we're switching to Event B which has no description.

## Failed Solutions

### Attempt 1: Add `key={eventId}` to Force Remount
**File**: `EventDetailsPanel.tsx`
**Code**: `<LexicalMarkdownEditor key={eventId} ... />`
**Result**: FAILED - Editor remounts but with stale initialValue

### Attempt 2: Make Namespace Unique Per Event
**File**: `lexical-markdown-editor.tsx`
**Code**: `namespace: id ? 'EventDescriptionEditor-${id}' : 'EventDescriptionEditor'`
**Result**: FAILED - Prevents persistence but doesn't fix stale data

### Attempt 3: Conditional Rendering `{event && ...}`
**File**: `EventDetailsPanel.tsx`
**Code**: Wrap editor in `{event && (<div>...</div>)}`
**Result**: FAILED - event is still truthy when switching (contains old event)

### Attempt 4: Set `event=null` When eventId Changes
**File**: `EventDetailsPanel.tsx`
**Code**: `setEvent(null)` in useEffect
**Result**: FAILED - useEffect runs AFTER render, so editor already mounted with stale data

### Attempt 5: Clear `formData` When eventId Changes
**File**: `EventDetailsPanel.tsx`
**Code**: `setFormData({ summary: '', location: '', description: '' })` in useEffect
**Result**: FAILED - Same as Attempt 4, runs after render

### Attempt 6: Track formData sync with useRef (2025-11-29)
**File**: `EventDetailsPanel.tsx`
**Code**: 
```typescript
const formDataLoadedForEventIdRef = useRef<string | null>(null);
const isFormDataSynced = formDataLoadedForEventIdRef.current === eventId;

// In formData useEffect:
formDataLoadedForEventIdRef.current = eventId;

// In render:
{isFormDataSynced && <LexicalMarkdownEditor ... />}
```
**Result**: FAILED - Some improvement but still buggy. Ref updates in useEffect which runs after render, so timing is still wrong. Intermittent behavior suggests race conditions remain.

### Attempt 7: Embed eventId tracking in formData state (2025-11-29)
**File**: `EventDetailsPanel.tsx`
**Code**: 
```typescript
interface FormData {
  summary: string;
  location: string;
  description: string;
  _loadedForEventId: string | null;
}

const isFormDataSynced = formData._loadedForEventId === eventId;

// Guard in handleFormChange:
const handleFormChange = (field: keyof FormData, value: string) => {
  setFormData((prev) => {
    if (prev._loadedForEventId !== eventId) return prev; // Ignore stale updates
    return { ...prev, [field]: value };
  });
};
```
**Result**: FAILED - Still shows stale description. The issue is deeper - even with atomic state updates and guards, the editor's onChange callback may be firing before state is synced, or there's another source of the stale data.

## Why All Attempts Failed

All attempts tried to prevent stale data from reaching the editor, but they all suffer from the same fundamental issue: **React's useEffect runs AFTER rendering**.

The sequence is always:
1. Props change → Component renders → Editor mounts with stale data
2. useEffect runs → State updates
3. Component re-renders → Editor re-renders
4. Plugin already initialized → Skips loading new data

**Additional insight from Attempt 6-7**: Even when we try to delay rendering the editor until formData is synced, there appears to be additional complexity:
- The `MarkdownConversionPlugin`'s `onChange` might be calling `handleFormChange` with stale content
- There may be React batching or async state update issues we haven't fully traced

## Technical Details

### File Structure
- **EventDetailsPanel.tsx**: Parent component managing event state
- **lexical-markdown-editor.tsx**: Lexical editor wrapper
  - `InitialMarkdownPlugin`: Loads initial markdown (lines 52-74) - Has `initialized` state flag that never resets
  - `MarkdownConversionPlugin`: Converts editor state to markdown and calls `onChange` - May be source of stale updates

### Key State Variables
- `eventId` (prop): Encoded event ID (e.g., `'MDZ2MDF2YWY5...'`)
- `event` (state): Fetched event object with decoded ID (e.g., `{id: '06v01vaf9r39gtbhu2g8j8pmca', ...}`)
- `formData` (state): Form fields including description
- `initialized` (InitialMarkdownPlugin): Boolean flag preventing re-initialization

### ID Format Mismatch
- `eventId` prop = **encoded** (Base64)
- `event.id` = **decoded** (original event ID)
- They NEVER match, so conditional checks like `event.id === eventId` always fail

## Potential Solutions (Untried)

### Option A: Fix InitialMarkdownPlugin to Reinitialize on Markdown Change ⭐ RECOMMENDED
Modify the plugin to detect when markdown prop changes and reload:

```typescript
function InitialMarkdownPlugin({ markdown }: { markdown: string }) {
  const [editor] = useLexicalComposerContext();
  const prevMarkdownRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Only load if markdown changed (including initial load)
    if (markdown !== prevMarkdownRef.current) {
      editor.update(() => {
        // Clear the editor first
        const root = $getRoot();
        root.clear();
        // Then load new markdown
        if (markdown) {
          $convertFromMarkdownString(markdown, TRANSFORMERS);
        }
      });
      prevMarkdownRef.current = markdown;
    }
  }, [editor, markdown]);

  return null;
}
```

**Pros**: Fixes the root cause in the plugin - allows reload when markdown changes
**Cons**: Need to handle "during typing" case - maybe add a short debounce or only reload when markdown is significantly different
**Mitigation for typing**: Could compare markdown length or use a flag for "user is typing"

### Option B: Use `editorState` prop in initialConfig
Force LexicalComposer to use specific initial state:

```typescript
const initialConfig = useMemo(() => ({
  namespace: `EventDescriptionEditor-${id}`,
  theme,
  onError: (error: Error) => console.error(error),
  nodes: [...],
  editable: !disabled,
  editorState: () => {
    if (initialValue) {
      $convertFromMarkdownString(initialValue, TRANSFORMERS);
    }
  },
}), [id, initialValue, disabled]);
```

**Pros**: Clean React pattern, Lexical's intended way to set initial state
**Cons**: Need to verify this actually fixes the issue with key prop remounting

### Option C: Completely Unmount Editor During Event Switching
Use a separate state flag that unmounts the editor entirely:

```typescript
const [editorMounted, setEditorMounted] = useState(false);

useEffect(() => {
  setEditorMounted(false);  // Unmount immediately
}, [eventId]);

useEffect(() => {
  if (event && formData._loadedForEventId === eventId) {
    setEditorMounted(true);  // Remount when ready
  }
}, [event, formData._loadedForEventId, eventId]);

// Render:
{editorMounted && <LexicalMarkdownEditor ... />}
```

**Pros**: Guarantees fresh editor instance with correct data
**Cons**: May cause flicker, more complex state management

### Option D: Replace Lexical with Different Editor
Switch to a simpler markdown editor (e.g., react-markdown-editor-lite, react-simplemde-editor, or a simple textarea with markdown preview).

**Pros**: Might be easier than fighting Lexical's architecture
**Cons**: Major refactoring, lose Lexical's rich text features

### Option E: Debug the MarkdownConversionPlugin onChange
Investigate if `MarkdownConversionPlugin` is calling `onChange` with stale content:

```typescript
// Add logging to trace onChange calls
function MarkdownConversionPlugin({ onChange }: { onChange: (markdown: string) => void }) {
  const handleChange = (editorState: EditorState) => {
    editorState.read(() => {
      const markdown = $convertToMarkdownString(TRANSFORMERS);
      console.log('[MarkdownConversionPlugin] onChange called with:', markdown.substring(0, 50));
      onChange(markdown);
    });
  };
  return <OnChangePlugin onChange={handleChange} />;
}
```

**Pros**: Might reveal additional race condition
**Cons**: Diagnostic only, doesn't fix the issue

## Related Files

- `/src/components/EventDetailsPanel.tsx` - Main event panel component (CURRENT STATE HAS ATTEMPT 7 CODE)
- `/src/components/ui/lexical-markdown-editor.tsx` - Lexical editor wrapper
- `/src/sidepanel/Sidepanel.tsx` - Manages selectedEventId state

## Next Steps

1. **Try Option A first** - Fix InitialMarkdownPlugin to detect and reload on markdown changes
2. If Option A causes issues during typing, **try Option B** - Use editorState in initialConfig
3. If those don't work, **try Option C** - Completely unmount/remount editor
4. As last resort, **consider Option D** - Replace Lexical with simpler editor

## Debug Commands

To reproduce and debug:
```bash
# Build and run
npm run build-dev

# Watch console for these logs:
# [LexicalMarkdownEditor] Rendered with: {id, initialValue}
# [InitialMarkdownPlugin] Effect running: {initialized, markdownPreview}
```

## Notes

- The bug only affects the description field; other fields work correctly
- The issue is specific to Lexical's initialization pattern
- Multiple React state updates (event, formData) cause timing issues
- The `key` prop DOES force remounting, but doesn't solve stale data problem
- Attempts to track formData sync via refs or state have reduced but not eliminated the bug
- The intermittent nature suggests multiple race conditions may be involved

---

## Solution Implemented (2025-11-29)

**Approach**: Hybrid solution combining plugin fix and architectural simplification (Option C from potential solutions).

### Changes Made

#### 1. Fixed InitialMarkdownPlugin (lexical-markdown-editor.tsx:52-81)
**Problem**: The `initialized` boolean flag prevented the plugin from loading new markdown after the first load.

**Solution**: Replaced boolean flag with ref-based change detection:
```typescript
function InitialMarkdownPlugin({ markdown }: { markdown: string }) {
  const [editor] = useLexicalComposerContext();
  const prevMarkdownRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Only reload if markdown actually changed
    if (markdown !== prevMarkdownRef.current) {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        if (markdown) {
          $convertFromMarkdownString(markdown, TRANSFORMERS);
        }
      });
      prevMarkdownRef.current = markdown;
    }
  }, [editor, markdown]);

  return null;
}
```

**Key improvement**: Plugin now detects when markdown prop changes and reloads the editor content, while still avoiding unnecessary updates during typing.

#### 2. Simplified EventDetailsPanel Architecture (EventDetailsPanel.tsx)
**Problem**: Dual state (event.description + formData.description) created sync issues and race conditions.

**Solution**: Use event.description as single source of truth, track edits separately:
- Removed `description` and `_loadedForEventId` from FormData interface
- Added dedicated `descriptionDraft` state for tracking user edits
- Removed `isFormDataSynced` guard logic (no longer needed)
- Updated editor to use `initialValue={event.description || ''}` (always from API)
- Simplified rendering guard to just `{event ? <Editor /> : <Loading />}`

**Architecture before**:
```
event.description (API) → formData.description (synced copy) → editor → formData updates → save
                          ↑ _loadedForEventId (sync tracking)
```

**Architecture after**:
```
event.description (API) → editor initialValue
                          ↓ user edits
                        descriptionDraft → save
```

### Why This Works

**Before** (with race condition):
1. eventId changes → Component renders with stale formData
2. Editor mounts with stale formData.description
3. InitialMarkdownPlugin loads stale data and sets initialized=true
4. useEffect updates formData → Editor re-renders
5. InitialMarkdownPlugin ignores new data (initialized=true) ❌

**After** (fixed):
1. eventId changes → Component renders with stale event
2. useEffect runs, sets event=null
3. Component re-renders, editor unmounts (event=null guard)
4. Fetch completes, sets event to new value
5. Component re-renders, editor mounts with event.description
6. InitialMarkdownPlugin loads fresh data (prevMarkdown changed) ✅
7. User edits → Updates descriptionDraft
8. Save → Uses descriptionDraft

### Benefits
- ✅ No more stale description data when switching events
- ✅ Cleaner architecture with single source of truth
- ✅ Removed complex sync tracking logic
- ✅ Plugin can now handle dynamic content updates
- ✅ No cursor jumping during typing (confirmed by testing)

### Files Modified
1. `/src/components/ui/lexical-markdown-editor.tsx` - Fixed InitialMarkdownPlugin
2. `/src/components/EventDetailsPanel.tsx` - Simplified state management

### Testing Performed
- ✅ Switch from Event A (with description) to Event B (with description) → Shows Event B's description
- ✅ Switch from Event A (with description) to Event B (without description) → Shows empty editor
- ✅ Switch from Event A (without description) to Event B (with description) → Shows Event B's description
- ✅ Edit description while typing → No cursor jumps or content reloads