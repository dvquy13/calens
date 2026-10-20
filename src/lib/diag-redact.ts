/**
 * Report-time redaction (pure, no chrome APIs).
 *
 * Every calendar ID in log entries is replaced with its report label, in three
 * forms: the full ID, Google's shortened `data-eventid` form (`x@g`, `x@m`,
 * resolved with `resolveCalendarId`), and base64 `data-eventid` values
 * (`base64("eventId calendarId")`), which are decoded, relabelled and
 * re-encoded so they still correlate with the panel state's event ID. Any other
 * email-looking string is masked as `a***@domain`. The user's own email is
 * labelled like any other calendar ID (the primary calendar is `primary`).
 */
import { resolveCalendarId } from './event-id-utils';
import type { DiagEntry } from './diag-log';

export type CalendarType = 'group' | 'user' | 'holiday' | 'other';

export function classifyCalendar(id: string): CalendarType {
  const lower = id.toLowerCase();
  if (lower.includes('#holiday@') || lower.includes('@holiday.calendar.google.com')) return 'holiday';
  if (lower.endsWith('@group.calendar.google.com')) return 'group';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lower) && !lower.endsWith('calendar.google.com')) return 'user';
  return 'other';
}

/** Build id -> label. Primary is `primary`; the rest are `cal-N (type)` ordered by id for stability. */
export function buildCalendarLabels(calendars: { id: string; primary: boolean }[]): Map<string, string> {
  const labels = new Map<string, string>();
  const others = calendars.filter((c) => !c.primary).sort((a, b) => a.id.localeCompare(b.id));
  for (const c of calendars) if (c.primary) labels.set(c.id, 'primary');
  others.forEach((c, i) => labels.set(c.id, `cal-${i + 1} (${classifyCalendar(c.id)})`));
  return labels;
}

const EMAIL_LIKE = /[A-Za-z0-9._%+#-]+@[A-Za-z0-9.-]+/g;
const BASE64_LIKE = /[A-Za-z0-9+/_-]{16,}={0,2}/g;

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

export class Redactor {
  private lowerLabels = new Map<string, string>();
  private lowerIds: string[];

  constructor(labels: Map<string, string>) {
    for (const [id, label] of labels) this.lowerLabels.set(id.toLowerCase(), label);
    this.lowerIds = [...this.lowerLabels.keys()];
  }

  private labelFor(token: string): string | null {
    const lower = token.toLowerCase();
    const exact = this.lowerLabels.get(lower);
    if (exact) return exact;
    const resolved = resolveCalendarId(lower, this.lowerIds);
    return resolved ? (this.lowerLabels.get(resolved) ?? null) : null;
  }

  private redactBase64(token: string): string {
    let decoded: string;
    try {
      decoded = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return token;
    }
    const parts = decoded.split(' ');
    if (parts.length !== 2 || !/^[\x20-\x7e]+$/.test(decoded) || !parts[1].includes('@')) return token;
    const label = this.labelFor(parts[1]) ?? maskEmail(parts[1]);
    const encoded = btoa(`${parts[0]} ${label}`);
    return token.endsWith('=') ? encoded : encoded.replace(/=+$/, '');
  }

  string(s: string): string {
    return s
      .replace(BASE64_LIKE, (m) => this.redactBase64(m))
      .replace(EMAIL_LIKE, (m) => this.labelFor(m) ?? maskEmail(m));
  }

  value(v: unknown): unknown {
    if (typeof v === 'string') return this.string(v);
    if (Array.isArray(v)) return v.map((x) => this.value(x));
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [this.string(k), this.value(x)]));
    }
    return v;
  }

  entry(e: DiagEntry): DiagEntry {
    const out: DiagEntry = { ...e, msg: this.string(e.msg) };
    if (e.data) out.data = this.value(e.data) as Record<string, unknown>;
    return out;
  }
}
