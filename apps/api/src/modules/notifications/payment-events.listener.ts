import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INVOICE_INCLUDE, toInvoiceView } from '../invoices/invoices.service';
import { PAYMENT_RECEIVED, PaymentsService, type PaymentReceivedEvent } from '../payments/payments.service';
import { money, paymentAlertEmail, paymentReceiptEmail } from './email-templates';
import { EmailService } from './email.service';
import { InboxService } from './inbox.service';

const PROVIDER_LABELS = { PAYNOW: 'Paynow', TEST: 'Test payment' } as const;

/** Reacts to confirmed online payments: a receipt for the payer, an alert for the owners. */
@Injectable()
export class PaymentEventsListener {
  private readonly logger = new Logger(PaymentEventsListener.name);
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailService,
    private readonly payments: PaymentsService,
    private readonly inbox: InboxService,
    config: ConfigService,
  ) {
    this.webBaseUrl = (config.get<string>('WEB_BASE_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  @OnEvent(PAYMENT_RECEIVED, { async: true })
  async onPaymentReceived(event: PaymentReceivedEvent) {
    try {
      await this.handle(event);
    } catch (err) {
      // The payment is already recorded; a notification problem must never surface as a payment error.
      this.logger.error(`Payment notifications failed for attempt ${event.attemptId}`, err as Error);
    }
  }

  async handle({ attemptId }: PaymentReceivedEvent) {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        invoice: { include: { ...INVOICE_INCLUDE, client: { select: { email: true } }, organization: { select: { name: true } } } },
      },
    });
    if (!attempt || attempt.status !== 'PAID') return;
    const { invoice } = attempt;
    const amount = Number(attempt.amount);
    const { balance } = toInvoiceView(invoice);
    const link = await this.payments.shareableLink(invoice.organizationId, invoice.id);
    const details = {
      businessName: invoice.organization.name,
      clientName: invoice.clientName,
      invoiceNumber: invoice.number,
      invoiceTitle: invoice.title,
      amount,
      currency: attempt.currency,
      balance,
      reference: attempt.providerReference ?? attempt.reference,
      providerLabel: PROVIDER_LABELS[attempt.provider],
      link: link?.url ?? null,
    };

    const payerEmail = attempt.payerEmail ?? invoice.clientEmail ?? invoice.client?.email;
    if (payerEmail) {
      await this.emails.create({
        ...paymentReceiptEmail(details),
        organizationId: invoice.organizationId,
        kind: 'PAYMENT_RECEIPT',
        toEmail: payerEmail,
        toName: invoice.clientName,
        replyTo: await this.emails.ownerReplyTo(invoice.organizationId),
        invoiceId: invoice.id,
        dedupeKey: `receipt:${attempt.id}`,
      });
    }

    const recipients = await this.prisma.user.findMany({
      where: { organizationId: invoice.organizationId, role: { in: [UserRole.OWNER, UserRole.FINANCE] } },
      select: { id: true, email: true, firstName: true },
    });
    for (const user of recipients) {
      await this.emails.create({
        ...paymentAlertEmail({ ...details, recipientName: user.firstName, dashboardUrl: `${this.webBaseUrl}/invoices` }),
        organizationId: invoice.organizationId,
        kind: 'PAYMENT_ALERT',
        toEmail: user.email,
        invoiceId: invoice.id,
        dedupeKey: `payment-alert:${attempt.id}:${user.id}`,
      });
    }

    await this.inbox.notifyOrganization(invoice.organizationId, {
      type: 'PAYMENT_RECEIVED',
      title: `${invoice.clientName} paid ${money(amount, attempt.currency)}`,
      body: `Invoice INV-${String(invoice.number).padStart(4, '0')} · ${balance > 0.005 ? `${money(balance, attempt.currency)} still due` : 'now fully paid'}`,
      link: '/invoices',
    });
  }
}
