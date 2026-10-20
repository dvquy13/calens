import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchReport } from './DebugPanel';
import { MessageType } from '../../lib/message-types';
import type { DiagnosticsPanelState } from '../../background/diagnostics-report';

const panelState: DiagnosticsPanelState = { selectedEventId: null, currentError: null } as unknown as DiagnosticsPanelState;

describe('fetchReport', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an actionable message when no listener answers (undefined response)', async () => {
    sendMessage.mockResolvedValue(undefined);

    await expect(fetchReport(panelState)).rejects.toThrow(
      "Calens' background service didn't respond. Reload the extension in chrome://extensions and try again.",
    );
    expect(sendMessage).toHaveBeenCalledWith({ type: MessageType.GET_DIAGNOSTICS_REPORT, panelState });
  });

  it('surfaces the service worker error when success is false', async () => {
    sendMessage.mockResolvedValue({ success: false, error: 'boom' });

    await expect(fetchReport(panelState)).rejects.toThrow('boom');
  });

  it('returns data when success is true', async () => {
    const data = { env: { version: '1' } };
    sendMessage.mockResolvedValue({ success: true, data });

    await expect(fetchReport(panelState)).resolves.toBe(data);
  });
});
