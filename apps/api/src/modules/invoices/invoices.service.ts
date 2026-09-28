import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateInvoiceFromQuoteDto } from './dto/create-invoice-from-quote.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import type { ManualInvoiceStatus } from './dto/update-invoice-status.dto';
import { ExchangeRateService } from './exchange-rate.service';

const MAX_NUMBER_ATTEMPTS = 3;
export const MONEY_TOLERANCE = 0.005;

export const INVOICE_INCLUDE = {
  items: { orderBy: { position: 'asc' } },
  payments: { orderBy: { paidAt: 'asc' } },
} satisfies Prisma.InvoiceInclude;
const INCLUDE = INVOICE_INCLUDE;

export type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof INCLUDE }>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns a stored invoice into the API shape: decimals become numbers and the
 * derived money fields are added. `exchangeRate` is units of the organisation's
 * base currency per 1 unit of the invoice currency, so `*InBaseCurrency` is
 * what reporting should use.
 */
export function toInvoiceView(invoice: InvoiceRow, now = new Date()) {
  const items = invoice.items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice) }));
  const payments = invoice.payments.map((payment) => ({
    ...payment,
    amount: Number(payment.amount),
    voided: !!payment.voidedAt,
  }));
  const exchangeRate = Number(invoice.exchangeRate);

  const total = round2(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  // A voided payment stays on record for the audit trail but no longer counts.
  const amountPaid = round2(payments.filter((payment) => !payment.voided).reduce((sum, payment) => sum + payment.amount, 0));
  const balance = Math.max(0, round2(total - amountPaid));
  const overdue =
    !!invoice.dueDate &&
    invoice.dueDate < now &&
    (invoice.status === 'SENT' || invoice.status === 'PARTIALLY_PAID');

  return {
    ...invoice,
    items,
    payments,
    exchangeRate,
    total,
    amountPaid,
    balance,
    totalInBaseCurrency: round2(total * exchangeRate),
    balanceInBaseCurrency: round2(balance * exchangeRate),
    overdue,
  };
}

interface NewInvoiceData {
  artistId?: string;
  clientId?: string;
  bookingId?: string;
  quoteId?: string;
  title: string;
  clientName: string;
  clientEmail?: string | null;
  currency: string;
  exchangeRate: number;
  issueDate?: Date;
  dueDate?: Date;
  notes?: string | null;
  items: { description: string; quantity: number; unitPrice: number }[];
}

function duplicateTargets(err: Prisma.PrismaClientKnownRequestError): string {
  const target = err.meta?.target;
  return Array.isArray(target) ? target.join(',') : String(target ?? '');
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  private async baseCurrency(organizationId: string): Promise<string> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { currency: true },
    });
    return organization?.currency ?? 'USD';
  }

  /** Rate to the base currency: 1 if same currency, the user's rate if given, else live — never a guess. */
  private async resolveRate(currency: string, baseCurrency: string, provided?: number): Promise<number> {
    if (currency === baseCurrency) return 1;
    if (provided !== undefined) return provided;

    const live = await this.exchangeRates.getRate(currency, baseCurrency);
    if (!live) {
      throw new BadRequestException(
        `No live exchange rate is available for ${currency} → ${baseCurrency}. Please enter the rate manually.`,
      );
    }
    return live.rate;
  }

  async lookupRate(organizationId: string, from: string, to?: string) {
    const target = (to ?? (await this.baseCurrency(organizationId))).toUpperCase();
    const source = from.toUpperCase();
    const rate = await this.exchangeRates.getRate(source, target);
    return rate ?? { from: source, to: target, rate: null, date: null, source: null };
  }

  async create(organizationId: string, dto: CreateInvoiceDto) {
    if (dto.artistId) {
      const artist = await this.prisma.artist.findFirst({ where: { id: dto.artistId, organizationId } });
      if (!artist) throw new NotFoundException('Artist not found.');
    }
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId } });
      if (!client) throw new NotFoundException('Client not found.');
    }
    if (dto.bookingId) {
      const booking = await this.prisma.booking.findFirst({ where: { id: dto.bookingId, organizationId } });
      if (!booking) throw new NotFoundException('Booking not found.');
    }

    const baseCurrency = await this.baseCurrency(organizationId);
    const currency = dto.currency ?? baseCurrency;
    const exchangeRate = await this.resolveRate(currency, baseCurrency, dto.exchangeRate);

    return this.createNumbered(organizationId, {
      artistId: dto.artistId,
      clientId: dto.clientId,
      bookingId: dto.bookingId,
      title: dto.title,
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      currency,
      exchangeRate,
      issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      notes: dto.notes,
      items: dto.items,
    });
  }

  async createFromQuote(organizationId: string, quoteId: string, dto: CreateInvoiceFromQuoteDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, organizationId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!quote) throw new NotFoundException('Quote not found.');

    const existing = await this.prisma.invoice.findFirst({ where: { quoteId } });
    if (existing) throw new ConflictException('This quote has already been converted to an invoice.');

    const baseCurrency = await this.baseCurrency(organizationId);
    const exchangeRate = await this.resolveRate(quote.currency, baseCurrency, dto.exchangeRate);

    return this.createNumbered(organizationId, {
      artistId: quote.artistId ?? undefined,
      clientId: quote.clientId ?? undefined,
      bookingId: quote.bookingId ?? undefined,
      quoteId: quote.id,
      title: quote.title,
      clientName: quote.clientName,
      clientEmail: quote.clientEmail,
      currency: quote.currency,
      exchangeRate,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      notes: quote.notes,
      items: quote.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })),
    });
  }

  // Numbers are per-organisation (INV-0001 …). The unique (organizationId,
  // number) index guards two concurrent creates picking the same number; on a
  // collision we pick again. A duplicate quoteId is a different failure: the
  // quote was converted concurrently.
  private async createNumbered(organizationId: string, data: NewInvoiceData) {
    for (let attempt = 1; ; attempt++) {
      const last = await this.prisma.invoice.findFirst({
        where: { organizationId },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const number = (last?.number ?? 0) + 1;

      try {
        const invoice = await this.prisma.invoice.create({
          data: {
            organizationId,
            number,
            artistId: data.artistId,
            clientId: data.clientId,
            bookingId: data.bookingId,
            quoteId: data.quoteId,
            title: data.title,
            clientName: data.clientName,
            clientEmail: data.clientEmail,
            currency: data.currency,
            exchangeRate: data.exchangeRate,
            issueDate: data.issueDate,
            dueDate: data.dueDate,
            notes: data.notes,
            items: {
              create: data.items.map((item, position) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                position,
              })),
            },
          },
          include: INCLUDE,
        });
        return toInvoiceView(invoice);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          if (duplicateTargets(err).includes('quoteId')) {
            throw new ConflictException('This quote has already been converted to an invoice.');
          }
          if (attempt < MAX_NUMBER_ATTEMPTS) continue;
        }
        throw err;
      }
    }
  }

  async findAll(organizationId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });
    return invoices.map((invoice) => toInvoiceView(invoice));
  }

  private async findRow(organizationId: string, id: string): Promise<InvoiceRow> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, organizationId }, include: INCLUDE });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    return invoice;
  }

  async findOne(organizationId: string, id: string) {
    return toInvoiceView(await this.findRow(organizationId, id));
  }

  async updateStatus(organizationId: string, id: string, status: ManualInvoiceStatus) {
    const invoice = await this.findRow(organizationId, id);
    if (invoice.status === 'VOID') {
      throw new BadRequestException('A voided invoice cannot be changed.');
    }
    if (toInvoiceView(invoice).amountPaid > 0) {
      throw new BadRequestException('An invoice with recorded payments cannot be changed manually.');
    }

    const updated = await this.prisma.invoice.update({ where: { id }, data: { status }, include: INCLUDE });
    return toInvoiceView(updated);
  }

  async addPayment(organizationId: string, id: string, dto: CreatePaymentDto) {
    const invoice = await this.findRow(organizationId, id);
    if (invoice.status === 'VOID') {
      throw new BadRequestException('Cannot record a payment against a voided invoice.');
    }
    if (invoice.status === 'DRAFT') {
      throw new BadRequestException('Mark the invoice as sent before recording payments.');
    }

    const { total, amountPaid, balance } = toInvoiceView(invoice);
    if (balance <= 0) {
      throw new BadRequestException('This invoice is already fully paid.');
    }
    if (dto.amount > balance + MONEY_TOLERANCE) {
      throw new BadRequestException(`Payment exceeds the outstanding balance of ${balance.toFixed(2)}.`);
    }

    const fullyPaid = amountPaid + dto.amount >= total - MONEY_TOLERANCE;
    await this.prisma.$transaction([
      this.prisma.invoicePayment.create({
        data: {
          invoiceId: id,
          amount: dto.amount,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
          method: dto.method,
          note: dto.note,
        },
      }),
      this.prisma.invoice.update({
        where: { id },
        data: { status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID' },
      }),
    ]);

    return this.findOne(organizationId, id);
  }

  /**
   * Corrects a mistaken payment without destroying the record: it is marked
   * void (with when/why), stops counting toward the balance, and the invoice
   * status is recalculated from what remains.
   */
  async voidPayment(organizationId: string, id: string, paymentId: string, dto: VoidPaymentDto) {
    const invoice = await this.findRow(organizationId, id);
    if (invoice.status === 'VOID') {
      throw new BadRequestException('A voided invoice cannot be changed.');
    }

    const payment = invoice.payments.find((p) => p.id === paymentId);
    if (!payment) throw new NotFoundException('Payment not found.');
    if (payment.voidedAt) throw new BadRequestException('This payment has already been voided.');

    const remaining = toInvoiceView(invoice).amountPaid - Number(payment.amount);
    await this.prisma.$transaction([
      this.prisma.invoicePayment.update({
        where: { id: paymentId },
        data: { voidedAt: new Date(), voidReason: dto.reason?.trim() || null },
      }),
      this.prisma.invoice.update({
        where: { id },
        data: { status: remaining > MONEY_TOLERANCE ? 'PARTIALLY_PAID' : 'SENT' },
      }),
    ]);

    return this.findOne(organizationId, id);
  }

  async remove(organizationId: string, id: string) {
    const invoice = await this.findRow(organizationId, id);
    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only draft invoices can be deleted. Void the invoice instead.');
    }
    await this.prisma.invoice.delete({ where: { id } });
    return { deleted: true };
  }

  /** Dashboard numbers, all converted to the organisation's base currency. */
  async summary(organizationId: string, now = new Date()) {
    const baseCurrency = await this.baseCurrency(organizationId);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [payments, openInvoices] = await Promise.all([
      this.prisma.invoicePayment.findMany({
        where: { paidAt: { gte: startOfMonth }, voidedAt: null, invoice: { organizationId } },
        include: { invoice: { select: { exchangeRate: true } } },
      }),
      this.prisma.invoice.findMany({
        where: { organizationId, status: { in: ['SENT', 'PARTIALLY_PAID'] } },
        include: INCLUDE,
      }),
    ]);

    const views = openInvoices.map((invoice) => toInvoiceView(invoice, now));
    return {
      baseCurrency,
      receivedThisMonth: round2(
        payments.reduce((sum, payment) => sum + Number(payment.amount) * Number(payment.invoice.exchangeRate), 0),
      ),
      outstanding: round2(views.reduce((sum, view) => sum + view.balanceInBaseCurrency, 0)),
      openCount: views.length,
      overdueCount: views.filter((view) => view.overdue).length,
    };
  }
}
