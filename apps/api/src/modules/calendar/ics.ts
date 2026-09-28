import { addDays } from './days';

/** A whole-day event for an iCalendar feed. `end` is the last day, inclusive. */
export interface IcsEvent {
  uid: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD, inclusive
  summary: string;
  description?: string;
  url?: string;
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 line folding: lines longer than 75 octets continue on the next line
 * after a single space. Splits on UTF-8 octets without breaking a character.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    // The first line may hold 75 octets; continuation lines 74 (their leading space is the 75th).
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDay = (day: string) => day.replace(/-/g, '');

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildIcs(calendarName: string, events: IcsEvent[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ArtBH//Creative Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // Ask subscribing apps to refresh hourly (many poll less often regardless).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compactDay(e.start)}`,
      // All-day DTEND is exclusive: the day after the last day.
      `DTEND;VALUE=DATE:${compactDay(addDays(e.end, 1))}`,
      `SUMMARY:${escapeText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
