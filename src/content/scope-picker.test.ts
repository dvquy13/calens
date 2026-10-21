// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { showScopePicker } from './scope-picker';

function optionButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.pca-scope-option'))
    .find((b) => b.textContent === label);
  if (!button) throw new Error(`no option "${label}"`);
  return button;
}

function okButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('.pca-scope-ok')!;
}

function cancelButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('.pca-scope-actions button:not(.pca-scope-ok)')!;
}

describe('showScopePicker', () => {
  let anchor: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    anchor = document.createElement('div');
    document.body.appendChild(anchor);
  });

  it('renders three options with "This event" selected by default', () => {
    void showScopePicker(anchor, true);

    const labels = Array.from(document.querySelectorAll('.pca-scope-option')).map((b) => b.textContent);
    expect(labels).toEqual(['This event', 'This and following events', 'All events']);
    expect(optionButton('This event').getAttribute('aria-checked')).toBe('true');
    expect(optionButton('All events').getAttribute('aria-checked')).toBe('false');
  });

  it('disables the series options when the user cannot edit the series', () => {
    void showScopePicker(anchor, false);

    expect(optionButton('This event').disabled).toBe(false);
    expect(optionButton('This and following events').disabled).toBe(true);
    expect(optionButton('All events').disabled).toBe(true);
    expect(optionButton('All events').title).not.toBe('');
  });

  it('resolves with the default scope on OK', async () => {
    const result = showScopePicker(anchor, true);
    okButton().click();

    await expect(result).resolves.toBe('this');
  });

  it('resolves with the scope clicked before OK', async () => {
    const result = showScopePicker(anchor, true);
    optionButton('This and following events').click();
    expect(optionButton('This and following events').getAttribute('aria-checked')).toBe('true');
    expect(optionButton('This event').getAttribute('aria-checked')).toBe('false');
    okButton().click();

    await expect(result).resolves.toBe('following');
  });

  it('resolves null on Cancel and removes the card', async () => {
    const result = showScopePicker(anchor, true);
    cancelButton().click();

    await expect(result).resolves.toBeNull();
    expect(document.querySelector('.pca-scope-picker')).toBeNull();
  });

  it('resolves null on Escape', async () => {
    const result = showScopePicker(anchor, true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(result).resolves.toBeNull();
    expect(document.querySelector('.pca-scope-picker')).toBeNull();
  });

  it('resolves null on a mousedown outside the card, but not inside it', async () => {
    const result = showScopePicker(anchor, true);
    optionButton('All events').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.pca-scope-picker')).not.toBeNull();

    anchor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    await expect(result).resolves.toBeNull();
    expect(document.querySelector('.pca-scope-picker')).toBeNull();
  });

  it('resolves an earlier picker as cancelled when a new one opens', async () => {
    const first = showScopePicker(anchor, true);
    const second = showScopePicker(anchor, true);

    await expect(first).resolves.toBeNull();
    expect(document.querySelectorAll('.pca-scope-picker')).toHaveLength(1);

    okButton().click();
    await expect(second).resolves.toBe('this');
  });
});
