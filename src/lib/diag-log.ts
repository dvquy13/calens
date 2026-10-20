/**
 * Diagnostics log (service-worker side + shared helpers)
 *
 * Single writer: only the background service worker writes `diag_log` in
 * chrome.storage.local. SW code calls `diag()` directly (ctx 'sw'); the side
 * panel and content scripts send a fire-and-forget DIAG_LOG message (see
 * `diag-panel.ts` and `content/diag.ts`) that the SW handler appends via
 * `appendDiagEntry` with the sender's ctx.
 *
 * Writes go through an in-memory queue (batched, strictly ordered) so there is
 * no read-modify-write race. Entries are sanitised at write time: PII-ish keys
 * are dropped, strings capped, depth and array length limited.
 *
 * Panel/UI code may import types, `getDiagEntries` and `DIAG_STORAGE_KEY`
 * from here (storage.onChanged fires on every write), but must use
 * `diag-panel.ts` to log or clear. Content scripts must NOT import this file
 * (a module shared with the SW/panel entries would be split into a chunk).
 */

export const DIAG_STORAGE_KEY = 'diag_log';
export const DIAG_MAX_ENTRIES = 1000;
export const DIAG_MAX_BYTES = 300_000;
export const DIAG_MAX_STRING = 200;
export const DIAG_MAX_MSG = 300;
const MAX_DEPTH = 4;
const MAX_ARRAY = 20;

export type DiagCtx = 'sw' | 'panel' | 'content';
export type DiagCat =
  | 'select' | 'fetch' | 'sync' | 'api' | 'auth'
  | 'drag' | 'lifecycle' | 'error' | 'ui';
export type DiagLevel = 'info' | 'warn' | 'error';

export const DIAG_CATS: readonly DiagCat[] = [
  'select', 'fetch', 'sync', 'api', 'auth', 'drag', 'lifecycle', 'error', 'ui',
];
export const DIAG_LEVELS: readonly DiagLevel[] = ['info', 'warn', 'error'];

export interface DiagEntry {
  /** Epoch milliseconds (Date.now()) at the moment the SW recorded the entry. */
  t: number;
  ctx: DiagCtx;
  cat: DiagCat;
  level: DiagLevel;
  msg: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

/** Keys whose values are never stored (case-insensitive substring match). */
const REDACTED_KEY =
  /title|summary|description|location|attendee|token|authorization|secret|password|passwd|cookie|credential|api[_-]?key/i;
const TOKEN_LIKE = /\b(?:ya29\.|eyJ)[\w.-]{10,}/g;

function sanitizeString(s: string, max = DIAG_MAX_STRING): string {
  const cleaned = s.replace(TOKEN_LIKE, '[redacted-token]');
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (value === undefined) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: sanitizeString(value.message) };
  }
  if (depth >= MAX_DEPTH) return '[max-depth]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => sanitizeValue(v, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`[+${value.length - MAX_ARRAY} more]`);
    return items;
  }
  if (typeof value === 'object') return sanitizeObject(value as Record<string, unknown>, depth + 1);
  return `[${typeof value}]`;
}

function sanitizeObject(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (REDACTED_KEY.test(key)) continue;
    const clean = sanitizeValue(val, depth);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

/** Drop sensitive keys, cap strings/depth/array length. Returns undefined for empty/absent data. */
export function sanitize(data: unknown): Record<string, unknown> | undefined {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const out = sanitizeObject(data as Record<string, unknown>, 1);
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeMsg(msg: unknown): string {
  return sanitizeString(String(msg), DIAG_MAX_MSG);
}

// ---------------------------------------------------------------------------
// Ring buffer
// ---------------------------------------------------------------------------

/** Keep the newest DIAG_MAX_ENTRIES entries and at most DIAG_MAX_BYTES serialized. */
export function trimEntries(entries: DiagEntry[]): DiagEntry[] {
  let kept = entries.length > DIAG_MAX_ENTRIES ? entries.slice(-DIAG_MAX_ENTRIES) : entries;
  let total = JSON.stringify(kept).length;
  if (total <= DIAG_MAX_BYTES) return kept;
  let drop = 0;
  while (total > DIAG_MAX_BYTES && drop < kept.length - 1) {
    total -= JSON.stringify(kept[drop]).length + 1;
    drop++;
  }
  kept = kept.slice(drop);
  return kept;
}

// ---------------------------------------------------------------------------
// Writer (service worker only)
// ---------------------------------------------------------------------------

let pending: DiagEntry[] = [];
let chain: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  chain = chain.then(task).catch((error) => {
    // The log must never break the caller, but a failing log must be visible.
    console.error('[Diag] storage write failed:', error);
  });
  return chain;
}

async function flush(): Promise<void> {
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];
  const existing = await getDiagEntries();
  await chrome.storage.local.set({ [DIAG_STORAGE_KEY]: trimEntries([...existing, ...batch]) });
}

/** Append an entry with an explicit ctx (used by the DIAG_LOG message handler). Resolves once persisted. */
export function appendDiagEntry(
  ctx: DiagCtx,
  cat: DiagCat,
  level: DiagLevel,
  msg: string,
  data?: unknown
): Promise<void> {
  const entry: DiagEntry = { t: Date.now(), ctx, cat, level, msg: sanitizeMsg(msg) };
  const clean = sanitize(data);
  if (clean) entry.data = clean;
  pending.push(entry);
  return enqueue(flush);
}

/** Log from service-worker code (ctx 'sw'). Fire-and-forget. */
export function diag(cat: DiagCat, level: DiagLevel, msg: string, data?: Record<string, unknown>): void {
  void appendDiagEntry('sw', cat, level, msg, data);
}

/** Wipe the log (SW only; panel uses `clearDiagLog` from diag-panel.ts). Drops unflushed entries too. */
export function clearDiag(): Promise<void> {
  pending = [];
  return enqueue(() => chrome.storage.local.remove(DIAG_STORAGE_KEY));
}

/** Resolves when all queued writes have landed (tests, report builder). */
export function flushDiag(): Promise<void> {
  return enqueue(flush);
}

/** Read the log (any context). Oldest first. */
export async function getDiagEntries(): Promise<DiagEntry[]> {
  const result = await chrome.storage.local.get(DIAG_STORAGE_KEY);
  const stored = result[DIAG_STORAGE_KEY];
  return Array.isArray(stored) ? (stored as DiagEntry[]) : [];
}

// ---------------------------------------------------------------------------
// SW global error capture + lifecycle
// ---------------------------------------------------------------------------

function errorData(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { name: error.name, stack: error.stack?.split('\n').slice(0, 4).join(' | ') };
  return { value: String(error) };
}

export function installSwErrorCapture(): void {
  self.addEventListener('error', (e: ErrorEvent) => {
    diag('error', 'error', e.message || 'Uncaught error', {
      ...errorData(e.error),
      filename: e.filename,
      line: e.lineno,
    });
  });
  self.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    diag('error', 'error', `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`, errorData(reason));
  });
}

/** Log SW startup and install/update. Call once from the background entry. */
export function installSwLifecycleLogging(): void {
  const version = chrome.runtime.getManifest().version;
  diag('lifecycle', 'info', 'sw started', { version });
  chrome.runtime.onInstalled.addListener((details) => {
    diag('lifecycle', 'info', `onInstalled:${details.reason}`, {
      version,
      previousVersion: details.previousVersion,
    });
    // Legacy key from the pre-diag debug log
    void chrome.storage.local.remove('debug_log');
  });
}
