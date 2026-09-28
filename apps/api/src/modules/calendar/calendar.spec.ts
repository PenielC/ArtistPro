import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CalendarService, markConflicts, type CalendarItem } from './calendar.service';
import { addDays, daysBetween, eachDay, isRealDay, todayIn } from './days';
import { buildIcs, escapeText, foldLine } from './ics';

type ModelMock = Record<string, jest.Mock>;
const config = { get: (k: string) => ({ REMINDERS_TZ: 'Africa/Harare', WEB_BASE_URL: 'https://app.example.com', API_PUBLIC_URL: 'https://api.example.com' })[k] } as unknown as ConfigService;
const D = (day: string) => new Date(`${day}T00:00:00Z`);

describe('days', () => {
  it('does calendar arithmetic in UTC, across months and leap days', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-09-01', '2026-10-01')).toBe(30);
    expect(eachDay('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('tells real days from impossible ones', () => {
    expect(['2026-02-28', '2028-02-29', '2026-12-31'].map(isRealDay)).toEqual([true, true, true]);
    expect(['2026-02-29', '2026-02-30', '2026-13-01', '2026-04-31', '26-1-1', 'soon'].map(isRealDay)).toEqual([false, false, false, false, false, false]);
  });

  it('knows "today" in the business timezone', () => {
    expect(todayIn('Africa/Harare', new Date('2026-09-30T22:30:00Z'))).toBe('2026-10-01');
    expect(todayIn('UTC', new Date('2026-09-30T22:30:00Z'))).toBe('2026-09-30');
  });
});

describe('iCalendar output', () => {
  it('escapes text per RFC 5545', () => {
    expect(escapeText('Wedding; Meikles, Harare\nBack\\slash')).toBe('Wedding\\; Meikles\\, Harare\\nBack\\\\slash');
  });

  it('folds long lines at 75 octets without splitting a multi-byte character', () => {
    const ascii = foldLine(`SUMMARY:${'x'.repeat(200)}`);
    for (const line of ascii.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(ascii.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(ascii.replace(/\r\n /g, '')).toBe(`SUMMARY:${'x'.repeat(200)}`);

    const unicode = `SUMMARY:${'é'.repeat(60)}✓`;
    const folded = foldLine(unicode);
    for (const line of folded.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(unicode);
  });

  it('writes all-day events with an exclusive end date and CRLF line endings', () => {
    const ics = buildIcs('Moyo Management', [
      { uid: 'booking-1@x', start: '2026-12-05', end: '2026-12-05', summary: 'Wedding: Tariro', description: 'Confirmed\nMeikles' },
      { uid: 'entry-2@x', start: '2026-12-30', end: '2027-01-02', summary: 'Holiday' },
    ], new Date('2026-09-28T10:00:00Z'));

    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261205\r\nDTEND;VALUE=DATE:20261206');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261230\r\nDTEND;VALUE=DATE:20270103');
    expect(ics).toContain('DTSTAMP:20260928T100000Z');
    expect(ics).toContain('DESCRIPTION:Confirmed\\nMeikles');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe('markConflicts', () => {
  const item = (o: Partial<CalendarItem> & Pick<CalendarItem, 'type' | 'date'>): CalendarItem => ({
    id: Math.random().toString(), sourceId: 'x', endDate: o.date, title: 't', detail: null, status: null, artistId: null, artistName: null,
    link: null, overdue: false, entryKind: null, startTime: null, endTime: null, notes: null, conflict: null, ...o,
  });

  it('flags the same artist booked twice on one day, but not different artists', () => {
    const a1 = item({ type: 'BOOKING', date: '2026-12-05', artistId: 'a', title: 'Wedding' });
    const a2 = item({ type: 'BOOKING', date: '2026-12-05', artistId: 'a', title: 'Gala' });
    const b = item({ type: 'BOOKING', date: '2026-12-05', artistId: 'b' });
    const aOtherDay = item({ type: 'BOOKING', date: '2026-12-06', artistId: 'a' });
    markConflicts([a1, a2, b, aOtherDay]);
    expect(a1.conflict).toBe('Also booked this day: Gala');
    expect(a2.conflict).toBe('Also booked this day: Wedding');
    expect(b.conflict).toBeNull();
    expect(aOtherDay.conflict).toBeNull();
  });

  it('treats bookings with no artist as the business\'s own', () => {
    const x = item({ type: 'BOOKING', date: '2026-12-05' });
    const y = item({ type: 'BOOKING', date: '2026-12-05' });
    markConflicts([x, y]);
    expect(x.conflict).toMatch(/Also booked/);
  });

  it('a blocked day clashes with bookings on any day it covers; an org-wide block covers every artist', () => {
    const trip = item({ type: 'ENTRY', entryKind: 'BLOCKED', date: '2026-12-04', endDate: '2026-12-06', artistId: 'a', title: 'Tour in SA' });
    const onTrip = item({ type: 'BOOKING', date: '2026-12-05', artistId: 'a', title: 'Wedding' });
    const otherArtist = item({ type: 'BOOKING', date: '2026-12-05', artistId: 'b' });
    const closed = item({ type: 'ENTRY', entryKind: 'BLOCKED', date: '2026-12-25', title: 'Office closed' });
    const xmas = item({ type: 'BOOKING', date: '2026-12-25', artistId: 'b', title: 'Christmas party' });
    const rehearsal = item({ type: 'ENTRY', entryKind: 'REHEARSAL', date: '2026-12-05', artistId: 'b' });
    markConflicts([trip, onTrip, otherArtist, closed, xmas, rehearsal]);
    expect(onTrip.conflict).toBe('Blocked day: Tour in SA');
    expect(trip.conflict).toBe('Booking on a blocked day: Wedding');
    expect(otherArtist.conflict).toBeNull();
    expect(xmas.conflict).toBe('Blocked day: Office closed');
    expect(rehearsal.conflict).toBeNull();
  });
});

describe('CalendarService', () => {
  let prisma: Record<string, ModelMock>;
  let service: CalendarService;
  const now = new Date('2026-09-28T10:00:00Z');

  beforeEach(() => {
    prisma = {
      artist: { findMany: jest.fn().mockResolvedValue([{ id: 'a', name: 'Tamy Moyo' }]), findFirst: jest.fn() },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
      contract: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      quote: { findMany: jest.fn().mockResolvedValue([]) },
      invoicePayment: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEntry: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    };
    service = new CalendarService(prisma as unknown as PrismaService, config);
  });

  it('validates the range', async () => {
    await expect(service.items('org-1', '2026-10-01', '2026-09-01')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.items('org-1', '2026-01-01', '2026-12-31')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes every source to the organisation and the date range', async () => {
    await service.items('org-1', '2026-09-28', '2026-11-08', undefined, now);
    const range = { gte: D('2026-09-28'), lt: D('2026-11-09') };
    expect(prisma.booking.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-1', eventDate: range });
    expect(prisma.invoice.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org-1', dueDate: range, status: { in: ['SENT', 'PARTIALLY_PAID'] } });
    expect(prisma.quote.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org-1', validUntil: range, status: 'SENT' });
    expect(prisma.invoicePayment.findMany.mock.calls[0][0].where).toEqual({ voidedAt: null, paidAt: range, invoice: { organizationId: 'org-1' } });
    // Entries that overlap the range, not only those that start in it.
    expect(prisma.calendarEntry.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-1', startDate: { lt: D('2026-11-09') }, endDate: { gte: D('2026-09-28') } });
  });

  it('with an artist filter, still shows org-wide entries', async () => {
    await service.items('org-1', '2026-09-28', '2026-10-28', 'a', now);
    expect(prisma.booking.findMany.mock.calls[0][0].where.artistId).toBe('a');
    expect(prisma.calendarEntry.findMany.mock.calls[0][0].where.OR).toEqual([{ artistId: 'a' }, { artistId: null }]);
  });

  it('merges all sources into sorted items, skipping repeats and settled money', async () => {
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b1', eventDate: D('2026-10-10'), eventType: 'Wedding', clientName: 'Tariro', venue: 'Meikles', fee: '1200', currency: 'USD', status: 'CONFIRMED', artistId: 'a' },
    ]);
    prisma.contract.findMany.mockResolvedValue([
      { id: 'c1', bookingId: 'b1', eventDate: D('2026-10-10'), title: 'Wedding', clientName: 'Tariro', number: 1, venue: null, status: 'SENT', artistId: 'a' },
      { id: 'c2', bookingId: null, eventDate: D('2026-10-20'), title: 'Gala', clientName: 'Corp', number: 2, venue: null, status: 'SIGNED', artistId: null },
    ]);
    const invoiceBase = { exchangeRate: '1', currency: 'USD', artistId: null, clientName: 'Late', items: [{ quantity: 1, unitPrice: '500.00' }] };
    prisma.invoice.findMany.mockResolvedValue([
      { ...invoiceBase, id: 'i1', number: 1, dueDate: D('2026-09-28'), status: 'SENT', payments: [] },
      { ...invoiceBase, id: 'i2', number: 2, dueDate: D('2026-10-01'), status: 'PARTIALLY_PAID', payments: [{ amount: '500.00', voidedAt: null }] },
    ]);
    prisma.invoicePayment.findMany.mockResolvedValue([{ id: 'p1', amount: '400.00', paidAt: new Date('2026-10-02T14:00:00Z'), method: 'Paynow (online)', invoice: { number: 3, clientName: 'Chipo', currency: 'USD', artistId: null } }]);
    prisma.calendarEntry.findMany.mockResolvedValue([{ id: 'e1', kind: 'REHEARSAL', title: 'Band rehearsal', startDate: D('2026-10-09'), endDate: D('2026-10-09'), startTime: '18:00', endTime: '21:00', notes: null, artistId: 'a' }]);

    const items = await service.items('org-1', '2026-09-28', '2026-10-31', undefined, new Date('2026-09-28T23:30:00Z'));

    expect(items.map((i) => i.id)).toEqual(['INVOICE_DUE:i1', 'PAYMENT:p1', 'ENTRY:e1', 'BOOKING:b1', 'CONTRACT:c2']);
    const booking = items.find((i) => i.type === 'BOOKING')!;
    expect(booking).toMatchObject({ date: '2026-10-10', title: 'Wedding: Tariro', detail: 'Meikles · $1,200.00', status: 'Confirmed', artistName: 'Tamy Moyo', link: '/bookings' });
    // 23:30 UTC on 28 Sept is 29 Sept in Harare, so an invoice due the 28th is overdue.
    expect(items[0]).toMatchObject({ title: 'INV-0001 due: Late', detail: '$500.00 outstanding', overdue: true, status: 'Overdue' });
    expect(items.find((i) => i.type === 'ENTRY')).toMatchObject({ detail: '18:00–21:00', entryKind: 'REHEARSAL', link: null });
    expect(items.find((i) => i.type === 'PAYMENT')).toMatchObject({ date: '2026-10-02', title: 'Paid $400.00: Chipo', detail: 'INV-0003 · Paynow (online)' });
  });

  describe('own entries', () => {
    const dto = { title: '  Studio session ', kind: 'STUDIO' as const, startDate: '2026-10-05' };

    it('creates a single-day entry by default, trimming text', async () => {
      prisma.calendarEntry.create.mockResolvedValue({ id: 'e1', ...dto, startDate: D('2026-10-05'), endDate: D('2026-10-05'), startTime: null, endTime: null, notes: null, artistId: null, kind: 'STUDIO', title: 'Studio session' });
      await service.createEntry('org-1', 'user-1', dto);
      expect(prisma.calendarEntry.create.mock.calls[0][0].data).toEqual({
        organizationId: 'org-1', createdById: 'user-1', artistId: null, title: 'Studio session', kind: 'STUDIO',
        startDate: D('2026-10-05'), endDate: D('2026-10-05'), startTime: null, endTime: null, notes: null,
      });
    });

    it('rejects an end before the start, and a same-day end time before the start time', async () => {
      await expect(service.createEntry('org-1', 'u', { ...dto, endDate: '2026-10-04' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.createEntry('org-1', 'u', { ...dto, startTime: '20:00', endTime: '18:00' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses another organisation\'s artist or entry', async () => {
      prisma.artist.findFirst.mockResolvedValue(null);
      await expect(service.createEntry('org-1', 'u', { ...dto, artistId: 'foreign' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.artist.findFirst.mock.calls[0][0].where).toEqual({ id: 'foreign', organizationId: 'org-1' });

      prisma.calendarEntry.findFirst.mockResolvedValue(null);
      await expect(service.updateEntry('org-1', 'e9', dto)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.removeEntry('org-1', 'e9')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.calendarEntry.delete).not.toHaveBeenCalled();
    });
  });

  it('checks a day for clashes for the booking form', async () => {
    prisma.booking.findMany.mockResolvedValue([{ id: 'b1', clientName: 'Tariro', eventType: 'Wedding' }]);
    prisma.calendarEntry.findMany.mockResolvedValue([{ id: 'e1', title: 'Tour' }]);
    const result = await service.conflictsOn('org-1', '2026-12-05', 'a', 'b-editing');
    expect(prisma.booking.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-1', eventDate: D('2026-12-05'), artistId: 'a', id: { not: 'b-editing' } });
    expect(prisma.calendarEntry.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org-1', kind: 'BLOCKED', OR: [{ artistId: null }, { artistId: 'a' }] });
    expect(result).toEqual([{ type: 'BOOKING', id: 'b1', title: 'Wedding: Tariro' }, { type: 'BLOCKED', id: 'e1', title: 'Tour' }]);
  });

  describe('drag to reschedule', () => {
    it('moves an entry keeping its length', async () => {
      prisma.calendarEntry.findFirst.mockResolvedValue({ id: 'e1', startDate: D('2026-10-05'), endDate: D('2026-10-07') });
      prisma.calendarEntry.update.mockResolvedValue({ id: 'e1', kind: 'TRAVEL', title: 'Tour', startDate: D('2026-10-20'), endDate: D('2026-10-22'), startTime: null, endTime: null, notes: null, artistId: null });
      const item = await service.moveEntry('org-1', 'e1', '2026-10-20');
      expect(prisma.calendarEntry.findFirst.mock.calls[0][0].where).toEqual({ id: 'e1', organizationId: 'org-1' });
      expect(prisma.calendarEntry.update.mock.calls[0][0].data).toEqual({ startDate: D('2026-10-20'), endDate: D('2026-10-22') });
      expect(item).toMatchObject({ date: '2026-10-20', endDate: '2026-10-22' });
    });

    it("refuses another organisation's entry and impossible dates", async () => {
      prisma.calendarEntry.findFirst.mockResolvedValue(null);
      await expect(service.moveEntry('org-1', 'e9', '2026-10-20')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.moveEntry('org-1', 'e1', '2026-02-30')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.calendarEntry.update).not.toHaveBeenCalled();
    });

    const withDocs = {
      id: 'b1', eventType: 'Wedding', clientName: 'Tariro', artistId: 'a', eventDate: D('2026-10-10'),
      contracts: [{ number: 1, status: 'SIGNED', eventDate: D('2026-10-10') }, { number: 2, status: 'DRAFT', eventDate: D('2026-10-12') }],
      quotes: [{ number: 3, status: 'ACCEPTED' }],
      invoices: [{ number: 4, status: 'PARTIALLY_PAID' }],
    };
    const noDocs = (o: Record<string, unknown>) => ({ contracts: [], quotes: [], invoices: [], ...o });

    it('previews a booking move: clashes on the new day (not itself) and documents that keep the old date', async () => {
      // 1st call: the moving bookings; 2nd: other bookings on the new day.
      prisma.booking.findMany.mockResolvedValueOnce([withDocs]).mockResolvedValueOnce([{ id: 'b2', clientName: 'Corp', eventType: 'Gala' }]);

      const preview = await service.movePreview('org-1', 'b1', '2026-10-12', now);

      expect(prisma.booking.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['b1'] }, organizationId: 'org-1' });
      expect(prisma.booking.findMany.mock.calls[1][0].where).toEqual({ organizationId: 'org-1', eventDate: D('2026-10-12'), artistId: 'a', id: { notIn: ['b1'] } });
      expect(preview).toMatchObject({ title: 'Wedding: Tariro', from: '2026-10-10', to: '2026-10-12', inPast: false, clashes: [{ type: 'BOOKING', title: 'Gala: Corp' }] });
      // CON-0002 already says the 12th, so only CON-0001 is flagged.
      expect(preview.linked).toEqual([
        { type: 'CONTRACT', label: 'CON-0001', note: "Signed agreement for 10 October 2026: its text won't change" },
        { type: 'QUOTE', label: 'Q-0003', note: 'Quote (accepted)' },
        { type: 'INVOICE', label: 'INV-0004', note: 'Invoice (partially paid)' },
      ]);
    });

    it('flags the past', async () => {
      prisma.booking.findMany.mockResolvedValueOnce([noDocs({ id: 'b1', eventType: null, clientName: 'X', artistId: null, eventDate: D('2026-10-10') })]);
      expect((await service.movePreview('org-1', 'b1', '2026-09-01', now)).inPast).toBe(true);
    });

    it("refuses another organisation's booking or entry", async () => {
      prisma.booking.findMany.mockResolvedValueOnce([]);
      await expect(service.movePreview('org-1', 'b9', '2026-10-12')).rejects.toBeInstanceOf(NotFoundException);
      prisma.calendarEntry.findMany.mockResolvedValueOnce([]);
      await expect(service.previewMoves('org-1', [{ type: 'ENTRY', id: 'e9', toDate: '2026-10-12' }])).rejects.toBeInstanceOf(NotFoundException);
    });

    it('group preview: items moving away never clash; items moving together can', async () => {
      prisma.booking.findMany
        .mockResolvedValueOnce([
          noDocs({ id: 'b1', eventType: 'Wedding', clientName: 'Tariro', artistId: 'a', eventDate: D('2026-10-10') }),
          noDocs({ id: 'b2', eventType: 'Gala', clientName: 'Corp', artistId: 'a', eventDate: D('2026-10-11') }),
          noDocs({ id: 'b3', eventType: 'Club', clientName: 'Club 263', artistId: 'z', eventDate: D('2026-10-11') }),
        ])
        .mockResolvedValue([]);
      prisma.calendarEntry.findMany
        .mockResolvedValueOnce([{ id: 'e1', kind: 'BLOCKED', title: 'Tour', artistId: 'a', startDate: D('2026-10-01'), endDate: D('2026-10-02') }])
        .mockResolvedValue([]);

      const { bookings, entryCount } = await service.previewMoves(
        'org-1',
        [
          { type: 'BOOKING', id: 'b1', toDate: '2026-10-20' },
          { type: 'BOOKING', id: 'b2', toDate: '2026-10-20' },
          { type: 'BOOKING', id: 'b3', toDate: '2026-10-20' },
          { type: 'ENTRY', id: 'e1', toDate: '2026-10-19' }, // the 2-day block will cover the 19th and 20th
        ],
        now,
      );

      expect(entryCount).toBe(1);
      // DB checks exclude everything that is moving.
      expect(prisma.booking.findMany.mock.calls[1][0].where.id).toEqual({ notIn: ['b1', 'b2', 'b3'] });
      expect(prisma.calendarEntry.findMany.mock.calls[1][0].where.id).toEqual({ notIn: ['e1'] });
      const b1 = bookings.find((b) => b.id === 'b1')!;
      expect(b1.clashes.map((c) => c.title)).toEqual(['Gala: Corp (also moving)', 'Tour (also moving)']);
      // A different artist on the same day doesn't clash, and artist z's day isn't blocked.
      expect(bookings.find((b) => b.id === 'b3')!.clashes).toEqual([]);
    });

    it('rejects an empty, oversized, duplicated or impossible move list', async () => {
      await expect(service.previewMoves('org-1', [])).rejects.toBeInstanceOf(BadRequestException);
      const many = Array.from({ length: 51 }, (_, i) => ({ type: 'ENTRY' as const, id: `e${i}`, toDate: '2026-10-10' }));
      await expect(service.applyMoves('org-1', many)).rejects.toThrow('at most 50');
      await expect(service.applyMoves('org-1', [{ type: 'ENTRY', id: 'e1', toDate: '2026-10-10' }, { type: 'ENTRY', id: 'e1', toDate: '2026-10-11' }])).rejects.toThrow('appears twice');
      await expect(service.applyMoves('org-1', [{ type: 'ENTRY', id: 'e1', toDate: '2026-02-30' }])).rejects.toBeInstanceOf(BadRequestException);
    });

    describe('applyMoves', () => {
      beforeEach(() => {
        prisma.booking.update = jest.fn();
        (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
      });

      it('moves everything in one transaction and returns the moves that undo it', async () => {
        prisma.calendarEntry.findMany.mockResolvedValueOnce([{ id: 'e1', startDate: D('2026-10-05'), endDate: D('2026-10-07') }]);
        prisma.booking.findMany.mockResolvedValueOnce([{ id: 'b1', eventDate: D('2026-10-10') }]);

        const result = await service.applyMoves('org-1', [
          { type: 'ENTRY', id: 'e1', toDate: '2026-10-12' },
          { type: 'BOOKING', id: 'b1', toDate: '2026-10-17' },
        ]);

        expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.calendarEntry.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['e1'] }, organizationId: 'org-1' });
        expect(prisma.calendarEntry.update.mock.calls[0][0]).toEqual({ where: { id: 'e1' }, data: { startDate: D('2026-10-12'), endDate: D('2026-10-14') } });
        expect(prisma.booking.update.mock.calls[0][0]).toEqual({ where: { id: 'b1' }, data: { eventDate: D('2026-10-17') } });
        expect(result).toEqual({
          moved: 2,
          undo: [
            { type: 'ENTRY', id: 'e1', toDate: '2026-10-05' },
            { type: 'BOOKING', id: 'b1', toDate: '2026-10-10' },
          ],
        });
      });

      it('moves nothing if any item is not in the organisation', async () => {
        prisma.calendarEntry.findMany.mockResolvedValueOnce([{ id: 'e1', startDate: D('2026-10-05'), endDate: D('2026-10-05') }]);
        prisma.booking.findMany.mockResolvedValueOnce([]);
        await expect(
          service.applyMoves('org-1', [
            { type: 'ENTRY', id: 'e1', toDate: '2026-10-12' },
            { type: 'BOOKING', id: 'foreign', toDate: '2026-10-17' },
          ]),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.calendarEntry.update).not.toHaveBeenCalled();
        expect(prisma.booking.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('iCal feed', () => {
    it('issues a URL once, and a reset replaces it', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ calendarFeedToken: 'existing-token-abcdefghijkl' });
      expect(await service.feedLink('u')).toEqual({ url: 'https://api.example.com/public/calendar/existing-token-abcdefghijkl.ics' });
      expect(prisma.user.update).not.toHaveBeenCalled();

      const reset = await service.resetFeed('u');
      const newToken = prisma.user.update.mock.calls[0][0].data.calendarFeedToken;
      expect(newToken).toMatch(/^[\w-]{32}$/);
      expect(reset.url).toBe(`https://api.example.com/public/calendar/${newToken}.ics`);
    });

    it('unknown token → null; known token → the org\'s calendar from 90 days back to 400 ahead', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      expect(await service.feed('nope')).toBeNull();

      prisma.user.findUnique.mockResolvedValue({ organizationId: 'org-1', organization: { name: 'Moyo Management' } });
      prisma.booking.findMany.mockResolvedValue([{ id: 'b1', eventDate: D('2026-10-10'), eventType: 'Wedding', clientName: 'Tariro', venue: null, fee: null, currency: 'USD', status: 'CONFIRMED', artistId: 'a' }]);
      const ics = (await service.feed('tok', now))!;
      expect(prisma.booking.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-1', eventDate: { gte: D('2026-06-30'), lt: D('2027-11-03') } });
      expect(ics).toContain('X-WR-CALNAME:Moyo Management (ArtBH)');
      expect(ics).toContain('UID:booking-b1@artbh');
      expect(ics).toContain('SUMMARY:Wedding: Tariro [Tamy Moyo]');
      expect(ics).toContain('URL:https://app.example.com/bookings');
    });
  });
});
