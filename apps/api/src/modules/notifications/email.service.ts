import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailKind, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INVOICE_INCLUDE, toInvoiceView } from '../invoices/invoices.service';
import { PaymentsService } from '../payments/payments.service';
import { SendDocumentEmailDto, type DocumentKind } from './dto/notifications.dto';
import {
  ComposedEmail,
  contractEmail,
  defaultContractMessage,
  defaultInvoiceMessage,
  defaultQuoteMessage,
  invoiceEmail,
  quoteEmail,
  renderHtml,
} from './email-templates';
import { InboxService } from './inbox.service';
import { Mailer } from './mailer';

/** Emitted whenever an email row is created; the worker picks it up and queues delivery. */
export const EMAIL_QUEUED = 'email.queued';
export interface EmailQueuedEvent {
  emailId: string;
}

export const MAX_SEND_ATTEMPTS = 5;

export interface NewEmail extends ComposedEmail {
  organizationId: string;
  kind: EmailKind;
  toEmail: string;
  toName?: string | null;
  replyTo?: string | null;
  invoiceId?: string;
  quoteId?: string;
  contractId?: string;
  createdById?: string;
  dedupeKey?: string;
}

const EMAIL_VIEW = {
  id: true,
  kind: true,
  toEmail: true,
  toName: true,
  subject: true,
  bodyText: true,
  status: true,
  attempts: true,
  lastError: true,
  sentAt: true,
  createdAt: true,
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.EmailMessageSelect;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly inbox: InboxService,
    private readonly mailer: Mailer,
    private readonly events: EventEmitter2,
  ) {}

  // ─────────────────────────── Creating ───────────────────────────

  /**
   * Logs an email and hands it to the queue. With a `dedupeKey`, a second
   * request for the same event is a no-op (returns null) rather than a second email.
   */
  async create(email: NewEmail) {
    try {
      const row = await this.prisma.emailMessage.create({ data: email, select: EMAIL_VIEW });
      this.events.emit(EMAIL_QUEUED, { emailId: row.id } satisfies EmailQueuedEvent);
      return row;
    } catch (err) {
      if (email.dedupeKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
  }

  /** The address clients should reply to: the sender, or for automatic emails the organisation's owner. */
  async ownerReplyTo(organizationId: string): Promise<string | null> {
    const owner = await this.prisma.user.findFirst({
      where: { organizationId, role: UserRole.OWNER },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    });
    return owner?.email ?? null;
  }

  private async organizationName(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
    return org.name;
  }

  // ─────────────────────────── Documents ───────────────────────────

  private async loadDocument(organizationId: string, kind: DocumentKind, documentId: string) {
    if (kind === 'INVOICE') {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: documentId, organizationId }, include: { ...INVOICE_INCLUDE, client: { select: { email: true } } } });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      if (invoice.status === 'VOID') throw new BadRequestException('A voided invoice cannot be sent.');
      return { kind, invoice } as const;
    }
    if (kind === 'QUOTE') {
      const quote = await this.prisma.quote.findFirst({
        where: { id: documentId, organizationId },
        include: { items: { orderBy: { position: 'asc' } }, client: { select: { email: true } } },
      });
      if (!quote) throw new NotFoundException('Quote not found.');
      return { kind, quote } as const;
    }
    const contract = await this.prisma.contract.findFirst({ where: { id: documentId, organizationId }, include: { client: { select: { email: true } } } });
    if (!contract) throw new NotFoundException('Contract not found.');
    if (contract.status === 'CANCELLED') throw new BadRequestException('A cancelled contract cannot be sent.');
    return { kind, contract } as const;
  }

  /** Pre-fills the send form: recipient from the document (or its client), and the default subject and message. */
  async composeDefaults(organizationId: string, kind: DocumentKind, documentId: string) {
    const doc = await this.loadDocument(organizationId, kind, documentId);
    const businessName = await this.organizationName(organizationId);
    if (doc.kind === 'INVOICE') {
      const { invoice } = doc;
      const preview = invoiceEmail({ businessName, clientName: invoice.clientName, number: invoice.number, title: invoice.title, currency: invoice.currency, total: 0, balance: 0, dueDate: null, link: null, payable: false });
      return { to: invoice.clientEmail ?? invoice.client?.email ?? '', toName: invoice.clientName, subject: preview.subject, message: defaultInvoiceMessage(invoice.title), marksSent: invoice.status === 'DRAFT' };
    }
    if (doc.kind === 'QUOTE') {
      const { quote } = doc;
      const preview = quoteEmail({ businessName, clientName: quote.clientName, number: quote.number, title: quote.title, currency: quote.currency, items: [], total: 0, validUntil: null, notes: null });
      return { to: quote.clientEmail ?? quote.client?.email ?? '', toName: quote.clientName, subject: preview.subject, message: defaultQuoteMessage(quote.title), marksSent: quote.status === 'DRAFT' };
    }
    const { contract } = doc;
    const preview = contractEmail({ businessName, clientName: contract.clientName, number: contract.number, title: contract.title, body: '' });
    return { to: contract.clientEmail ?? contract.client?.email ?? '', toName: contract.clientName, subject: preview.subject, message: defaultContractMessage(contract.title), marksSent: contract.status === 'DRAFT' };
  }

  /**
   * Emails a document to the client. Sending a draft marks it as sent (the
   * usual meaning of "send"), and an invoice gets its view/pay link included.
   */
  async sendDocument(organizationId: string, userId: string, dto: SendDocumentEmailDto) {
    const doc = await this.loadDocument(organizationId, dto.kind, dto.documentId);
    const [businessName, sender] = await Promise.all([
      this.organizationName(organizationId),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
    ]);
    const common = { organizationId, toEmail: dto.to, createdById: userId, replyTo: sender.email };

    let composed: ComposedEmail;
    let email: NewEmail;
    if (doc.kind === 'INVOICE') {
      const { invoice } = doc;
      if (invoice.status === 'DRAFT') await this.prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'SENT' } });
      const link = await this.payments.shareableLink(organizationId, invoice.id);
      const view = toInvoiceView(invoice);
      composed = invoiceEmail({
        businessName,
        clientName: invoice.clientName,
        number: invoice.number,
        title: invoice.title,
        currency: invoice.currency,
        total: view.total,
        balance: view.balance,
        dueDate: invoice.dueDate,
        message: dto.message,
        link: link?.url ?? null,
        payable: link?.payable ?? false,
      });
      email = { ...common, ...composed, kind: 'INVOICE', toName: invoice.clientName, invoiceId: invoice.id };
    } else if (doc.kind === 'QUOTE') {
      const { quote } = doc;
      if (quote.status === 'DRAFT') await this.prisma.quote.update({ where: { id: quote.id }, data: { status: 'SENT' } });
      const items = quote.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: Number(i.unitPrice) }));
      composed = quoteEmail({
        businessName,
        clientName: quote.clientName,
        number: quote.number,
        title: quote.title,
        currency: quote.currency,
        items,
        total: Math.round(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100) / 100,
        validUntil: quote.validUntil,
        notes: quote.notes,
        message: dto.message,
      });
      email = { ...common, ...composed, kind: 'QUOTE', toName: quote.clientName, quoteId: quote.id };
    } else {
      const { contract } = doc;
      if (contract.status === 'DRAFT') await this.prisma.contract.update({ where: { id: contract.id }, data: { status: 'SENT' } });
      composed = contractEmail({ businessName, clientName: contract.clientName, number: contract.number, title: contract.title, body: contract.body, message: dto.message });
      email = { ...common, ...composed, kind: 'CONTRACT', toName: contract.clientName, contractId: contract.id };
    }

    if (dto.subject?.trim()) email.subject = dto.subject.trim();
    return this.create(email);
  }

  list(organizationId: string, filter: { invoiceId?: string; quoteId?: string; contractId?: string }) {
    return this.prisma.emailMessage.findMany({
      where: { organizationId, ...filter },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: EMAIL_VIEW,
    });
  }

  /** Sends a failed email again, as it was written. */
  async retry(organizationId: string, id: string) {
    const email = await this.prisma.emailMessage.findFirst({ where: { id, organizationId } });
    if (!email) throw new NotFoundException('Email not found.');
    if (email.status !== 'FAILED') throw new BadRequestException('Only failed emails can be retried.');
    const row = await this.prisma.emailMessage.update({ where: { id }, data: { status: 'PENDING', attempts: 0, lastError: null }, select: EMAIL_VIEW });
    this.events.emit(EMAIL_QUEUED, { emailId: id } satisfies EmailQueuedEvent);
    return row;
  }

  // ─────────────────────────── Delivery (called by the worker) ───────────────────────────

  /**
   * Sends one logged email. Throws on a retryable failure so BullMQ retries
   * with backoff; on the last attempt it marks the email FAILED and tells the
   * sender (or the owners, for automatic emails) instead of throwing.
   */
  async deliver(emailId: string, attempt: number, maxAttempts = MAX_SEND_ATTEMPTS): Promise<void> {
    const email = await this.prisma.emailMessage.findUnique({ where: { id: emailId }, include: { organization: { select: { name: true } } } });
    if (!email || email.status === 'SENT') return;

    await this.prisma.emailMessage.update({ where: { id: emailId }, data: { status: 'SENDING', attempts: attempt } });
    try {
      const messageId = await this.mailer.send({
        fromName: `${email.organization.name} via ArtBH`,
        to: email.toEmail,
        toName: email.toName,
        replyTo: email.replyTo,
        subject: email.subject,
        text: email.bodyText,
        html: renderHtml(email, email.organization.name),
      });
      await this.prisma.emailMessage.update({
        where: { id: emailId },
        data: { status: 'SENT', sentAt: new Date(), providerMessageId: messageId, lastError: null },
      });
    } catch (err) {
      const message = (err as Error).message?.slice(0, 500) || 'Unknown error';
      const final = attempt >= maxAttempts;
      await this.prisma.emailMessage.update({ where: { id: emailId }, data: { status: final ? 'FAILED' : 'PENDING', lastError: message } });
      if (!final) throw err;

      this.logger.error(`Email ${emailId} to ${email.toEmail} failed after ${attempt} attempts: ${message}`);
      const item = {
        type: 'EMAIL_FAILED' as const,
        title: `Email to ${email.toEmail} could not be sent`,
        body: `"${email.subject}" failed after ${attempt} attempts. Open it to retry.`,
        link: email.invoiceId ? '/invoices' : email.quoteId ? '/quotes' : email.contractId ? '/contracts' : undefined,
      };
      if (email.createdById) await this.inbox.notifyUser(email.createdById, email.organizationId, item);
      else await this.inbox.notifyOrganization(email.organizationId, item, [UserRole.OWNER, UserRole.FINANCE]);
    }
  }
}
