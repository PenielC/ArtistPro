import { api } from './api'

export type CalendarItemType = 'BOOKING' | 'CONTRACT' | 'INVOICE_DUE' | 'QUOTE_EXPIRY' | 'PAYMENT' | 'ENTRY'
export type EntryKind = 'REHEARSAL' | 'STUDIO' | 'TRAVEL' | 'RELEASE' | 'MEETING' | 'BLOCKED' | 'OTHER'

export interface CalendarItem {
  id: string
  type: CalendarItemType
  sourceId: string
  date: string
  endDate: string
  title: string
  detail: string | null
  status: string | null
  artistId: string | null
  artistName: string | null
  link: string | null
  overdue: boolean
  entryKind: EntryKind | null
  startTime: string | null
  endTime: string | null
  notes: string | null
  conflict: string | null
}

export interface EntryInput {
  title: string
  kind: EntryKind
  artistId?: string | null
  startDate: string
  endDate?: string
  startTime?: string | null
  endTime?: string | null
  notes?: string | null
}

export const ENTRY_KINDS: { value: EntryKind; label: string }[] = [
  { value: 'REHEARSAL', label: 'Rehearsal' },
  { value: 'STUDIO', label: 'Studio' },
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'RELEASE', label: 'Release' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'BLOCKED', label: 'Unavailable (blocked)' },
  { value: 'OTHER', label: 'Other' },
]

/** Filter groups shown as toggles, and which item types each covers. */
export const CALENDAR_GROUPS = [
  { id: 'events', label: 'Bookings & events', types: ['BOOKING', 'CONTRACT'] },
  { id: 'deadlines', label: 'Deadlines', types: ['INVOICE_DUE', 'QUOTE_EXPIRY'] },
  { id: 'payments', label: 'Payments', types: ['PAYMENT'] },
  { id: 'entries', label: 'My entries', types: ['ENTRY'] },
] as const satisfies readonly { id: string; label: string; types: readonly CalendarItemType[] }[]

export type CalendarGroupId = (typeof CALENDAR_GROUPS)[number]['id']

// ── Days as "YYYY-MM-DD", built from local date parts (never toISOString on a local date) ──

const pad = (n: number) => String(n).padStart(2, '0')

export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function shiftDay(day: string, n: number): string {
  const date = parseDay(day)
  date.setDate(date.getDate() + n)
  return dayOf(date)
}

export function todayDay(): string {
  return dayOf(new Date())
}

/** The Monday-first 6-week grid (42 days) that shows the month containing `day`. */
export function monthGrid(day: string): { month: string; days: string[] } {
  const first = parseDay(day)
  first.setDate(1)
  const offset = (first.getDay() + 6) % 7 // Monday = 0
  const start = shiftDay(dayOf(first), -offset)
  return { month: dayOf(first).slice(0, 7), days: Array.from({ length: 42 }, (_, i) => shiftDay(start, i)) }
}

export function formatDay(day: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  return parseDay(day).toLocaleDateString(undefined, options)
}

/** Does an item appear on this day (multi-day entries cover every day in their span)? */
export function covers(item: CalendarItem, day: string): boolean {
  return item.date <= day && day <= item.endDate
}

// ── API ──

export async function getCalendar(from: string, to: string, artistId?: string): Promise<CalendarItem[]> {
  return (await api.get<CalendarItem[]>('/calendar', { params: { from, to, ...(artistId && { artistId }) } })).data
}

export async function getConflicts(date: string, artistId?: string, excludeBookingId?: string): Promise<{ type: 'BOOKING' | 'BLOCKED'; id: string; title: string }[]> {
  return (await api.get('/calendar/conflicts', { params: { date, ...(artistId && { artistId }), ...(excludeBookingId && { excludeBookingId }) } })).data
}

export async function createEntry(input: EntryInput): Promise<CalendarItem> {
  return (await api.post<CalendarItem>('/calendar/entries', input)).data
}

export async function updateEntry(id: string, input: EntryInput): Promise<CalendarItem> {
  return (await api.patch<CalendarItem>(`/calendar/entries/${id}`, input)).data
}

export async function deleteEntry(id: string): Promise<void> {
  await api.delete(`/calendar/entries/${id}`)
}

export async function getFeedLink(): Promise<{ url: string }> {
  return (await api.get<{ url: string }>('/calendar/feed')).data
}

export async function resetFeedLink(): Promise<{ url: string }> {
  return (await api.post<{ url: string }>('/calendar/feed/reset')).data
}

// ── Drag to reschedule ──

/** Only the user's own entries and bookings can be moved; everything else is a fixed fact or a sent document. */
export const isMovable = (item: CalendarItem) => item.type === 'ENTRY' || item.type === 'BOOKING'

/** One item's move: a booking's new day, or an entry's new first day (it keeps its length). */
export interface MoveRequest {
  type: 'ENTRY' | 'BOOKING'
  id: string
  toDate: string
}

export interface BookingMovePreview {
  id: string
  title: string
  from: string | null
  to: string
  inPast: boolean
  clashes: { type: 'BOOKING' | 'BLOCKED'; id: string; title: string }[]
  linked: { type: 'CONTRACT' | 'QUOTE' | 'INVOICE'; label: string; note: string }[]
}

/** The moves that shift `items` by `delta` days (multi-day entries move by their first day). */
export function movesFor(items: CalendarItem[], delta: number): MoveRequest[] {
  return items.map((i) => ({ type: i.type as 'ENTRY' | 'BOOKING', id: i.sourceId, toDate: shiftDay(i.date, delta) }))
}

export async function previewMoves(moves: MoveRequest[]): Promise<{ bookings: BookingMovePreview[]; entryCount: number }> {
  return (await api.post('/calendar/moves/preview', { moves })).data
}

/** Moves everything or nothing; returns the moves that undo it. */
export async function applyMoves(moves: MoveRequest[]): Promise<{ moved: number; undo: MoveRequest[] }> {
  return (await api.post('/calendar/moves', { moves })).data
}

/** Whole days from one "YYYY-MM-DD" to another (local calendar, DST-safe). */
export function dayDiff(from: string, to: string): number {
  const a = parseDay(from)
  const b = parseDay(to)
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000)
}
