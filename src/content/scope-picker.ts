// In-page scope picker shown after dragging a recurring event tile.
// Style injection and class prefix follow toast.ts (pca-).
// Imported only from the event-enhancer entry graph (see drag-handler.ts).

import type { EditScope } from '../lib/recurring/recurring-edit';

const STYLE_ID = 'pca-scope-picker-style';
const GAP = 8;
const SERIES_DISABLED_HINT = 'Changing the whole series needs write access to this calendar and organizer rights on the event';

const OPTIONS: ReadonlyArray<{ scope: EditScope; label: string; series: boolean }> = [
  { scope: 'this', label: 'This event', series: false },
  { scope: 'following', label: 'This and following events', series: true },
  { scope: 'all', label: 'All events', series: true },
];

// Only one picker at a time: opening a new one resolves the old one as cancelled.
let dismissActive: (() => void) | null = null;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .pca-scope-picker {
      position: fixed;
      z-index: 100001;
      width: 260px;
      box-sizing: border-box;
      padding: 12px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: 'Google Sans Flex', sans-serif;
      font-size: 14px;
      color: #1f2937;
    }

    .pca-scope-picker-title {
      font-weight: 500;
      margin-bottom: 8px;
    }

    .pca-scope-options {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .pca-scope-option {
      text-align: left;
      padding: 8px 10px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: white;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .pca-scope-option:hover:not(:disabled) {
      background: #f3f4f6;
    }

    .pca-scope-option.pca-scope-selected {
      border-color: #3b82f6;
      box-shadow: inset 0 0 0 1px #3b82f6;
    }

    .pca-scope-option:disabled {
      color: #9ca3af;
      cursor: not-allowed;
    }

    .pca-scope-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }

    .pca-scope-actions button {
      padding: 6px 14px;
      border-radius: 6px;
      font: inherit;
      cursor: pointer;
      border: 1px solid #d1d5db;
      background: white;
      color: inherit;
    }

    .pca-scope-ok {
      background: #3b82f6 !important;
      border-color: #3b82f6 !important;
      color: white !important;
    }
  `;
  document.head.appendChild(style);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Places the card beside the tile, flipping to the left and clamping to the viewport when needed. */
function position(card: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();

  let left = rect.right + GAP;
  if (left + cardRect.width > window.innerWidth) {
    left = Math.max(GAP, rect.left - cardRect.width - GAP);
  }
  const maxTop = window.innerHeight - cardRect.height - GAP;
  const top = Math.max(GAP, Math.min(rect.top, maxTop));

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

/**
 * Asks which recurring scope a drag should apply to. Resolves with the chosen scope,
 * or null on Cancel, Escape, a click outside the card, or when another picker opens.
 * The DOM is removed before the promise resolves.
 */
export function showScopePicker(anchor: HTMLElement, canEditSeries: boolean): Promise<EditScope | null> {
  dismissActive?.();
  injectStyles();

  return new Promise((resolve) => {
    let selected: EditScope = 'this';
    let done = false;

    const card = element('div', 'pca-scope-picker');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Edit recurring event');

    const title = element('div', 'pca-scope-picker-title', 'Edit recurring event');

    const group = element('div', 'pca-scope-options');
    group.setAttribute('role', 'radiogroup');
    const buttons = new Map<EditScope, HTMLButtonElement>();

    const render = () => {
      for (const [scope, button] of buttons) {
        const on = scope === selected;
        button.classList.toggle('pca-scope-selected', on);
        button.setAttribute('aria-checked', String(on));
      }
    };

    for (const option of OPTIONS) {
      const button = element('button', 'pca-scope-option', option.label);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.disabled = option.series && !canEditSeries;
      if (button.disabled) button.title = SERIES_DISABLED_HINT;
      button.addEventListener('click', () => {
        selected = option.scope;
        render();
      });
      buttons.set(option.scope, button);
      group.appendChild(button);
    }
    render();

    const actions = element('div', 'pca-scope-actions');
    const cancelButton = element('button', 'pca-scope-cancel', 'Cancel');
    cancelButton.type = 'button';
    const okButton = element('button', 'pca-scope-ok', 'OK');
    okButton.type = 'button';
    actions.append(cancelButton, okButton);

    card.append(title, group, actions);
    document.body.appendChild(card);
    position(card, anchor);

    const finish = (result: EditScope | null) => {
      if (done) return;
      done = true;
      document.removeEventListener('mousedown', onOutsideMouseDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      card.remove();
      if (dismissActive === dismiss) dismissActive = null;
      resolve(result);
    };
    const dismiss = () => finish(null);
    dismissActive = dismiss;

    const onOutsideMouseDown = (event: MouseEvent) => {
      if (!card.contains(event.target as Node)) finish(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };

    cancelButton.addEventListener('click', () => finish(null));
    okButton.addEventListener('click', () => finish(selected));
    document.addEventListener('mousedown', onOutsideMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
  });
}
