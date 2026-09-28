import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentAccount, PaymentAttempt } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INVOICE_INCLUDE, MONEY_TOLERANCE, toInvoiceView } from '../invoices/invoices.service';
import { SecretBox } from './crypto';
import { SavePaymentAccountDto, StartPaymentDto } from './dto/payments.dto';
import { GatewayError, MerchantCredentials, StatusReport, UntrustedMessageError } from './gateways/gateway.types';
import { Pairs, PaynowGateway } from './gateways/paynow.gateway';

const POLL_INTERVAL_MS = 5_000;

/** Domain event: an online payment was confirmed and recorded on its invoice. */
export const PAYMENT_RECEIVED = 'payment.received';
export interface PaymentReceivedEvent {
  attemptId: string;
}
const invoiceNumber = (n: number) => `INV-${String(n).padStart(4, '0')}`;

type AttemptWithAccount = PaymentAttempt & { paymentAccount: PaymentAccount | null };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly box: SecretBox | null;
  private readonly paynow: PaynowGateway;
  private readonly webBaseUrl: string;
  private readonly apiPublicUrl: string;
  readonly testProviderEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    paynow: PaynowGateway,
    private readonly events: EventEmitter2,
  ) {
    const key = config.get<string>('PAYMENTS_ENCRYPTION_KEY');
    this.box = key ? new SecretBox(key) : null;
    this.paynow = paynow;
    this.webBaseUrl = (config.get<string>('WEB_BASE_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
    this.apiPublicUrl = (config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000').replace(/\/$/, '');
    this.testProviderEnabled = config.get<string>('PAYMENTS_TEST_PROVIDER') === 'true';
  }

  private requireBox(): SecretBox {
    if (!this.box) {
      throw new ServiceUnavailableException('Online payments are not configured on this server (missing PAYMENTS_ENCRYPTION_KEY).');
    }
    return this.box;
  }

  private credentials(account: PaymentAccount): MerchantCredentials {
    return { integrationId: account.integrationId, integrationKey: this.requireBox().decrypt(account.integrationKeyEncrypted) };
  }

  // ─────────────────────────── Merchant accounts ───────────────────────────

  async listAccounts(organizationId: string) {
    const accounts = await this.prisma.paymentAccount.findMany({
      where: { organizationId },
      orderBy: [{ provider: 'asc' }, { currency: 'asc' }],
      // The key never leaves the server, not even encrypted.
      select: { id: true, provider: true, currency: true, integrationId: true, createdAt: true, updatedAt: true },
    });
    return {
      accounts: accounts.filter((a) => a.provider !== 'TEST' || this.testProviderEnabled),
      testProviderAvailable: this.testProviderEnabled,
      configured: !!this.box,
    };
  }

  async saveAccount(organizationId: string, dto: SavePaymentAccountDto) {
    const box = this.requireBox();
    let integrationId: string;
    let integrationKey: string;
    if (dto.provider === 'TEST') {
      if (!this.testProviderEnabled) throw new BadRequestException('The test provider is not available on this server.');
      integrationId = 'test';
      integrationKey = randomBytes(24).toString('hex');
    } else {
      if (!dto.integrationId || !dto.integrationKey) {
        throw new BadRequestException('Enter both the Integration ID and Integration Key from your Paynow dashboard.');
      }
      integrationId = dto.integrationId;
      integrationKey = dto.integrationKey.trim();
    }

    const data = { integrationId, integrationKeyEncrypted: box.encrypt(integrationKey) };
    await this.prisma.paymentAccount.upsert({
      where: { organizationId_provider_currency: { organizationId, provider: dto.provider, currency: dto.currency } },
      create: { organizationId, provider: dto.provider, currency: dto.currency, ...data },
      update: data,
    });
    return this.listAccounts(organizationId);
  }

  async removeAccount(organizationId: string, id: string) {
    const account = await this.prisma.paymentAccount.findFirst({ where: { id, organizationId } });
    if (!account) throw new NotFoundException('Payment account not found.');
    await this.prisma.paymentAccount.delete({ where: { id } });
    return this.listAccounts(organizationId);
  }

  /** The account that takes payments in this currency: a real provider always wins over the test one. */
  private async accountFor(organizationId: string, currency: string): Promise<PaymentAccount | null> {
    const accounts = await this.prisma.paymentAccount.findMany({ where: { organizationId, currency } });
    return (
      accounts.find((a) => a.provider === 'PAYNOW') ??
      (this.testProviderEnabled ? accounts.find((a) => a.provider === 'TEST') : undefined) ??
      null
    );
  }

  // ─────────────────────────── Payment links (owner side) ───────────────────────────

  private async findInvoice(organizationId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    return invoice;
  }

  private payUrl(token: string) {
    return `${this.webBaseUrl}/pay/${token}`;
  }

  async invoicePaymentInfo(organizationId: string, invoiceId: string) {
    const invoice = await this.findInvoice(organizationId, invoiceId);
    const [account, attempts] = await Promise.all([
      this.accountFor(organizationId, invoice.currency),
      this.prisma.paymentAttempt.findMany({ where: { invoiceId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return {
      link: invoice.publicToken ? this.payUrl(invoice.publicToken) : null,
      provider: account?.provider ?? null,
      currency: invoice.currency,
      attempts: attempts.map((a) => this.attemptView(a)),
    };
  }

  async enableLink(organizationId: string, invoiceId: string) {
    const invoice = await this.findInvoice(organizationId, invoiceId);
    if (invoice.status === 'DRAFT') throw new BadRequestException('Mark the invoice as sent before sharing a payment link.');
    if (invoice.status === 'VOID') throw new BadRequestException('A voided invoice cannot be paid.');
    if (!invoice.publicToken) {
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { publicToken: randomBytes(24).toString('base64url') } });
    }
    return this.invoicePaymentInfo(organizationId, invoiceId);
  }

  /**
   * The link to put in an email about this invoice, issuing one if needed.
   * `payable` says whether the client can actually pay online right now. Null
   * for drafts and voided invoices, which have no client-facing page.
   */
  async shareableLink(organizationId: string, invoiceId: string): Promise<{ url: string; payable: boolean } | null> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, organizationId }, include: INVOICE_INCLUDE });
    if (!invoice || invoice.status === 'DRAFT' || invoice.status === 'VOID') return null;
    let token = invoice.publicToken;
    if (!token) {
      token = randomBytes(24).toString('base64url');
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { publicToken: token } });
    }
    const account = await this.accountFor(organizationId, invoice.currency);
    return { url: this.payUrl(token), payable: !!account && toInvoiceView(invoice).balance > MONEY_TOLERANCE };
  }

  /** Turns the link off; enabling again issues a new one, so a leaked link stays dead. */
  async disableLink(organizationId: string, invoiceId: string) {
    await this.findInvoice(organizationId, invoiceId);
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { publicToken: null } });
    return this.invoicePaymentInfo(organizationId, invoiceId);
  }

  async listAttempts(organizationId: string) {
    const attempts = await this.prisma.paymentAttempt.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { invoice: { select: { id: true, number: true, title: true, clientName: true } } },
    });
    return attempts.map((a) => ({ ...this.attemptView(a), invoice: a.invoice }));
  }

  private attemptView(a: PaymentAttempt) {
    return {
      id: a.id,
      provider: a.provider,
      currency: a.currency,
      amount: Number(a.amount),
      reference: a.reference,
      status: a.status,
      providerReference: a.providerReference,
      payerEmail: a.payerEmail,
      failureReason: a.failureReason,
      createdAt: a.createdAt,
      completedAt: a.completedAt,
    };
  }

  // ─────────────────────────── Public (payer) side ───────────────────────────

  private async invoiceByToken(token: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { publicToken: token },
      include: { ...INVOICE_INCLUDE, organization: { select: { name: true } } },
    });
    if (!invoice) throw new NotFoundException('This payment link is not valid. Please ask for a new one.');
    return invoice;
  }

  /** The client-facing invoice. Internal details (exchange rate, base-currency totals, payment notes) are left out. */
  async publicInvoice(token: string) {
    const invoice = await this.invoiceByToken(token);
    const view = toInvoiceView(invoice);
    const account = await this.accountFor(invoice.organizationId, invoice.currency);

    let unavailableReason: string | null = null;
    if (invoice.status === 'VOID') unavailableReason = 'This invoice has been cancelled.';
    else if (view.balance <= MONEY_TOLERANCE) unavailableReason = 'This invoice is fully paid. Thank you!';
    else if (!account) unavailableReason = `Online payment isn't set up for ${invoice.currency} invoices yet. Please contact ${invoice.organization.name}.`;

    return {
      businessName: invoice.organization.name,
      number: invoiceNumber(invoice.number),
      title: invoice.title,
      clientName: invoice.clientName,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      currency: invoice.currency,
      notes: invoice.notes,
      items: view.items.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice })),
      total: view.total,
      amountPaid: view.amountPaid,
      balance: view.balance,
      onlinePayment: {
        available: !unavailableReason,
        provider: account?.provider ?? null,
        unavailableReason,
      },
    };
  }

  async startPayment(token: string, dto: StartPaymentDto) {
    const invoice = await this.invoiceByToken(token);
    const view = toInvoiceView(invoice);
    if (invoice.status === 'VOID' || invoice.status === 'DRAFT') throw new BadRequestException('This invoice cannot be paid online.');
    if (view.balance <= MONEY_TOLERANCE) throw new BadRequestException('This invoice is already fully paid.');
    const amount = dto.amount ?? view.balance;
    if (amount > view.balance + MONEY_TOLERANCE) {
      throw new BadRequestException(`You can pay at most the outstanding balance of ${view.balance.toFixed(2)}.`);
    }
    const account = await this.accountFor(invoice.organizationId, invoice.currency);
    if (!account) throw new BadRequestException(`Online payment isn't set up for ${invoice.currency} invoices yet.`);

    const reference = `${invoiceNumber(invoice.number)}-${randomBytes(4).toString('hex').toUpperCase()}`;
    const attempt = await this.prisma.paymentAttempt.create({
      data: {
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        paymentAccountId: account.id,
        provider: account.provider,
        currency: invoice.currency,
        amount,
        reference,
        payerEmail: dto.email,
      },
    });

    if (account.provider === 'TEST') {
      const redirectUrl = `${this.webBaseUrl}/pay/test-checkout/${attempt.id}`;
      await this.prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { redirectUrl } });
      return { attemptId: attempt.id, redirectUrl };
    }

    try {
      const result = await this.paynow.initiate(this.credentials(account), {
        reference,
        amount,
        description: `${invoice.organization.name}: invoice ${invoiceNumber(invoice.number)}`,
        returnUrl: `${this.payUrl(token)}?attempt=${attempt.id}`,
        resultUrl: `${this.apiPublicUrl}/public/payments/paynow/result/${attempt.id}`,
        payerEmail: dto.email,
      });
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { redirectUrl: result.redirectUrl, pollUrl: result.pollUrl },
      });
      return { attemptId: attempt.id, redirectUrl: result.redirectUrl };
    } catch (err) {
      const message = err instanceof GatewayError ? err.message : 'The payment could not be started.';
      if (!(err instanceof GatewayError)) this.logger.error(`Paynow initiate failed for ${reference}`, err as Error);
      await this.prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', failureReason: message } });
      throw new BadGatewayException(message);
    }
  }

  /** Status for the payer's return page. A pending Paynow payment is polled (at most every 5s) so it resolves even when the callback can't reach us. */
  async publicAttemptStatus(token: string, attemptId: string) {
    const invoice = await this.invoiceByToken(token);
    let attempt = await this.findAttempt(attemptId);
    if (!attempt || attempt.invoiceId !== invoice.id) throw new NotFoundException('Payment not found.');

    const dueForPoll = !attempt.lastPolledAt || Date.now() - attempt.lastPolledAt.getTime() > POLL_INTERVAL_MS;
    if (attempt.status === 'PENDING' && attempt.provider === 'PAYNOW' && attempt.pollUrl && attempt.paymentAccount && dueForPoll) {
      await this.prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { lastPolledAt: new Date() } });
      try {
        const report = await this.paynow.poll(attempt.pollUrl, this.credentials(attempt.paymentAccount));
        await this.applyReport(attempt, report);
      } catch (err) {
        this.logger.warn(`Polling ${attempt.reference} failed: ${(err as Error).message}`);
      }
      attempt = (await this.findAttempt(attemptId))!;
    }

    const view = toInvoiceView((await this.prisma.invoice.findUnique({ where: { id: invoice.id }, include: INVOICE_INCLUDE }))!);
    return { status: attempt.status, amount: Number(attempt.amount), currency: attempt.currency, balance: view.balance };
  }

  private findAttempt(id: string): Promise<AttemptWithAccount | null> {
    return this.prisma.paymentAttempt.findUnique({ where: { id }, include: { paymentAccount: true } });
  }

  /** Paynow's server-to-server result callback. Anything unauthenticated or inconsistent is logged and ignored. */
  async handlePaynowResult(attemptId: string, pairs: Pairs) {
    const attempt = await this.findAttempt(attemptId);
    if (!attempt || attempt.provider !== 'PAYNOW' || !attempt.paymentAccount) {
      this.logger.warn(`Paynow result for unknown attempt ${attemptId} ignored.`);
      return;
    }
    try {
      const report = this.paynow.readStatus(pairs, this.credentials(attempt.paymentAccount));
      await this.applyReport(attempt, report);
    } catch (err) {
      if (err instanceof UntrustedMessageError) this.logger.warn(`Rejected Paynow result for ${attempt.reference}: ${err.message}`);
      else throw err;
    }
  }

  private async applyReport(attempt: PaymentAttempt, report: StatusReport) {
    if (report.reference !== attempt.reference) {
      this.logger.warn(`Paynow reference mismatch for ${attempt.reference} (got ${report.reference}); ignored.`);
      return;
    }
    if (report.outcome === 'PAID') {
      if (Math.abs(report.amount - Number(attempt.amount)) > MONEY_TOLERANCE) {
        // Money moved but not the amount we asked for: record nothing automatically, flag it for a human.
        this.logger.error(`Paynow amount mismatch for ${attempt.reference}: expected ${attempt.amount}, got ${report.amount}.`);
        await this.prisma.paymentAttempt.updateMany({
          where: { id: attempt.id, status: { not: 'PAID' } },
          data: { failureReason: `Paynow reported ${report.amount.toFixed(2)} paid instead of ${Number(attempt.amount).toFixed(2)}. Check your Paynow account before recording it.` },
        });
        return;
      }
      await this.complete(attempt, report.providerReference);
    } else if (report.outcome === 'FAILED' || report.outcome === 'CANCELLED') {
      await this.prisma.paymentAttempt.updateMany({
        where: { id: attempt.id, status: 'PENDING' },
        data: { status: report.outcome, providerReference: report.providerReference, failureReason: `Paynow status: ${report.rawStatus}` },
      });
    }
  }

  /**
   * Records a confirmed payment on the invoice, exactly once. The conditional
   * update is the guard: Paynow can send the same result several times, and a
   * poll can race a callback. Only the call that flips the attempt to PAID
   * creates the InvoicePayment; every other call finds it already PAID and stops.
   */
  async complete(attempt: PaymentAttempt, providerReference?: string): Promise<boolean> {
    const recorded = await this.prisma.$transaction(async (tx) => {
      const won = await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { not: 'PAID' } },
        data: { status: 'PAID', providerReference, completedAt: new Date(), failureReason: null },
      });
      if (won.count === 0) return false;

      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId: attempt.invoiceId,
          amount: attempt.amount,
          method: attempt.provider === 'PAYNOW' ? 'Paynow (online)' : 'Test payment (online)',
          note: `Online payment ${attempt.reference}${providerReference ? ` · Paynow ref ${providerReference}` : ''}`,
        },
      });
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { invoicePaymentId: payment.id } });

      // The money is real even if the invoice was voided meanwhile, so the payment is
      // always recorded; only a live invoice's status is recalculated.
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: attempt.invoiceId }, include: INVOICE_INCLUDE });
      if (invoice.status !== 'VOID') {
        const { balance } = toInvoiceView(invoice);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: balance <= MONEY_TOLERANCE ? 'PAID' : 'PARTIALLY_PAID' },
        });
      }
      return true;
    });
    // Announced only after the commit, and only by the call that recorded it, so
    // listeners (receipts, alerts) run once per payment and never for a rolled-back one.
    if (recorded) this.events.emit(PAYMENT_RECEIVED, { attemptId: attempt.id } satisfies PaymentReceivedEvent);
    return recorded;
  }

  // ─────────────────────────── Test provider ───────────────────────────

  private async testAttempt(attemptId: string) {
    if (!this.testProviderEnabled) throw new NotFoundException();
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: { invoice: { select: { number: true, publicToken: true, organization: { select: { name: true } } } } },
    });
    if (!attempt || attempt.provider !== 'TEST') throw new NotFoundException('Payment not found.');
    return attempt;
  }

  async testCheckoutInfo(attemptId: string) {
    const attempt = await this.testAttempt(attemptId);
    return {
      businessName: attempt.invoice.organization.name,
      invoiceNumber: invoiceNumber(attempt.invoice.number),
      amount: Number(attempt.amount),
      currency: attempt.currency,
      status: attempt.status,
      returnUrl: attempt.invoice.publicToken ? `${this.payUrl(attempt.invoice.publicToken)}?attempt=${attempt.id}` : null,
    };
  }

  async testCheckoutComplete(attemptId: string, outcome: 'paid' | 'cancelled') {
    const attempt = await this.testAttempt(attemptId);
    if (outcome === 'paid') await this.complete(attempt, `TEST-${attempt.id.slice(0, 8).toUpperCase()}`);
    else {
      await this.prisma.paymentAttempt.updateMany({
        where: { id: attempt.id, status: 'PENDING' },
        data: { status: 'CANCELLED', failureReason: 'Cancelled at the test checkout' },
      });
    }
    return this.testCheckoutInfo(attemptId);
  }
}
