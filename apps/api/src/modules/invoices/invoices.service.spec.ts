import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExchangeRateService } from './exchange-rate.service';
import { InvoicesService, toInvoiceView } from './invoices.service';

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    number: 1,
    currency: 'USD',
    exchangeRate: '1',
    status: 'SENT',
    dueDate: null,
    items: [
      { id: 'i1', invoiceId: 'inv-1', description: 'Performance', quantity: 1, unitPrice: '800.00', position: 0 },
      { id: 'i2', invoiceId: 'inv-1', description: 'Sound engineer', quantity: 2, unitPrice: '75.50', position: 1 },
    ],
    payments: [] as { id: string; amount: string; paidAt: Date }[],
    ...overrides,
  };
}

function collision(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: {
    invoice: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
    invoicePayment: { create: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    quote: { findFirst: jest.Mock };
    artist: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock };
    booking: { findFirst: jest.Mock };
    organization: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let rates: { getRate: jest.Mock };

  const baseDto = {
    title: 'Wedding performance',
    clientName: 'Chipo Weddings',
    items: [{ description: 'Performance', quantity: 1, unitPrice: 800 }],
  };

  beforeEach(() => {
    prisma = {
      invoice: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      invoicePayment: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      quote: { findFirst: jest.fn() },
      artist: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      booking: { findFirst: jest.fn() },
      organization: { findUnique: jest.fn().mockResolvedValue({ currency: 'USD' }) },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    rates = { getRate: jest.fn() };
    service = new InvoicesService(prisma as unknown as PrismaService, rates as unknown as ExchangeRateService);
  });

  describe('toInvoiceView', () => {
    it('computes total, paid, balance and the base-currency equivalents', () => {
      const view = toInvoiceView(
        invoiceRow({
          currency: 'EUR',
          exchangeRate: '1.1403',
          payments: [{ id: 'p1', amount: '351.00', paidAt: new Date() }],
        }) as never,
      );

      expect(view.total).toBe(951); // 800 + 2 x 75.50
      expect(view.amountPaid).toBe(351);
      expect(view.balance).toBe(600);
      expect(view.exchangeRate).toBe(1.1403);
      expect(view.totalInBaseCurrency).toBe(1084.43); // 951 x 1.1403 = 1084.4253
      expect(view.balanceInBaseCurrency).toBe(684.18); // 600 x 1.1403
    });

    it('lists a voided payment but does not count it toward paid or balance', () => {
      const view = toInvoiceView(
        invoiceRow({
          payments: [
            { id: 'p1', amount: '400.00', paidAt: new Date(), voidedAt: new Date('2026-09-02') },
            { id: 'p2', amount: '100.00', paidAt: new Date(), voidedAt: null },
          ],
        }) as never,
      );

      expect(view.payments).toHaveLength(2);
      expect(view.payments[0].voided).toBe(true);
      expect(view.payments[1].voided).toBe(false);
      expect(view.amountPaid).toBe(100);
      expect(view.balance).toBe(851);
    });

    it('never reports a negative balance', () => {
      const view = toInvoiceView(
        invoiceRow({ payments: [{ id: 'p1', amount: '2000.00', paidAt: new Date() }] }) as never,
      );
      expect(view.balance).toBe(0);
    });

    it('flags a sent invoice past its due date as overdue, but not once paid or while still a draft', () => {
      const past = new Date('2026-01-01');
      const now = new Date('2026-06-01');

      expect(toInvoiceView(invoiceRow({ dueDate: past, status: 'SENT' }) as never, now).overdue).toBe(true);
      expect(toInvoiceView(invoiceRow({ dueDate: past, status: 'PARTIALLY_PAID' }) as never, now).overdue).toBe(true);
      expect(toInvoiceView(invoiceRow({ dueDate: past, status: 'PAID' }) as never, now).overdue).toBe(false);
      expect(toInvoiceView(invoiceRow({ dueDate: past, status: 'DRAFT' }) as never, now).overdue).toBe(false);
      expect(toInvoiceView(invoiceRow({ dueDate: new Date('2026-12-01'), status: 'SENT' }) as never, now).overdue).toBe(false);
    });
  });

  describe('create', () => {
    it('rejects an artist from another organisation', async () => {
      prisma.artist.findFirst.mockResolvedValue(null);

      await expect(service.create('org-1', { ...baseDto, artistId: 'artist-x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.artist.findFirst.mock.calls[0][0].where).toEqual({ id: 'artist-x', organizationId: 'org-1' });
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('links the invoice to an artist in the organisation', async () => {
      prisma.artist.findFirst.mockResolvedValue({ id: 'artist-1', name: 'Tamy Moyo' });
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(invoiceRow());

      await service.create('org-1', { ...baseDto, artistId: 'artist-1' });

      expect(prisma.invoice.create.mock.calls[0][0].data.artistId).toBe('artist-1');
    });

    it('numbers the first invoice 1, uses the base currency by default and stores a rate of 1', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(invoiceRow());

      await service.create('org-1', baseDto);

      const data = prisma.invoice.create.mock.calls[0][0].data;
      expect(data.number).toBe(1);
      expect(data.currency).toBe('USD');
      expect(data.exchangeRate).toBe(1);
      expect(rates.getRate).not.toHaveBeenCalled();
    });

    it('numbers the next invoice after the highest existing number', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ number: 12 });
      prisma.invoice.create.mockResolvedValue(invoiceRow({ number: 13 }));

      await service.create('org-1', baseDto);

      expect(prisma.invoice.create.mock.calls[0][0].data.number).toBe(13);
    });

    it('uses the manually supplied rate for a foreign currency without calling the rate API', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(invoiceRow({ currency: 'ZWG', exchangeRate: '0.0376' }));

      await service.create('org-1', { ...baseDto, currency: 'ZWG', exchangeRate: 0.0376 });

      expect(prisma.invoice.create.mock.calls[0][0].data.exchangeRate).toBe(0.0376);
      expect(rates.getRate).not.toHaveBeenCalled();
    });

    it('looks up the live rate for a foreign currency when none is supplied', async () => {
      rates.getRate.mockResolvedValue({ from: 'EUR', to: 'USD', rate: 1.1403, date: '2026-09-25', source: 'frankfurter' });
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(invoiceRow({ currency: 'EUR', exchangeRate: '1.1403' }));

      await service.create('org-1', { ...baseDto, currency: 'EUR' });

      expect(rates.getRate).toHaveBeenCalledWith('EUR', 'USD');
      expect(prisma.invoice.create.mock.calls[0][0].data.exchangeRate).toBe(1.1403);
    });

    it('refuses to guess: no live rate and no manual rate is a 400 asking the user to enter one', async () => {
      rates.getRate.mockResolvedValue(null);

      await expect(service.create('org-1', { ...baseDto, currency: 'XOF' })).rejects.toThrow(/enter the rate manually/);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('ignores a supplied rate when the invoice is in the base currency', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(invoiceRow());

      await service.create('org-1', { ...baseDto, currency: 'USD', exchangeRate: 42 });

      expect(prisma.invoice.create.mock.calls[0][0].data.exchangeRate).toBe(1);
    });

    it('resolves rates against the organisation\'s own base currency', async () => {
      prisma.organization.findUnique.mockResolvedValue({ currency: 'ZAR' });
      rates.getRate.mockResolvedValue({ from: 'USD', to: 'ZAR', rate: 16.3, date: '2026-09-28', source: 'frankfurter' });
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(invoiceRow());

      await service.create('org-1', { ...baseDto, currency: 'USD' });

      expect(rates.getRate).toHaveBeenCalledWith('USD', 'ZAR');
    });

    it('rejects a clientId from a different organisation', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(service.create('org-1', { ...baseDto, clientId: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('rejects a bookingId from a different organisation', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);

      await expect(service.create('org-1', { ...baseDto, bookingId: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('retries with a fresh number when a concurrent create took the same one', async () => {
      prisma.invoice.findFirst.mockResolvedValueOnce({ number: 1 }).mockResolvedValueOnce({ number: 2 });
      prisma.invoice.create
        .mockRejectedValueOnce(collision(['organizationId', 'number']))
        .mockResolvedValueOnce(invoiceRow({ number: 3 }));

      const result = await service.create('org-1', baseDto);

      expect(prisma.invoice.create).toHaveBeenCalledTimes(2);
      expect(result.number).toBe(3);
    });

    it('gives up after repeated number collisions and does not swallow unrelated errors', async () => {
      const err = collision(['organizationId', 'number']);
      prisma.invoice.findFirst.mockResolvedValue({ number: 1 });
      prisma.invoice.create.mockRejectedValue(err);
      await expect(service.create('org-1', baseDto)).rejects.toBe(err);
      expect(prisma.invoice.create).toHaveBeenCalledTimes(3);

      prisma.invoice.create.mockReset();
      const boom = new Error('connection lost');
      prisma.invoice.create.mockRejectedValue(boom);
      await expect(service.create('org-1', baseDto)).rejects.toBe(boom);
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('createFromQuote', () => {
    const quote = {
      id: 'quote-1',
      organizationId: 'org-1',
      artistId: 'artist-1',
      clientId: 'client-1',
      bookingId: 'booking-1',
      title: 'Wedding – Meikles',
      clientName: 'Tariro Events',
      clientEmail: 'tariro@events.co.zw',
      currency: 'USD',
      notes: '50% deposit',
      items: [{ description: 'Performance', quantity: 1, unitPrice: '900.00', position: 0 }],
    };

    it('throws NotFoundException for a quote in another organisation', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);

      await expect(service.createFromQuote('org-1', 'quote-1', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to convert the same quote twice', async () => {
      prisma.quote.findFirst.mockResolvedValue(quote);
      prisma.invoice.findFirst.mockResolvedValueOnce({ id: 'existing' });

      await expect(service.createFromQuote('org-1', 'quote-1', {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('copies the quote\'s items, currency, artist, client and link into the invoice', async () => {
      prisma.quote.findFirst.mockResolvedValue(quote);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue(invoiceRow());

      await service.createFromQuote('org-1', 'quote-1', { dueDate: '2026-11-30' });

      const data = prisma.invoice.create.mock.calls[0][0].data;
      expect(data.quoteId).toBe('quote-1');
      expect(data.artistId).toBe('artist-1');
      expect(data.clientId).toBe('client-1');
      expect(data.bookingId).toBe('booking-1');
      expect(data.clientName).toBe('Tariro Events');
      expect(data.currency).toBe('USD');
      expect(data.notes).toBe('50% deposit');
      expect(data.dueDate).toBeInstanceOf(Date);
      expect(data.items.create).toEqual([{ description: 'Performance', quantity: 1, unitPrice: 900, position: 0 }]);
    });

    it('reports a concurrent conversion (duplicate quoteId) as a conflict, not a retry', async () => {
      prisma.quote.findFirst.mockResolvedValue(quote);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockRejectedValue(collision(['quoteId']));

      await expect(service.createFromQuote('org-1', 'quote-1', {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateStatus', () => {
    it('throws NotFoundException for an invoice in another organisation', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('org-1', 'inv-1', 'SENT')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('does not allow changing a voided invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'VOID' }));

      await expect(service.updateStatus('org-1', 'inv-1', 'SENT')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not allow changing an invoice that already has payments', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        invoiceRow({ status: 'PARTIALLY_PAID', payments: [{ id: 'p1', amount: '100.00', paidAt: new Date() }] }),
      );

      await expect(service.updateStatus('org-1', 'inv-1', 'VOID')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('marks a draft as sent', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'DRAFT' }));
      prisma.invoice.update.mockResolvedValue(invoiceRow({ status: 'SENT' }));

      const result = await service.updateStatus('org-1', 'inv-1', 'SENT');

      expect(prisma.invoice.update.mock.calls[0][0].data).toEqual({ status: 'SENT' });
      expect(result.status).toBe('SENT');
    });
  });

  describe('addPayment', () => {
    it('blocks payments on a draft, a voided invoice, and an already-paid invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValueOnce(invoiceRow({ status: 'DRAFT' }));
      await expect(service.addPayment('org-1', 'inv-1', { amount: 10 })).rejects.toThrow(/sent before/);

      prisma.invoice.findFirst.mockResolvedValueOnce(invoiceRow({ status: 'VOID' }));
      await expect(service.addPayment('org-1', 'inv-1', { amount: 10 })).rejects.toThrow(/voided/);

      prisma.invoice.findFirst.mockResolvedValueOnce(
        invoiceRow({ status: 'PAID', payments: [{ id: 'p1', amount: '951.00', paidAt: new Date() }] }),
      );
      await expect(service.addPayment('org-1', 'inv-1', { amount: 10 })).rejects.toThrow(/already fully paid/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an overpayment', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow());

      await expect(service.addPayment('org-1', 'inv-1', { amount: 951.01 })).rejects.toThrow(/exceeds the outstanding balance of 951\.00/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('records a partial payment and moves the invoice to PARTIALLY_PAID', async () => {
      prisma.invoice.findFirst
        .mockResolvedValueOnce(invoiceRow())
        .mockResolvedValueOnce(invoiceRow({ status: 'PARTIALLY_PAID' }));

      await service.addPayment('org-1', 'inv-1', { amount: 400, method: 'EcoCash' });

      expect(prisma.invoicePayment.create.mock.calls[0][0].data).toMatchObject({
        invoiceId: 'inv-1',
        amount: 400,
        method: 'EcoCash',
      });
      expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'PARTIALLY_PAID' } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('moves the invoice to PAID when the payment clears the remaining balance', async () => {
      prisma.invoice.findFirst
        .mockResolvedValueOnce(
          invoiceRow({ status: 'PARTIALLY_PAID', payments: [{ id: 'p1', amount: '400.00', paidAt: new Date() }] }),
        )
        .mockResolvedValueOnce(invoiceRow({ status: 'PAID' }));

      await service.addPayment('org-1', 'inv-1', { amount: 551 });

      expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'PAID' } });
    });
  });

  describe('voidPayment', () => {
    const paid = (amount: string, extra: Record<string, unknown> = {}) => ({
      id: 'p1',
      amount,
      paidAt: new Date(),
      voidedAt: null,
      ...extra,
    });

    it('throws NotFoundException for an invoice in another organisation', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.voidPayment('org-1', 'inv-1', 'p1', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a payment that is not on this invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'PARTIALLY_PAID', payments: [paid('100.00')] }));

      await expect(service.voidPayment('org-1', 'inv-1', 'someone-elses-payment', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.invoicePayment.update).not.toHaveBeenCalled();
    });

    it('refuses to void the same payment twice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        invoiceRow({ status: 'SENT', payments: [paid('100.00', { voidedAt: new Date() })] }),
      );

      await expect(service.voidPayment('org-1', 'inv-1', 'p1', {})).rejects.toThrow(/already been voided/);
      expect(prisma.invoicePayment.update).not.toHaveBeenCalled();
    });

    it('refuses to touch payments on a voided invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'VOID', payments: [paid('100.00')] }));

      await expect(service.voidPayment('org-1', 'inv-1', 'p1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('voiding the only payment puts the invoice back to SENT and records when and why', async () => {
      prisma.invoice.findFirst
        .mockResolvedValueOnce(invoiceRow({ status: 'PARTIALLY_PAID', payments: [paid('400.00')] }))
        .mockResolvedValueOnce(invoiceRow({ status: 'SENT' }));

      await service.voidPayment('org-1', 'inv-1', 'p1', { reason: '  Entered against the wrong invoice  ' });

      const update = prisma.invoicePayment.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'p1' });
      expect(update.data.voidedAt).toBeInstanceOf(Date);
      expect(update.data.voidReason).toBe('Entered against the wrong invoice');
      expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'SENT' } });
    });

    it('voiding one of several payments leaves the invoice PARTIALLY_PAID', async () => {
      prisma.invoice.findFirst
        .mockResolvedValueOnce(
          invoiceRow({
            status: 'PARTIALLY_PAID',
            payments: [paid('400.00'), paid('100.00', { id: 'p2' })],
          }),
        )
        .mockResolvedValueOnce(invoiceRow({ status: 'PARTIALLY_PAID' }));

      await service.voidPayment('org-1', 'inv-1', 'p1', {});

      expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'PARTIALLY_PAID' } });
    });

    it('voiding a payment on a fully PAID invoice reopens it as PARTIALLY_PAID', async () => {
      prisma.invoice.findFirst
        .mockResolvedValueOnce(
          invoiceRow({
            status: 'PAID',
            payments: [paid('400.00'), paid('551.00', { id: 'p2' })],
          }),
        )
        .mockResolvedValueOnce(invoiceRow({ status: 'PARTIALLY_PAID' }));

      await service.voidPayment('org-1', 'inv-1', 'p2', {});

      expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'PARTIALLY_PAID' } });
    });

    it('stores a blank reason as null', async () => {
      prisma.invoice.findFirst
        .mockResolvedValueOnce(invoiceRow({ status: 'PARTIALLY_PAID', payments: [paid('100.00')] }))
        .mockResolvedValueOnce(invoiceRow());

      await service.voidPayment('org-1', 'inv-1', 'p1', { reason: '   ' });

      expect(prisma.invoicePayment.update.mock.calls[0][0].data.voidReason).toBeNull();
    });

    it('lets the full balance be paid again after a payment is voided', async () => {
      // 951 total, one payment of 951 already voided -> nothing counts, full balance is due again
      prisma.invoice.findFirst
        .mockResolvedValueOnce(
          invoiceRow({ status: 'SENT', payments: [paid('951.00', { voidedAt: new Date() })] }),
        )
        .mockResolvedValueOnce(invoiceRow({ status: 'PAID' }));

      await service.addPayment('org-1', 'inv-1', { amount: 951 });

      expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'PAID' } });
    });
  });

  describe('remove', () => {
    it('only deletes drafts', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'SENT' }));

      await expect(service.remove('org-1', 'inv-1')).rejects.toThrow(/Void the invoice instead/);
      expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });

    it('deletes a draft it can confirm belongs to the organisation', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'DRAFT' }));

      expect(await service.remove('org-1', 'inv-1')).toEqual({ deleted: true });
      expect(prisma.invoice.delete).toHaveBeenCalledWith({ where: { id: 'inv-1' } });
    });

    it('throws NotFoundException for an invoice in another organisation', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.remove('org-1', 'inv-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('summary', () => {
    it('converts this month\'s payments and the open balances into the base currency', async () => {
      const now = new Date('2026-09-28T10:00:00Z');
      prisma.invoicePayment.findMany.mockResolvedValue([
        { amount: '100.00', invoice: { exchangeRate: '1' } },
        { amount: '1000.00', invoice: { exchangeRate: '0.0376' } }, // ZWG -> USD = 37.60
      ]);
      prisma.invoice.findMany.mockResolvedValue([
        invoiceRow({ currency: 'EUR', exchangeRate: '1.1403', dueDate: new Date('2026-09-01') }), // 951 x 1.1403 = 1084.43
        invoiceRow({ id: 'inv-2', status: 'PARTIALLY_PAID', payments: [{ id: 'p', amount: '351.00', paidAt: now }] }), // balance 600
      ]);

      const result = await service.summary('org-1', now);

      expect(result.baseCurrency).toBe('USD');
      expect(result.receivedThisMonth).toBe(137.6);
      expect(result.outstanding).toBe(1684.43); // 1084.43 + 600
      expect(result.openCount).toBe(2);
      expect(result.overdueCount).toBe(1);
      expect(prisma.invoicePayment.findMany.mock.calls[0][0].where.paidAt.gte).toEqual(new Date('2026-09-01T00:00:00Z'));
      expect(prisma.invoicePayment.findMany.mock.calls[0][0].where.invoice).toEqual({ organizationId: 'org-1' });
      expect(prisma.invoicePayment.findMany.mock.calls[0][0].where.voidedAt).toBeNull();
    });
  });

  describe('lookupRate', () => {
    it('defaults the target to the organisation\'s base currency', async () => {
      rates.getRate.mockResolvedValue({ from: 'EUR', to: 'USD', rate: 1.14, date: '2026-09-25', source: 'frankfurter' });

      const result = await service.lookupRate('org-1', 'eur');

      expect(rates.getRate).toHaveBeenCalledWith('EUR', 'USD');
      expect(result.rate).toBe(1.14);
    });

    it('returns a null rate (not an error) when nothing is available so the UI can ask for a manual one', async () => {
      rates.getRate.mockResolvedValue(null);

      const result = await service.lookupRate('org-1', 'XOF', 'USD');

      expect(result).toEqual({ from: 'XOF', to: 'USD', rate: null, date: null, source: null });
    });
  });
});
