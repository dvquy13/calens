# Investigation: Checkbox Markdown Rendering Issue

## Problem Summary

**Issue:** Typing `- [ ]` doesn't render checkbox immediately in the Description field.
- Typing `[ ] Task` (no dash) → ✅ Creates checkbox immediately
- Typing `- [ ] Task` (with dash) → ❌ Does NOT create checkbox, stays as text until save/reload
- Typing `* [ ] Task` (asterisk) → ❌ Same issue as dash
- After save/reload, `- [ ]` DOES render correctly

## Root Cause Analysis

### The Fundamental Timing Issue

**Lexical's MarkdownShortcutPlugin behavior:**
1. Plugin triggers on **SPACE character**
2. When user types `- ` (dash + space), the plugin immediately checks all transformers
3. CHECK_LIST regex: `/^(\s*)([-*+]\s)?(\[(\s|x)?\])\s/i` - requires full pattern `- [ ]`
4. At this moment, user has only typed `- `, not `- [ ]`
5. CHECK_LIST doesn't match (correctly - pattern is incomplete)
6. UNORDERED_LIST regex: `/^(\s*)[-*+]\s/` - matches `- ` ✅
7. UNORDERED_LIST transformer executes and creates a bullet list
8. User is now typing inside a list item context
9. When user continues typing `[`, they're just adding text to the list item
10. CHECK_LIST never gets another chance to match

**Diagnostic Evidence:**
```
[DEBUG] CHECK_LIST regex.exec: {str: '- ', result: null} ❌
[DEBUG] HEADING regex.exec: {str: '- ', matched: false}
[DEBUG] QUOTE regex.exec: {str: '- ', matched: false}
[DEBUG] UNORDERED_LIST regex.exec: {str: '- ', matched: true} ✅ CREATES LIST
```

The plugin processes transformers sequentially and returns after first match. By the time the full `- [ ]` pattern is typed, the context has changed to a list item.

### Why `[ ] Task` Works

When typing `[ ] ` (without dash):
1. Plugin triggers after typing first space after `[`
2. At this point, user has typed `[ ` which doesn't match any transformer
3. Plugin doesn't transform anything yet
4. User continues typing `]` then space
5. Plugin triggers again after final space
6. Now the pattern is `[ ] ` which matches CHECK_LIST regex
7. CHECK_LIST transformer executes and creates checkbox ✅

## Attempted Solutions

### Solution 1: Fix CHECK_LIST Regex ✅ (Partial Success)

**Attempted:** Remove problematic `\s?` from Lexical's regex
```javascript
// Lexical's original (flawed):
/^(\s*)(?:[-*+]\s)?\s?(\[(\s|x)?\])\s/i
//                  ^^ Extra optional space causes match length ambiguity

// Our fix:
/^(\s*)([-*+]\s)?(\[(\s|x)?\])\s/i
//              ^^ Removed the problematic \s?
```

**Result:** Regex is now correct, but doesn't solve the timing issue. The regex still requires the full pattern before matching, so UNORDERED_LIST still wins the race.

### Solution 2: Negative Lookahead in UNORDERED_LIST ❌ (Failed)

**Attempted:** Modify UNORDERED_LIST regex to not match if followed by `[`
```javascript
// Modified regex:
/^(\s*)[-*+]\s(?!\[)/  // Don't match if next char is `[`
```

**Why it failed:**
- Negative lookahead `(?!\[)` checks the NEXT character in the **current match string**
- At the moment of matching, the string is `"- "` (dash + space)
- The user hasn't typed `[` yet - it's future input, not in the match string
- Lookahead can't predict future keystrokes

**Diagnostic Evidence:**
```
User types: `-`
User types: ` ` (space)
  → Plugin triggers
  → Match string: "- "
  → Lookahead checks: is next char after space a `[`?
  → No characters after space in current string
  → Lookahead succeeds (no `[` found)
  → UNORDERED_LIST matches ✅
  → List created before user can type `[`
```

### Solution 3: Remove UNORDERED_LIST from Shortcuts ✅ (Works, but with trade-offs)

**Implemented:**
```typescript
const TRANSFORMERS_WITHOUT_UNORDERED = TRANSFORMERS.filter((t: any) => {
  return t !== TRANSFORMERS[2]; // Remove UNORDERED_LIST
});

const MARKDOWN_TRANSFORMERS = [CUSTOM_CHECK_LIST, ...TRANSFORMERS_WITHOUT_UNORDERED];
const MARKDOWN_TRANSFORMERS_FULL = [CUSTOM_CHECK_LIST, ...TRANSFORMERS]; // For import/export
```

**Result:**
- ✅ Checkboxes work: `[ ] task` creates checkbox
- ✅ Import/export preserves `- ` lists (uses FULL transformers)
- ✅ Paste still works for `- ` lists
- ❌ Can't type `- regular item` to create bullet list via shortcut
- ✅ Can still type `* item` or `+ item` for lists

**Trade-off:** Users lose the ability to type `- ` for bullet lists, but gain checkbox support.

## Final Decision

**Chosen Approach:** Accept the limitation and educate users

**Rationale:**
1. The issue is fundamental to how MarkdownShortcutPlugin works (triggers on space)
2. Cannot predict future user input from regex patterns
3. Any "fix" either breaks bullet lists or breaks checkboxes
4. Users can adapt to typing `[ ] task` instead of `- [ ] task`
5. Better UX to provide clear guidance than confusing behavior

**Implementation:**
- Keep working solution (UNORDERED_LIST removed from shortcuts)
- Add tooltip next to Description label explaining markdown syntax
- Specifically note: "Type checkboxes without dash: [ ] not - [ ]"
- Document in patterns-and-decisions.md for future reference

## Workaround for Users

**Checkboxes:**
- ✅ Type: `[ ] task` (works immediately)
- ✅ Type: `[x] done` (works immediately)
- ❌ Don't type: `- [ ] task` (will create bullet list with text)

**Bullet Lists:**
- ✅ Type: `* item` (works)
- ✅ Type: `+ item` (works)
- ❌ Type: `- item` (doesn't create list via shortcut)
- ✅ Paste: `- item` from markdown (works, uses import)

## Technical Insights for Future Reference

1. **MarkdownShortcutPlugin triggers on specific characters** (space, enter, etc.), not continuously
2. **Transformers are processed sequentially** - first match wins
3. **Regex lookahead/lookbehind work on the match string**, not future input
4. **Two transformer sets possible**: one for shortcuts (typing), one for import/export
5. **Lexical's optimistic UI** means we can have different behavior for different contexts

## Related Files

- `src/components/ui/lexical-markdown-editor.tsx` - Transformer configuration
- `src/components/EventDetailsPanel.tsx` - Description field with tooltip
- `docs/patterns-and-decisions.md` - Architectural decision record
