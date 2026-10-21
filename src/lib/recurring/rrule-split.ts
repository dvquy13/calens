/**
 * Split a recurring series at one occurrence, following RFC 5545 semantics.
 * Pure: no I/O, so it runs in the service worker, the side panel and tests alike.
 *
 * The old series keeps occurrences strictly before `splitAt`; the new series
 * starts at `splitAt`. Each line of `recurrence` is handled by kind:
 * RRULE is bounded (old) or re-counted (new), EXDATE/RDATE values are
 * partitioned by instant, anything else is copied to both.
 */

interface DateLine {
  head: string; // everything before the colon, params included, copied verbatim
  tzid?: string;
  values: string[];
}

/** UTC epoch ms of the first moment of the UTC day that contains `date`. */
function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Offset of `timeZone` from UTC at instant `ms`, in ms (east positive). */
function timeZoneOffsetMs(ms: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(ms))) {
    parts[part.type] = part.value;
  }
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return wallClockAsUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Parse one iCalendar date or date-time value to epoch ms.
 * - `YYYYMMDD` is the UTC midnight of that date (all-day values).
 * - `YYYYMMDDTHHMMSSZ` is that UTC instant.
 * - `YYYYMMDDTHHMMSS` is wall-clock time in `tzid`, or UTC when no TZID is given
 *   (floating time; Google always writes TZID or Z for timed values).
 */
export function parseIcalDate(value: string, tzid?: string): number {
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) {
    return Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!dateTime) {
    throw new Error(`Unrecognised iCalendar date value: ${value}`);
  }

  const [y, mo, d, h, mi, s] = dateTime.slice(1, 7).map(Number);
  const wallClockAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  if (dateTime[7] === 'Z' || !tzid) {
    return wallClockAsUtc;
  }

  // Two passes so the offset is evaluated at the resolved instant, not the naive one (DST edges).
  const firstGuess = wallClockAsUtc - timeZoneOffsetMs(wallClockAsUtc, tzid);
  return wallClockAsUtc - timeZoneOffsetMs(firstGuess, tzid);
}

function formatUtc(ms: number): string {
  // 2026-11-02T08:59:59.000Z -> 20261102T085959Z
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
}

function parseDateLine(line: string): DateLine {
  const colon = line.indexOf(':');
  if (colon < 0) {
    throw new Error(`Malformed iCalendar date line: ${line}`);
  }
  const head = line.slice(0, colon);
  const params = head.split(';').slice(1);
  const tzidParam = params.find((p) => p.toUpperCase().startsWith('TZID='));
  const tzid = tzidParam?.slice('TZID='.length).replace(/"/g, '');
  const values = line
    .slice(colon + 1)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return { head, tzid, values };
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!/^\d+$/.test(value) || count < 1) {
    throw new Error(`Malformed RRULE COUNT: ${value}`);
  }
  return count;
}

function serializeRule(rules: Array<{ key: string; value: string }>): string {
  return `RRULE:${rules.map((r) => `${r.key}=${r.value}`).join(';')}`;
}

/**
 * @param recurrence master.recurrence lines
 * @param splitAt the instance's original start (UTC instant; for all-day, the UTC date of this value is used)
 * @param isAllDay whether the series uses all-day (VALUE=DATE) dates
 * @param countBefore occurrences generated before `splitAt`, required only when an RRULE has COUNT
 */
export function splitRecurrence(
  recurrence: string[],
  splitAt: Date,
  isAllDay: boolean,
  countBefore?: number
): { oldRecurrence: string[]; newRecurrence: string[] } {
  const splitMs = isAllDay ? utcDayStart(splitAt) : splitAt.getTime();
  const oldRecurrence: string[] = [];
  const newRecurrence: string[] = [];

  for (const line of recurrence) {
    const name = line.split(/[;:]/)[0].toUpperCase();

    if (name === 'RRULE') {
      const rules = line
        .slice(line.indexOf(':') + 1)
        .split(';')
        .filter(Boolean)
        .map((part) => {
          const eq = part.indexOf('=');
          return { key: part.slice(0, eq).toUpperCase(), value: part.slice(eq + 1) };
        });

      // Validate COUNT on both sides so a malformed rule fails loudly.
      const count = rules.find((r) => r.key === 'COUNT');
      const parsedCount = count ? parseCount(count.value) : undefined;

      const until = isAllDay
        ? formatDate(splitMs - 24 * 60 * 60 * 1000)
        : formatUtc(splitMs - 1000);
      oldRecurrence.push(
        serializeRule([...rules.filter((r) => r.key !== 'COUNT' && r.key !== 'UNTIL'), { key: 'UNTIL', value: until }])
      );

      if (parsedCount === undefined) {
        newRecurrence.push(line);
        continue;
      }
      if (countBefore === undefined) {
        throw new Error('splitRecurrence needs countBefore when an RRULE has COUNT');
      }
      const remaining = parsedCount - countBefore;
      if (remaining < 1) {
        throw new Error(`COUNT ${parsedCount} leaves no occurrences after ${countBefore} before the split`);
      }
      newRecurrence.push(
        serializeRule(rules.map((r) => (r.key === 'COUNT' ? { key: 'COUNT', value: String(remaining) } : r)))
      );
    } else if (name === 'EXDATE' || name === 'RDATE') {
      const { head, tzid, values } = parseDateLine(line);
      const before: string[] = [];
      const after: string[] = [];
      for (const value of values) {
        // PERIOD values are "start/end"; only the start decides the side.
        const ms = parseIcalDate(value.split('/')[0], tzid);
        (ms < splitMs ? before : after).push(value);
      }
      if (before.length > 0) oldRecurrence.push(`${head}:${before.join(',')}`);
      if (after.length > 0) newRecurrence.push(`${head}:${after.join(',')}`);
    } else {
      oldRecurrence.push(line);
      newRecurrence.push(line);
    }
  }

  return { oldRecurrence, newRecurrence };
}
