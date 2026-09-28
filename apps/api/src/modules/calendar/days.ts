/**
 * Calendar days as plain "YYYY-MM-DD" strings. Booking and due dates are
 * stored at UTC midnight, so reading and writing them in UTC keeps a date the
 * same calendar day everywhere, with no timezone off-by-one.
 */

const DAY_MS = 86_400_000;
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True for a real calendar day ("2026-02-30" matches the pattern but isn't one). */
export function isRealDay(day: string): boolean {
  if (!DAY_PATTERN.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

export function fromDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  return toDay(new Date(fromDay(day).getTime() + n * DAY_MS));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((fromDay(to).getTime() - fromDay(from).getTime()) / DAY_MS);
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Today's calendar date in an IANA timezone, e.g. Africa/Harare. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
