/**
 * Diagnostics log (side panel side). Sends fire-and-forget messages to the
 * service worker, which is the single writer of `diag_log`. Never import
 * `diag-log.ts`'s writer functions from panel code.
 */
import { MessageType } from './message-types';
import type { DiagCat, DiagLevel } from './diag-log';

/** Log from the side panel (ctx 'panel' is assigned by the SW from the sender). */
export function diag(cat: DiagCat, level: DiagLevel, msg: string, data?: Record<string, unknown>): void {
  chrome.runtime
    .sendMessage({ type: MessageType.DIAG_LOG, cat, level, msg, data })
    .catch((error) => console.warn('[Diag] could not reach service worker:', error));
}

/** Clear the log via the service worker (keeps a single writer). Resolves once cleared. */
export async function clearDiagLog(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: MessageType.DIAG_CLEAR });
  if (!response?.success) throw new Error(response?.error ?? 'Failed to clear diagnostics log');
}

/** Capture uncaught errors / unhandled rejections in the panel. Call once at startup. */
export function installPanelErrorCapture(): void {
  window.addEventListener('error', (e) => {
    diag('error', 'error', e.message || 'Uncaught error', {
      filename: e.filename,
      line: e.lineno,
      stack: e.error instanceof Error ? e.error.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    diag('error', 'error', `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`, {
      stack: reason instanceof Error ? reason.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
    });
  });
}
