/**
 * Time Parser
 * Extracts and formats time from Google Calendar DOM elements
 */

/**
 * Extract start time from Google Calendar time strings. Formats seen:
 *   - 24h:                     "17:30 – 21:00"
 *   - 12h, meridiem on both:   "5:30 PM – 9:00 PM", "9am – 12pm" (":00" omitted)
 *   - 12h, meridiem on end:    "1 – 4:45pm", "1:30 – 4:45pm" (Google drops the
 *     start's meridiem when it matches the end's)
 * The text is 12h if either side has a meridiem; a bare start inherits the end's.
 *
 * FRAGILE: Parses Google Calendar DOM strings. Breaking changes if Google updates rendering.
 */
export function extractStartTime(timeText: string): { match: string; hours: number; minutes: number; is12h: boolean } | null {
  const m = timeText.match(/^((\d{1,2})(?::(\d{2}))?(?:\s*(AM|PM))?)\s*–(?:\s*\d{1,2}(?::\d{2})?\s*(AM|PM))?/i);
  if (!m) return null;

  const [, match, h, mm, startAmpm, endAmpm] = m;
  // A bare hour with no meridiem anywhere ("9 – 10") isn't a format Google renders
  if (mm === undefined && !startAmpm && !endAmpm) return null;

  let hours = parseInt(h, 10);
  const minutes = mm === undefined ? 0 : parseInt(mm, 10);
  const ampm = (startAmpm ?? endAmpm)?.toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return { match, hours, minutes, is12h: ampm !== undefined };
}

/**
 * Calculate new time with delta in minutes
 */
export function addMinutes(hours: number, minutes: number, delta: number): { hours: number; minutes: number } {
  const totalMinutes = hours * 60 + minutes + delta;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return { hours: newHours, minutes: newMinutes };
}

/**
 * Format time matching original format (12h or 24h)
 */
export function formatTimeAs(hours: number, minutes: number, is12h: boolean): string {
  if (is12h) {
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  } else {
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  }
}
