import { useEffect } from 'react';
import { MessageType } from '../lib/message-types';

/**
 * Google Calendar keyboard shortcuts that should be forwarded
 * when the side panel is focused (but not when editing text)
 */
const CALENDAR_SHORTCUTS = new Set([
  'd', // Day view
  'w', // Week view
  'm', // Month view
  't', // Today
  'a', // Agenda view
  'y', // Year view
  'x', // Custom range
  'j', // Previous period
  'k', // Next period
  'n', // Next period (alias)
  'p', // Previous period (alias)
]);

/**
 * Check if the user is currently editing text in an input, textarea, or contenteditable element
 */
function isEditingText(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  const tagName = activeElement.tagName.toLowerCase();
  
  // Check for input and textarea elements
  if (tagName === 'input' || tagName === 'textarea') return true;
  
  // Check for contenteditable elements (like Lexical editor)
  if (activeElement.getAttribute('contenteditable') === 'true') return true;
  
  // Check if inside a contenteditable parent (for Lexical editor spans)
  if (activeElement.closest('[contenteditable="true"]')) return true;

  return false;
}

/**
 * Hook that listens for keyboard shortcuts in the side panel and forwards them
 * to Google Calendar. Only forwards when not editing text to avoid interfering
 * with user input.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is editing text in an input field
      if (isEditingText()) return;

      // Skip if any modifier keys are pressed (those are browser/system shortcuts)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      
      if (CALENDAR_SHORTCUTS.has(key)) {
        e.preventDefault();
        
        // Forward the shortcut to the content script via background
        chrome.runtime.sendMessage({
          type: MessageType.FORWARD_KEYBOARD_SHORTCUT,
          key: e.key,
        }).catch((error) => {
          console.debug('[useKeyboardShortcuts] Failed to forward shortcut:', error);
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}