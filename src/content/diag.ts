/**
 * Content-script diagnostics sender. Standalone on purpose: import it ONLY from
 * the event-enhancer entry graph (a module imported by two content entries, or
 * by a content entry and the SW/panel, gets split into a chunk and content
 * scripts can't load chunks). It must not import from lib/. date-detector must
 * not import this; give it an inline sender if it ever needs logging.
 *
 * The SW (single writer) sanitises and stamps the entry with ctx 'content'.
 */

// Inlined from MessageType.DIAG_LOG (guarded by diag.test.ts)
export const DIAG_LOG_MESSAGE_TYPE = 'DIAG_LOG';

type Cat = 'select' | 'fetch' | 'sync' | 'api' | 'auth' | 'drag' | 'lifecycle' | 'error' | 'ui';
type Level = 'info' | 'warn' | 'error';

export function diagContent(cat: Cat, level: Level, msg: string, data?: Record<string, unknown>): void {
  try {
    chrome.runtime
      .sendMessage({ type: DIAG_LOG_MESSAGE_TYPE, cat, level, msg, data })
      .catch(() => {
        // SW unreachable / extension context invalidated: nothing useful to do from a page.
      });
  } catch {
    // sendMessage throws synchronously when the extension context is invalidated (extension reloaded).
  }
}

/** Report uncaught errors originating from our own code (filename or stack under chrome-extension://). */
export function installContentErrorCapture(): void {
  const isOurs = (text: unknown) => typeof text === 'string' && text.includes('chrome-extension://');
  window.addEventListener('error', (e) => {
    const stack = e.error instanceof Error ? e.error.stack : undefined;
    if (!isOurs(e.filename) && !isOurs(stack)) return;
    diagContent('error', 'error', e.message || 'Uncaught error', {
      filename: e.filename,
      line: e.lineno,
      stack: stack?.split('\n').slice(0, 4).join(' | '),
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const stack = reason instanceof Error ? reason.stack : undefined;
    if (!isOurs(stack)) return;
    diagContent('error', 'error', `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`, {
      stack: stack?.split('\n').slice(0, 4).join(' | '),
    });
  });
}
