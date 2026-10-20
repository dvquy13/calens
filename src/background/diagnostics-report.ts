/**
 * Diagnostics report builder (runs in the service worker).
 * Answers GET_DIAGNOSTICS_REPORT. No network calls, no interactive auth.
 */
import type { CalendarDatabase } from '../lib/db/database';
import { SYNC_METADATA_KEYS } from '../types/database';
import { flushDiag, getDiagEntries, type DiagEntry } from '../lib/diag-log';
import { buildCalendarLabels, Redactor } from '../lib/diag-redact';
import { lastSyncToIso } from '../lib/last-sync';

export interface DiagnosticsPanelState {
  selectedEventId?: string | null;
  currentError?: string | null;
}

export interface DiagnosticsCalendar {
  label: string;
  selected: boolean;
  last_sync: string | null; // ISO
  events_updated: number | null;
  stored_events: number;
}

export interface DiagnosticsReport {
  env: {
    version: string;
    mode: 'development' | 'production';
    userAgent: string;
    locale: string;
    timezone: string;
    generatedAt: string; // ISO
  };
  user: { email: string | null };
  auth: { hasToken: boolean; tokenExpiresAt: string | null; tokenExpired: boolean | null };
  calendars: DiagnosticsCalendar[];
  panelState: DiagnosticsPanelState; // redacted
  log: DiagEntry[]; // oldest first, redacted
}

/** `primary` first, then `cal-N` by numeric N (so cal-2 precedes cal-10), then anything else alphabetically. */
export function compareCalendarLabels(a: string, b: string): number {
  const rank = (l: string) => (l.startsWith('primary') ? -1 : Number(/^cal-(\d+)/.exec(l)?.[1] ?? Infinity));
  const ra = rank(a);
  const rb = rank(b);
  return ra === rb ? a.localeCompare(b) : ra < rb ? -1 : 1;
}

export async function buildDiagnosticsReport(
  panelState: DiagnosticsPanelState | undefined,
  db: CalendarDatabase
): Promise<DiagnosticsReport> {
  await flushDiag();

  const stored = await chrome.storage.local.get([
    'google_user',
    'google_access_token',
    'google_token_expires_at',
  ]);

  let email: string | null = null;
  if (typeof stored.google_user === 'string') {
    try {
      email = JSON.parse(stored.google_user)?.email ?? null;
    } catch {
      email = null;
    }
  }

  const expiresAt = stored.google_token_expires_at ? new Date(stored.google_token_expires_at) : null;
  const expiresValid = expiresAt && !Number.isNaN(expiresAt.getTime());

  const calendars = email ? await db.getUserCalendars(email) : [];
  const labels = buildCalendarLabels(calendars);
  const reportCalendars: DiagnosticsCalendar[] = [];
  for (const c of calendars) {
    const meta = await db.getUserMetadata(email!, `${SYNC_METADATA_KEYS.LAST_SYNC_PREFIX}${c.id}`);
    const events = await db.getCalendarEvents(email!, c.id);
    reportCalendars.push({
      label: labels.get(c.id)!,
      selected: c.selected,
      last_sync: lastSyncToIso(meta?.value?.last_sync),
      events_updated: typeof meta?.value?.events_updated === 'number' ? meta.value.events_updated : null,
      stored_events: events.length,
    });
  }
  reportCalendars.sort((a, b) => compareCalendarLabels(a.label, b.label));

  const redactor = new Redactor(labels);
  const state = panelState ?? {};

  return {
    env: {
      version: chrome.runtime.getManifest().version,
      mode: import.meta.env.MODE === 'development' ? 'development' : 'production',
      userAgent: navigator.userAgent,
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      generatedAt: new Date().toISOString(),
    },
    user: { email },
    auth: {
      hasToken: Boolean(stored.google_access_token),
      tokenExpiresAt: expiresValid ? expiresAt.toISOString() : null,
      tokenExpired: expiresValid ? expiresAt.getTime() < Date.now() : null,
    },
    calendars: reportCalendars,
    panelState: redactor.value(state) as DiagnosticsPanelState,
    log: (await getDiagEntries()).map((e) => redactor.entry(e)),
  };
}
