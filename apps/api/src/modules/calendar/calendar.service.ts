import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, CalendarEntry, CalendarEntryKind } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INVOICE_INCLUDE, MONEY_TOLERANCE, toInvoiceView } from '../invoices/invoices.service';
import { addDays, daysBetween, fromDay, isRealDay, toDay, todayIn } from './days';

const longDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function assertDays(...days: (string | undefined)[]) {
  for (const d of days) if (d !== undefined && !isRealDay(d)) throw new BadRequestException(`${d} is not a real date.`);
}
import { CalendarEntryDto } from './dto/calendar.dto';
import { buildIcs } from './ics';

export type CalendarItemType = 'BOOKING' | 'CONTRACT' | 'INVOICE_DUE' | 'QUOTE_EXPIRY' | 'PAYMENT' | 'ENTRY';

export interface CalendarItem {
  /** Unique across types, e.g. "BOOKING:<id>". */
  id: string;
  type: CalendarItemType;
  sourceId: string;
  date: string;
  /** Inclusive last day; equals `date` for single-day items. */
  endDate: string;
  title: string;
  detail: string | null;
  status: string | null;
  artistId: string | null;
  artistName: string | null;
  /** Dashboard page that holds the source record; null for the user's own entries. */
  link: string | null;
  overdue: boolean;
  entryKind: CalendarEntryKind | null;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  /** Why this item clashes with another on the same day, if it does. */
  conflict: string | null;
}

const MAX_RANGE_DAYS = 100;
const MAX_MOVES = 50;

export interface MoveRequest {
  type: 'ENTRY' | 'BOOKING';
  id: string;
  /** New day for a booking; new first day for an entry (it keeps its length). */
  toDate: string;
}
const FEED_PAST_DAYS = 90;
const FEED_FUTURE_DAYS = 400;
const invNo = (n: number) => `INV-${String(n).padStart(4, '0')}`;
const quoteNo = (n: number) => `Q-${String(n).padStart(4, '0')}`;
const conNo = (n: number) => `CON-${String(n).padStart(4, '0')}`;

const STATUS_LABELS: Partial<Record<BookingStatus, string>> = {
  NEW_ENQUIRY: 'New enquiry',
  QUALIFIED: 'Qualified',
  QUOTE_SENT: 'Quote sent',
  NEGOTIATION: 'Negotiation',
  CONTRACT_SENT: 'Contract sent',
  DEPOSIT_PAID: 'Deposit paid',
  CONFIRMED: 'Confirmed',
  EVENT: 'Event',
  COMPLETED: 'Completed',
  PAYMENT_RECEIVED: 'Paid',
};

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function blank(partial: Pick<CalendarItem, 'type' | 'sourceId' | 'date' | 'title'> & Partial<CalendarItem>): CalendarItem {
  return {
    id: `${partial.type}:${partial.sourceId}`,
    endDate: partial.date,
    detail: null,
    status: null,
    artistId: null,
    artistName: null,
    link: null,
    overdue: false,
    entryKind: null,
    startTime: null,
    endTime: null,
    notes: null,
    conflict: null,
    ...partial,
  };
}

/**
 * Flags double-bookings: an artist with two bookings on one day, or a booking
 * on a blocked day. Bookings with no artist are treated as the business's own
 * (a solo artist rarely picks one), so two of those on a day also clash. A
 * blocked entry with no artist blocks everyone. Warnings only; nothing is prevented.
 */
export function markConflicts(items: CalendarItem[]): void {
  const bookings = items.filter((i) => i.type === 'BOOKING');
  const blocks = items.filter((i) => i.type === 'ENTRY' && i.entryKind === 'BLOCKED');
  const sameKey = (a: string | null, b: string | null) => a === b;

  for (const booking of bookings) {
    const other = bookings.find((b) => b !== booking && b.date === booking.date && sameKey(b.artistId, booking.artistId));
    const block = blocks.find((e) => booking.date >= e.date && booking.date <= e.endDate && (e.artistId === null || e.artistId === booking.artistId));
    if (other) booking.conflict = `Also booked this day: ${other.title}`;
    else if (block) booking.conflict = `Blocked day: ${block.title}`;
  }
  for (const block of blocks) {
    const hit = bookings.find((b) => b.date >= block.date && b.date <= block.endDate && (block.artistId === null || block.artistId === b.artistId));
    if (hit) block.conflict = `Booking on a blocked day: ${hit.title}`;
  }
}

@Injectable()
export class CalendarService {
  private readonly timeZone: string;
  private readonly webBaseUrl: string;
  private readonly apiPublicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('REMINDERS_TZ') ?? 'Africa/Harare';
    this.webBaseUrl = (config.get<string>('WEB_BASE_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
    this.apiPublicUrl = (config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000').replace(/\/$/, '');
  }

  /** Everything on the calendar between two days (inclusive), with clashes flagged. */
  async items(organizationId: string, from: string, to: string, artistId?: string, now = new Date()): Promise<CalendarItem[]> {
    assertDays(from, to);
    if (to < from) throw new BadRequestException('"to" must be on or after "from".');
    if (daysBetween(from, to) > MAX_RANGE_DAYS) throw new BadRequestException(`A calendar range can span at most ${MAX_RANGE_DAYS} days.`);
    return this.collect(organizationId, from, to, artistId, now);
  }

  private async collect(organizationId: string, from: string, to: string, artistId: string | undefined, now: Date): Promise<CalendarItem[]> {
    const start = fromDay(from);
    const endExclusive = fromDay(addDays(to, 1));
    const inRange = { gte: start, lt: endExclusive };
    const byArtist = artistId ? { artistId } : {};
    const today = todayIn(this.timeZone, now);

    const [artists, bookings, contracts, invoices, quotes, payments, entries] = await Promise.all([
      this.prisma.artist.findMany({ where: { organizationId }, select: { id: true, name: true } }),
      this.prisma.booking.findMany({ where: { organizationId, ...byArtist, eventDate: inRange } }),
      this.prisma.contract.findMany({ where: { organizationId, ...byArtist, eventDate: inRange, status: { not: 'CANCELLED' } } }),
      this.prisma.invoice.findMany({ where: { organizationId, ...byArtist, dueDate: inRange, status: { in: ['SENT', 'PARTIALLY_PAID'] } }, include: INVOICE_INCLUDE }),
      this.prisma.quote.findMany({ where: { organizationId, ...byArtist, validUntil: inRange, status: 'SENT' } }),
      this.prisma.invoicePayment.findMany({
        where: { voidedAt: null, paidAt: inRange, invoice: { organizationId, ...byArtist } },
        include: { invoice: { select: { number: true, clientName: true, currency: true, artistId: true } } },
      }),
      this.prisma.calendarEntry.findMany({
        // Overlapping the range, not just starting in it. With an artist filter, org-wide entries still show.
        where: { organizationId, startDate: { lt: endExclusive }, endDate: { gte: start }, ...(artistId && { OR: [{ artistId }, { artistId: null }] }) },
      }),
    ]);
    const nameOf = (id: string | null) => (id ? (artists.find((a) => a.id === id)?.name ?? null) : null);

    const items: CalendarItem[] = [];
    const bookingDays = new Map<string, string>();
    for (const b of bookings) {
      const date = toDay(b.eventDate!);
      bookingDays.set(b.id, date);
      items.push(
        blank({
          type: 'BOOKING',
          sourceId: b.id,
          date,
          title: `${b.eventType || 'Booking'}: ${b.clientName}`,
          detail: [b.venue, b.fee ? money(Number(b.fee), b.currency) : null].filter(Boolean).join(' · ') || null,
          status: STATUS_LABELS[b.status] ?? b.status,
          artistId: b.artistId,
          artistName: nameOf(b.artistId),
          link: '/bookings',
        }),
      );
    }
    for (const c of contracts) {
      const date = toDay(c.eventDate!);
      // A contract for a booking already on that day would only repeat it.
      if (c.bookingId && bookingDays.get(c.bookingId) === date) continue;
      items.push(
        blank({
          type: 'CONTRACT',
          sourceId: c.id,
          date,
          title: `${c.title}: ${c.clientName}`,
          detail: [conNo(c.number), c.venue].filter(Boolean).join(' · '),
          status: c.status === 'SIGNED' ? 'Signed' : c.status === 'SENT' ? 'Awaiting signature' : 'Draft',
          artistId: c.artistId,
          artistName: nameOf(c.artistId),
          link: '/contracts',
        }),
      );
    }
    for (const inv of invoices) {
      const { balance } = toInvoiceView(inv, now);
      if (balance <= MONEY_TOLERANCE) continue;
      const date = toDay(inv.dueDate!);
      items.push(
        blank({
          type: 'INVOICE_DUE',
          sourceId: inv.id,
          date,
          title: `${invNo(inv.number)} due: ${inv.clientName}`,
          detail: `${money(balance, inv.currency)} outstanding`,
          status: date < today ? 'Overdue' : 'Due',
          overdue: date < today,
          artistId: inv.artistId,
          artistName: nameOf(inv.artistId),
          link: '/invoices',
        }),
      );
    }
    for (const q of quotes) {
      items.push(
        blank({
          type: 'QUOTE_EXPIRY',
          sourceId: q.id,
          date: toDay(q.validUntil!),
          title: `${quoteNo(q.number)} expires: ${q.clientName}`,
          detail: q.title,
          status: 'Awaiting reply',
          artistId: q.artistId,
          artistName: nameOf(q.artistId),
          link: '/quotes',
        }),
      );
    }
    for (const p of payments) {
      items.push(
        blank({
          type: 'PAYMENT',
          sourceId: p.id,
          date: toDay(p.paidAt),
          title: `Paid ${money(Number(p.amount), p.invoice.currency)}: ${p.invoice.clientName}`,
          detail: [invNo(p.invoice.number), p.method].filter(Boolean).join(' · '),
          artistId: p.invoice.artistId,
          artistName: nameOf(p.invoice.artistId),
          link: '/invoices',
        }),
      );
    }
    for (const e of entries) items.push(this.entryItem(e, nameOf(e.artistId)));

    markConflicts(items);
    return items.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
  }

  private entryItem(e: CalendarEntry, artistName: string | null): CalendarItem {
    return blank({
      type: 'ENTRY',
      sourceId: e.id,
      date: toDay(e.startDate),
      endDate: toDay(e.endDate),
      title: e.title,
      detail: e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : null,
      artistId: e.artistId,
      artistName,
      entryKind: e.kind,
      startTime: e.startTime,
      endTime: e.endTime,
      notes: e.notes,
    });
  }

  /** What an artist already has on a given day, for the warning in the booking form. */
  async conflictsOn(organizationId: string, date: string, artistId?: string, excludeBookingId?: string) {
    assertDays(date);
    const day = fromDay(date);
    const [bookings, blocks] = await Promise.all([
      this.prisma.booking.findMany({
        where: { organizationId, eventDate: day, artistId: artistId ?? null, ...(excludeBookingId && { id: { not: excludeBookingId } }) },
        select: { id: true, clientName: true, eventType: true },
      }),
      this.prisma.calendarEntry.findMany({
        where: { organizationId, kind: 'BLOCKED', startDate: { lte: day }, endDate: { gte: day }, OR: [{ artistId: null }, ...(artistId ? [{ artistId }] : [])] },
        select: { id: true, title: true },
      }),
    ]);
    return [
      ...bookings.map((b) => ({ type: 'BOOKING' as const, id: b.id, title: `${b.eventType || 'Booking'}: ${b.clientName}` })),
      ...blocks.map((e) => ({ type: 'BLOCKED' as const, id: e.id, title: e.title })),
    ];
  }

  // ─────────────────────────── Own entries ───────────────────────────

  private async validArtist(organizationId: string, artistId?: string | null) {
    if (!artistId) return null;
    const artist = await this.prisma.artist.findFirst({ where: { id: artistId, organizationId }, select: { id: true } });
    if (!artist) throw new NotFoundException('Artist not found.');
    return artist.id;
  }

  private entryData(dto: CalendarEntryDto) {
    assertDays(dto.startDate, dto.endDate);
    const endDate = dto.endDate ?? dto.startDate;
    if (endDate < dto.startDate) throw new BadRequestException('The end date must be on or after the start date.');
    if (daysBetween(dto.startDate, endDate) > 366) throw new BadRequestException('An entry can span at most a year.');
    if (dto.startTime && dto.endTime && endDate === dto.startDate && dto.endTime < dto.startTime) {
      throw new BadRequestException('The end time must be after the start time.');
    }
    return {
      title: dto.title.trim(),
      kind: dto.kind,
      startDate: fromDay(dto.startDate),
      endDate: fromDay(endDate),
      startTime: dto.startTime || null,
      endTime: dto.startTime ? dto.endTime || null : null,
      notes: dto.notes?.trim() || null,
    };
  }

  async createEntry(organizationId: string, userId: string, dto: CalendarEntryDto) {
    const artistId = await this.validArtist(organizationId, dto.artistId);
    const entry = await this.prisma.calendarEntry.create({ data: { organizationId, createdById: userId, artistId, ...this.entryData(dto) } });
    return this.entryItem(entry, null);
  }

  async updateEntry(organizationId: string, id: string, dto: CalendarEntryDto) {
    const existing = await this.prisma.calendarEntry.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Calendar entry not found.');
    const artistId = await this.validArtist(organizationId, dto.artistId);
    const entry = await this.prisma.calendarEntry.update({ where: { id }, data: { artistId, ...this.entryData(dto) } });
    return this.entryItem(entry, null);
  }

  /** Shifts an entry so it starts on `startDate`, keeping its length. */
  async moveEntry(organizationId: string, id: string, startDate: string) {
    assertDays(startDate);
    const existing = await this.prisma.calendarEntry.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Calendar entry not found.');
    const span = daysBetween(toDay(existing.startDate), toDay(existing.endDate));
    const entry = await this.prisma.calendarEntry.update({
      where: { id },
      data: { startDate: fromDay(startDate), endDate: fromDay(addDays(startDate, span)) },
    });
    return this.entryItem(entry, null);
  }

  /** Single-booking form of previewMoves (kept for the API; the UI uses the batch form). */
  async movePreview(organizationId: string, bookingId: string, date: string, now = new Date()) {
    const { bookings } = await this.previewMoves(organizationId, [{ type: 'BOOKING', id: bookingId, toDate: date }], now);
    const { id: _id, ...preview } = bookings[0];
    return preview;
  }

  private assertMoves(moves: MoveRequest[]) {
    if (moves.length === 0) throw new BadRequestException('Nothing to move.');
    if (moves.length > MAX_MOVES) throw new BadRequestException(`You can move at most ${MAX_MOVES} items at once.`);
    assertDays(...moves.map((m) => m.toDate));
    const keys = new Set(moves.map((m) => `${m.type}:${m.id}`));
    if (keys.size !== moves.length) throw new BadRequestException('The same item appears twice.');
  }

  /**
   * What a (group) move would mean, for the confirm step. For each booking:
   * clashes on its new day and linked documents that keep the old date (a
   * contract's agreed text never changes). Clashes account for the whole
   * group: items that are moving away don't count, and two moving bookings
   * landing on the same day for the same artist do.
   */
  async previewMoves(organizationId: string, moves: MoveRequest[], now = new Date()) {
    this.assertMoves(moves);
    const bookingMoves = moves.filter((m) => m.type === 'BOOKING');
    const entryMoves = moves.filter((m) => m.type === 'ENTRY');
    const [bookings, entries] = await Promise.all([
      this.prisma.booking.findMany({
        where: { id: { in: bookingMoves.map((m) => m.id) }, organizationId },
        include: {
          quotes: { where: { status: { not: 'DECLINED' } }, select: { number: true, status: true } },
          contracts: { where: { status: { not: 'CANCELLED' } }, select: { number: true, status: true, eventDate: true } },
          invoices: { where: { status: { not: 'VOID' } }, select: { number: true, status: true } },
        },
      }),
      this.prisma.calendarEntry.findMany({ where: { id: { in: entryMoves.map((m) => m.id) }, organizationId } }),
    ]);
    if (bookings.length !== bookingMoves.length) throw new NotFoundException('Booking not found.');
    if (entries.length !== entryMoves.length) throw new NotFoundException('Calendar entry not found.');

    const movingBookingIds = bookings.map((b) => b.id);
    const movingEntryIds = entries.map((e) => e.id);
    // Where the moving blocked entries will be after the move.
    const movedBlocks = entries
      .filter((e) => e.kind === 'BLOCKED')
      .map((e) => {
        const start = entryMoves.find((m) => m.id === e.id)!.toDate;
        return { title: e.title, artistId: e.artistId, start, end: addDays(start, daysBetween(toDay(e.startDate), toDay(e.endDate))) };
      });
    const today = todayIn(this.timeZone, now);
    const titleOf = (b: { eventType: string | null; clientName: string }) => `${b.eventType || 'Booking'}: ${b.clientName}`;

    const previews = await Promise.all(
      bookingMoves.map(async (move) => {
        const booking = bookings.find((b) => b.id === move.id)!;
        const date = move.toDate;
        const day = fromDay(date);
        const [others, blocks] = await Promise.all([
          this.prisma.booking.findMany({
            where: { organizationId, eventDate: day, artistId: booking.artistId, id: { notIn: movingBookingIds } },
            select: { id: true, clientName: true, eventType: true },
          }),
          this.prisma.calendarEntry.findMany({
            where: {
              organizationId,
              kind: 'BLOCKED',
              startDate: { lte: day },
              endDate: { gte: day },
              id: { notIn: movingEntryIds },
              OR: [{ artistId: null }, ...(booking.artistId ? [{ artistId: booking.artistId }] : [])],
            },
            select: { id: true, title: true },
          }),
        ]);
        const movingTogether = bookingMoves
          .filter((m) => m.id !== booking.id && m.toDate === date)
          .map((m) => bookings.find((b) => b.id === m.id)!)
          .filter((b) => b.artistId === booking.artistId);
        const blockedByMove = movedBlocks.filter((e) => e.start <= date && date <= e.end && (e.artistId === null || e.artistId === booking.artistId));
        const linked = [
          ...booking.contracts
            .filter((c) => !c.eventDate || toDay(c.eventDate) !== date)
            .map((c) => ({
              type: 'CONTRACT' as const,
              label: conNo(c.number),
              note: `${c.status === 'SIGNED' ? 'Signed' : c.status === 'SENT' ? 'Sent' : 'Draft'} agreement${c.eventDate ? ` for ${longDay(c.eventDate)}` : ''}: its text won't change`,
            })),
          ...booking.quotes.map((q) => ({ type: 'QUOTE' as const, label: quoteNo(q.number), note: `Quote (${q.status.toLowerCase()})` })),
          ...booking.invoices.map((i) => ({ type: 'INVOICE' as const, label: invNo(i.number), note: `Invoice (${i.status.toLowerCase().replace('_', ' ')})` })),
        ];
        return {
          id: booking.id,
          title: titleOf(booking),
          from: booking.eventDate ? toDay(booking.eventDate) : null,
          to: date,
          inPast: date < today,
          clashes: [
            ...others.map((b) => ({ type: 'BOOKING' as const, id: b.id, title: titleOf(b) })),
            ...movingTogether.map((b) => ({ type: 'BOOKING' as const, id: b.id, title: `${titleOf(b)} (also moving)` })),
            ...blocks.map((e) => ({ type: 'BLOCKED' as const, id: e.id, title: e.title })),
            ...blockedByMove.map((e) => ({ type: 'BLOCKED' as const, id: `moving:${e.title}`, title: `${e.title} (also moving)` })),
          ],
          linked,
        };
      }),
    );
    return { bookings: previews, entryCount: entries.length };
  }

  /**
   * Applies a (group) move in one transaction: every item moves or none do.
   * Returns the exact moves that would put everything back, for Undo.
   */
  async applyMoves(organizationId: string, moves: MoveRequest[]) {
    this.assertMoves(moves);
    return this.prisma.$transaction(async (tx) => {
      const ids = (type: MoveRequest['type']) => moves.filter((m) => m.type === type).map((m) => m.id);
      const [entries, bookings] = await Promise.all([
        tx.calendarEntry.findMany({ where: { id: { in: ids('ENTRY') }, organizationId } }),
        tx.booking.findMany({ where: { id: { in: ids('BOOKING') }, organizationId }, select: { id: true, eventDate: true } }),
      ]);
      if (entries.length !== ids('ENTRY').length) throw new NotFoundException('Calendar entry not found.');
      if (bookings.length !== ids('BOOKING').length) throw new NotFoundException('Booking not found.');

      const undo: MoveRequest[] = [];
      for (const move of moves) {
        if (move.type === 'ENTRY') {
          const entry = entries.find((e) => e.id === move.id)!;
          const span = daysBetween(toDay(entry.startDate), toDay(entry.endDate));
          await tx.calendarEntry.update({ where: { id: entry.id }, data: { startDate: fromDay(move.toDate), endDate: fromDay(addDays(move.toDate, span)) } });
          undo.push({ type: 'ENTRY', id: entry.id, toDate: toDay(entry.startDate) });
        } else {
          const booking = bookings.find((b) => b.id === move.id)!;
          if (!booking.eventDate) throw new BadRequestException('A booking without a date cannot be moved from the calendar.');
          await tx.booking.update({ where: { id: booking.id }, data: { eventDate: fromDay(move.toDate) } });
          undo.push({ type: 'BOOKING', id: booking.id, toDate: toDay(booking.eventDate) });
        }
      }
      return { moved: moves.length, undo };
    });
  }

  async removeEntry(organizationId: string, id: string) {
    const existing = await this.prisma.calendarEntry.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Calendar entry not found.');
    await this.prisma.calendarEntry.delete({ where: { id } });
    return { deleted: true };
  }

  // ─────────────────────────── iCal feed ───────────────────────────

  private feedUrl(token: string) {
    return `${this.apiPublicUrl}/public/calendar/${token}.ics`;
  }

  /** The user's private subscription URL, created on first request. */
  async feedLink(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { calendarFeedToken: true } });
    const token = user.calendarFeedToken ?? (await this.rotate(userId));
    return { url: this.feedUrl(token) };
  }

  /** Issues a new URL; the old one stops working immediately. */
  async resetFeed(userId: string) {
    return { url: this.feedUrl(await this.rotate(userId)) };
  }

  private async rotate(userId: string) {
    const token = randomBytes(24).toString('base64url');
    await this.prisma.user.update({ where: { id: userId }, data: { calendarFeedToken: token } });
    return token;
  }

  /** The .ics body for a feed token, or null if the token is unknown (revoked or never issued). */
  async feed(token: string, now = new Date()): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { calendarFeedToken: token },
      select: { organizationId: true, organization: { select: { name: true } } },
    });
    if (!user) return null;
    const today = todayIn(this.timeZone, now);
    const items = await this.collect(user.organizationId, addDays(today, -FEED_PAST_DAYS), addDays(today, FEED_FUTURE_DAYS), undefined, now);
    return buildIcs(
      `${user.organization.name} (ArtBH)`,
      items.map((i) => ({
        uid: `${i.type.toLowerCase()}-${i.sourceId}@artbh`,
        start: i.date,
        end: i.endDate,
        summary: `${i.type === 'CONTRACT' ? 'Contract event: ' : ''}${i.title}${i.artistName ? ` [${i.artistName}]` : ''}${i.conflict ? ' ⚠ clash' : ''}`,
        description: [i.status, i.detail, i.notes, i.conflict].filter(Boolean).join('\n') || undefined,
        url: i.link ? `${this.webBaseUrl}${i.link}` : `${this.webBaseUrl}/calendar?date=${i.date}`,
      })),
      now,
    );
  }
}
