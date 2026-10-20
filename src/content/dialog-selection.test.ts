// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { isInDialog, eventHasOpenDialog, selectWhenDialogCloses, cancelDeferredSelection } from './dialog-selection';

/**
 * Regression: clicks inside Google's Create dialog selected the unsaved draft,
 * so the side panel showed "Event not found" while the user was drafting.
 * Selection is now held until the dialog closes, and only happens if the event
 * block is still on the grid (Save), not when it was removed first (Discard).
 */

const encode = (eventId: string, calendarId: string) => btoa(`${eventId} ${calendarId}`);
const flushMutations = () => Promise.resolve();

function renderDraft(eventId: string) {
  const id = encode(eventId, 'someone@m');
  document.body.innerHTML = `
    <div id="grid"><div id="block" data-eventid="${id}">(No title)</div></div>
    <div id="dialog" role="dialog"><div data-eventid="${id}"><input id="title"><button id="save">Save</button></div></div>`;
  return {
    block: document.getElementById('block')!,
    dialogInner: document.querySelector('#dialog [data-eventid]')!,
    dialog: document.getElementById('dialog')!,
  };
}

describe('dialog-selection', () => {
  let select: Mock<(encodedEventId: string) => void>;

  beforeEach(() => {
    cancelDeferredSelection();
    document.body.innerHTML = '';
    select = vi.fn<(encodedEventId: string) => void>();
  });

  it('recognizes elements inside a dialog and blocks whose event has a dialog open', () => {
    const { block, dialogInner } = renderDraft('evt1');
    expect(isInDialog(dialogInner)).toBe(true);
    expect(isInDialog(block)).toBe(false);
    expect(eventHasOpenDialog(block)).toBe(true);
  });

  it('reports no open dialog for an event block without one', () => {
    document.body.innerHTML = `<div id="block" data-eventid="${encode('evt1', 'someone@m')}"></div>`;
    expect(eventHasOpenDialog(document.getElementById('block')!)).toBe(false);
  });

  it('selects the saved event once the dialog closes with its block still on the grid', async () => {
    const { block, dialogInner, dialog } = renderDraft('evt1');
    selectWhenDialogCloses(dialogInner, select);

    block.setAttribute('data-eventid', encode('evt1', 'abc123@g')); // switched calendar, saved
    await flushMutations();
    expect(select).not.toHaveBeenCalled();

    dialog.remove();
    await flushMutations();
    expect(select).toHaveBeenCalledExactlyOnceWith(encode('evt1', 'abc123@g'));
  });

  it('does not select a discarded draft (block removed before the dialog)', async () => {
    const { block, dialogInner, dialog } = renderDraft('evt1');
    selectWhenDialogCloses(dialogInner, select);

    block.remove();
    await flushMutations();
    dialog.remove();
    await flushMutations();

    expect(select).not.toHaveBeenCalled();
  });

  it('drops a deferred selection when a newer selection is made', async () => {
    const { dialogInner, dialog } = renderDraft('evt1');
    selectWhenDialogCloses(dialogInner, select);

    cancelDeferredSelection();
    dialog.remove();
    await flushMutations();

    expect(select).not.toHaveBeenCalled();
  });
});
