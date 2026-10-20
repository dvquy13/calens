import { useEffect, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { $convertToMarkdownString, $convertFromMarkdownString, TRANSFORMERS, CHECK_LIST } from '@lexical/markdown';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { CodeNode } from '@lexical/code';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, $insertNodes, $getRoot, EditorState, COMMAND_PRIORITY_HIGH, PASTE_COMMAND, COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND, KEY_TAB_COMMAND, INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND, $createParagraphNode, $createTextNode, $isElementNode, ElementNode } from 'lexical';
import { $generateNodesFromDOM } from '@lexical/html';
import { marked } from 'marked';
import { $isListItemNode, $isListNode } from '@lexical/list';

// Zero-width space character used to preserve empty bullet points
const ZERO_WIDTH_SPACE = '\u200B';

// Extend default transformers with checkbox/task list support
// CHECK_LIST must come FIRST to match `- [ ]` before UNORDERED_LIST matches `- `
const MARKDOWN_TRANSFORMERS = [CHECK_LIST, ...TRANSFORMERS];

const theme = {
  paragraph: 'text-sm mb-2',
  heading: {
    h1: 'text-2xl font-bold mb-3 mt-4',
    h2: 'text-xl font-bold mb-2 mt-3',
    h3: 'text-lg font-bold mb-2 mt-2',
  },
  list: {
    ul: 'list-disc ml-4 mb-2',
    ol: 'list-decimal ml-4 mb-2',
    listitem: 'mb-1',
    nested: {
      listitem: 'list-none',
    },
    checklist: 'ml-4 mb-2 list-none',
    listitemChecked: 'lexical-checkbox-item lexical-checkbox-checked',
    listitemUnchecked: 'lexical-checkbox-item lexical-checkbox-unchecked',
  },
  link: 'text-primary underline cursor-pointer hover:text-primary/80',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: 'bg-muted px-1 py-0.5 rounded font-mono text-sm',
  },
  code: 'bg-muted p-2 rounded font-mono text-sm block my-2',
  quote: 'border-l-4 border-muted-foreground/30 pl-4 italic my-2',
};

interface LexicalMarkdownEditorProps {
  initialValue: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

// Plugin to set initial markdown content
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
          // Fix empty bullet points before loading into editor
          // Convert "-" to "- " + zero-width space to preserve empty list items
          const fixedMarkdown = markdown.replace(/^(\s*)-$/gm, `$1- ${ZERO_WIDTH_SPACE}`);
          $convertFromMarkdownString(fixedMarkdown, MARKDOWN_TRANSFORMERS);

          // Ensure all empty list items have zero-width space
          ensureEmptyListItemsHaveZWS();
        }
      });
      prevMarkdownRef.current = markdown;
    }
  }, [editor, markdown]);

  // Helper function to ensure empty list items have zero-width space
  function ensureEmptyListItemsHaveZWS() {
    const root = $getRoot();

    // Find ALL list items by traversing the tree
    const allListItems: ListItemNode[] = [];

    function traverse(node: ElementNode) {
      const children = node.getChildren();
      for (const child of children) {
        if ($isListItemNode(child)) {
          allListItems.push(child);
        }
        if ($isElementNode(child)) {
          traverse(child);
        }
      }
    }

    traverse(root);

    // Check each list item
    allListItems.forEach(listItem => {
      const children = listItem.getChildren();

      // Completely empty: no children at all
      if (children.length === 0) {
        listItem.append($createTextNode(ZERO_WIDTH_SPACE));
        return;
      }

      // Only whitespace: check if needs ZWS
      const textContent = listItem.getTextContent();
      if (textContent.trim() === '' && !textContent.includes(ZERO_WIDTH_SPACE)) {
        listItem.clear();
        listItem.append($createTextNode(ZERO_WIDTH_SPACE));
      }
    });
  }

  return null;
}

// Plugin to convert editor state to markdown on change
function MarkdownConversionPlugin({ onChange }: { onChange: (markdown: string) => void }) {
  const handleChange = (editorState: EditorState) => {
    editorState.read(() => {
      let markdown = $convertToMarkdownString(MARKDOWN_TRANSFORMERS);

      // Fix empty bullet points in the output markdown
      // Replace "-" with "- " or "- ​" (with zero-width space preserved)
      // Match lines that are just "-" or lines with "-" followed by only zero-width space
      markdown = markdown.replace(/^(\s*)- *\u200B *$/gm, `$1- ${ZERO_WIDTH_SPACE}`);
      markdown = markdown.replace(/^(\s*)-$/gm, `$1- ${ZERO_WIDTH_SPACE}`);

      onChange(markdown);
    });
  };

  return <OnChangePlugin onChange={handleChange} />;
}

// Plugin to handle pasting markdown and convert it to rich text
function MarkdownPastePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const text = clipboardData.getData('text/plain');
        if (!text) return false;

        // Check if the text looks like markdown (has markdown syntax)
        const hasMarkdownSyntax = /(\*\*|__|\*|_|##?|```|^[-*+]\s|\[.+\]\(.+\)|^>\s)/m.test(text);

        if (hasMarkdownSyntax) {
          event.preventDefault();

          editor.update(() => {
            const selection = $getSelection();

            // If there's a selection, delete it first
            if ($isRangeSelection(selection)) {
              selection.removeText();
            }

            // Convert markdown to HTML using marked with GFM (GitHub Flavored Markdown) for checkbox support
            const html = marked.parse(text, { gfm: true }) as string;

            // Parse HTML with DOMParser
            const parser = new DOMParser();
            const dom = parser.parseFromString(html, 'text/html');

            // Generate Lexical nodes from DOM
            const nodes = $generateNodesFromDOM(editor, dom);

            // Insert nodes at cursor position (preserves existing content)
            $insertNodes(nodes);
          });
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor]);

  return null;
}

// Plugin to exit list when Enter is pressed on an empty list item
function ListExitPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const node = selection.anchor.getNode();

        // Check if we're in a list item
        let listItemNode = $isListItemNode(node) ? node : node.getParent();
        if (!$isListItemNode(listItemNode)) return false;

        // Check if list item is empty
        const textContent = listItemNode.getTextContent();
        if (textContent.trim() === '') {
          // Prevent default and exit the list
          event?.preventDefault();

          // Get the list node before removing the item
          const listNode = listItemNode.getParent();
          if (!$isListNode(listNode)) return false;

          // Remove the empty list item
          listItemNode.remove();

          // Insert a paragraph after the list
          const paragraph = $createParagraphNode();
          listNode.insertAfter(paragraph);
          paragraph.select();

          return true; // Command handled
        }

        return false; // Let default behavior handle
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}

// Plugin to handle Tab/Shift+Tab for indenting/outdenting list items
function ListIndentPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const node = selection.anchor.getNode();
        const listItemNode = $isListItemNode(node) ? node : node.getParent();
        if (!$isListItemNode(listItemNode)) return false;

        event.preventDefault();

        if (event.shiftKey) {
          editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
        } else {
          editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
        }

        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return null;
}

export function LexicalMarkdownEditor({
  initialValue,
  onChange,
  onBlur,
  disabled = false,
  placeholder = 'Enter description...',
  id,
}: LexicalMarkdownEditorProps) {
  const namespace = id ? `EventDescriptionEditor-${id}` : 'EventDescriptionEditor';
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialConfig = {
    namespace,
    theme,
    onError: (error: Error) => {
      console.error('[LexicalMarkdownEditor] Error:', error);
    },
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      AutoLinkNode,
      CodeNode,
    ],
    editable: !disabled,
  };

  // Debounced blur handler to prevent auto-save on checkbox click
  const handleBlur = () => {
    // Set a timeout to delay the blur callback
    blurTimeoutRef.current = setTimeout(() => {
      if (onBlur) {
        onBlur();
      }
    }, 150);
  };

  // Clear timeout if focus returns to editor (e.g., after checkbox click)
  const handleFocus = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className={`
                min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2
                text-sm ring-offset-background placeholder:text-muted-foreground
                focus-visible:outline-none focus-visible:ring-0
                focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50
                overflow-y-auto max-h-[300px]
              `}
              aria-placeholder={placeholder}
              onBlur={handleBlur}
              onFocus={handleFocus}
              placeholder={
                <div className="absolute top-2 left-3 text-sm text-muted-foreground pointer-events-none">
                  {placeholder}
                </div>
              }
            />
          }
          ErrorBoundary={() => <div className="text-red-500 text-sm">Error loading editor</div>}
        />
        <HistoryPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <ListExitPlugin />
        <ListIndentPlugin />
        <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />
        <MarkdownPastePlugin />
        <InitialMarkdownPlugin markdown={initialValue} />
        <MarkdownConversionPlugin onChange={onChange} />
      </div>
    </LexicalComposer>
  );
}
