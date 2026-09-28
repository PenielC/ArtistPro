import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { EmailService } from './email.service';
import { InboxService } from './inbox.service';
import { Mailer } from './mailer';
import { PaymentEventsListener } from './payment-events.listener';
import { reminderStep, RemindersService, todayIn } from './reminders.service';

type ModelMock = Record<string, jest.Mock>;
const config = (values: Record<string, string> = {}) => ({ get: (k: string) => values[k] }) as unknown as ConfigService;

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    number: 7,
    title: 'Wedding performance',
    clientName: 'Tariro Events',
    clientEmail: 'tariro@events.co.zw',
    client: null,
    currency: 'USD',
    exchangeRate: '1',
    status: 'SENT',
    dueDate: new Date('2026-10-01T00:00:00Z'),
    items: [{ id: 'i1', description: 'Performance', quantity: 1, unitPrice: '1000.00', position: 0 }],
    payments: [],
    ...overrides,
  };
}

describe('reminder timing', () => {
  it('picks the latest reminder day reached, catching up after a missed day but never sending several', () => {
    expect(reminderStep(0, [1, 7, 14])).toBeNull();
    expect(reminderStep(1, [1, 7, 14])).toBe(1);
    expect(reminderStep(3, [1, 7, 14])).toBe(1);
    expect(reminderStep(9, [1, 7, 14])).toBe(7);
    expect(reminderStep(40, [1, 7, 14])).toBe(14);
  });

  it('uses the calendar date in the configured timezone', () => {
    // 23:30 UTC on 30 Sept is already 1 October in Harare (UTC+2).
    expect(new Date(todayIn('Africa/Harare', new Date('2026-09-30T23:30:00Z'))).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(new Date(todayIn('UTC', new Date('2026-09-30T23:30:00Z'))).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });
});

describe('EmailService', () => {
  let prisma: { emailMessage: ModelMock; organization: ModelMock; user: ModelMock; invoice: ModelMock; quote: ModelMock; contract: ModelMock };
  let payments: { shareableLink: jest.Mock };
  let inbox: { notifyUser: jest.Mock; notifyOrganization: jest.Mock };
  let mailer: { send: jest.Mock };
  let events: { emit: jest.Mock };
  let service: EmailService;

  beforeEach(() => {
    prisma = {
      emailMessage: { create: jest.fn().mockResolvedValue({ id: 'em-1' }), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'em-1' }), findMany: jest.fn() },
      organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Moyo Management' }) },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ email: 'rudo@moyo.co.zw' }), findFirst: jest.fn() },
      invoice: { findFirst: jest.fn().mockResolvedValue(invoiceRow()), update: jest.fn() },
      quote: { findFirst: jest.fn(), update: jest.fn() },
      contract: { findFirst: jest.fn(), update: jest.fn() },
    };
    payments = { shareableLink: jest.fn().mockResolvedValue({ url: 'https://app.example.com/pay/tok', payable: true }) };
    inbox = { notifyUser: jest.fn(), notifyOrganization: jest.fn() };
    mailer = { send: jest.fn().mockResolvedValue('<msg-1@mailpit>') };
    events = { emit: jest.fn() };
    service = new EmailService(
      prisma as unknown as PrismaService,
      payments as unknown as PaymentsService,
      inbox as unknown as InboxService,
      mailer as unknown as Mailer,
      events as unknown as EventEmitter2,
    );
  });

  describe('sending documents', () => {
    it('emails an invoice with its pay link, replying to the sender, and queues it', async () => {
      await service.sendDocument('org-1', 'user-1', { kind: 'INVOICE', documentId: 'inv-1', to: 'client@example.com', message: 'Thanks!' });

      const data = prisma.emailMessage.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        organizationId: 'org-1',
        kind: 'INVOICE',
        toEmail: 'client@example.com',
        toName: 'Tariro Events',
        replyTo: 'rudo@moyo.co.zw',
        createdById: 'user-1',
        invoiceId: 'inv-1',
        ctaUrl: 'https://app.example.com/pay/tok',
      });
      expect(data.bodyText).toContain('Thanks!');
      expect(events.emit).toHaveBeenCalledWith('email.queued', { emailId: 'em-1' });
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('marks a draft invoice as sent before creating its link', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'DRAFT' }));
      await service.sendDocument('org-1', 'user-1', { kind: 'INVOICE', documentId: 'inv-1', to: 'c@example.com' });

      expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'SENT' } });
      expect(prisma.invoice.update.mock.invocationCallOrder[0]).toBeLessThan(payments.shareableLink.mock.invocationCallOrder[0]);
    });

    it('refuses a voided invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'VOID' }));
      await expect(service.sendDocument('org-1', 'user-1', { kind: 'INVOICE', documentId: 'inv-1', to: 'c@example.com' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.emailMessage.create).not.toHaveBeenCalled();
    });

    it('sends a quote and marks a draft quote as sent, honouring a custom subject', async () => {
      prisma.quote.findFirst.mockResolvedValue({
        id: 'q-1', number: 3, title: 'Wedding', clientName: 'Tariro', clientEmail: null, client: { email: 'from-client@example.com' }, currency: 'USD',
        status: 'DRAFT', validUntil: null, notes: null, items: [{ description: 'Performance', quantity: 1, unitPrice: '900.00' }],
      });
      await service.sendDocument('org-1', 'user-1', { kind: 'QUOTE', documentId: 'q-1', to: 'x@example.com', subject: '  Your quote  ' });

      expect(prisma.quote.update).toHaveBeenCalledWith({ where: { id: 'q-1' }, data: { status: 'SENT' } });
      const data = prisma.emailMessage.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ kind: 'QUOTE', quoteId: 'q-1', subject: 'Your quote' });
      expect(data.bodyText).toContain('Total: $900.00');
    });

    it('pre-fills the recipient from the linked client when the document has no email', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ clientEmail: null, client: { email: 'client-record@example.com' }, status: 'DRAFT' }));
      const defaults = await service.composeDefaults('org-1', 'INVOICE', 'inv-1');
      expect(defaults).toMatchObject({ to: 'client-record@example.com', subject: 'Invoice INV-0007 from Moyo Management', marksSent: true });
    });
  });

  describe('create', () => {
    it('treats a duplicate automatic email as already sent', async () => {
      prisma.emailMessage.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }));
      const result = await service.create({ organizationId: 'org-1', kind: 'PAYMENT_RECEIPT', toEmail: 'a@b.co', subject: 's', bodyText: 'b', dedupeKey: 'receipt:att-1' });
      expect(result).toBeNull();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('deliver', () => {
    const row = { id: 'em-1', organizationId: 'org-1', status: 'PENDING', toEmail: 'c@example.com', toName: 'Tariro', replyTo: 'rudo@moyo.co.zw', subject: 'Invoice', bodyText: 'Hello <there>', ctaUrl: null, ctaLabel: null, createdById: 'user-1', invoiceId: 'inv-1', quoteId: null, contractId: null, organization: { name: 'Moyo Management' } };

    it('sends via SMTP as "<org> via ArtBH" and marks it sent', async () => {
      prisma.emailMessage.findUnique.mockResolvedValue(row);
      await service.deliver('em-1', 1);

      const mail = mailer.send.mock.calls[0][0];
      expect(mail).toMatchObject({ fromName: 'Moyo Management via ArtBH', to: 'c@example.com', replyTo: 'rudo@moyo.co.zw', text: 'Hello <there>' });
      expect(mail.html).toContain('Hello &lt;there&gt;');
      expect(prisma.emailMessage.update.mock.calls.at(-1)[0].data).toMatchObject({ status: 'SENT', providerMessageId: '<msg-1@mailpit>' });
    });

    it('never sends an email twice', async () => {
      prisma.emailMessage.findUnique.mockResolvedValue({ ...row, status: 'SENT' });
      await service.deliver('em-1', 2);
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('rethrows a failure so the queue retries, keeping it pending', async () => {
      prisma.emailMessage.findUnique.mockResolvedValue(row);
      mailer.send.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.deliver('em-1', 2, 5)).rejects.toThrow('ECONNREFUSED');
      expect(prisma.emailMessage.update.mock.calls.at(-1)[0].data).toEqual({ status: 'PENDING', lastError: 'ECONNREFUSED' });
      expect(inbox.notifyUser).not.toHaveBeenCalled();
    });

    it('on the last attempt marks it failed and tells the sender instead of retrying', async () => {
      prisma.emailMessage.findUnique.mockResolvedValue(row);
      mailer.send.mockRejectedValue(new Error('550 mailbox unavailable'));

      await expect(service.deliver('em-1', 5, 5)).resolves.toBeUndefined();
      expect(prisma.emailMessage.update.mock.calls.at(-1)[0].data).toEqual({ status: 'FAILED', lastError: '550 mailbox unavailable' });
      expect(inbox.notifyUser).toHaveBeenCalledWith('user-1', 'org-1', expect.objectContaining({ type: 'EMAIL_FAILED', link: '/invoices' }));
    });

    it('tells the owners when an automatic email fails', async () => {
      prisma.emailMessage.findUnique.mockResolvedValue({ ...row, createdById: null });
      mailer.send.mockRejectedValue(new Error('boom'));
      await service.deliver('em-1', 5, 5);
      expect(inbox.notifyOrganization).toHaveBeenCalledWith('org-1', expect.objectContaining({ type: 'EMAIL_FAILED' }), ['OWNER', 'FINANCE']);
    });
  });

  it('only retries failed emails', async () => {
    prisma.emailMessage.findFirst.mockResolvedValue({ id: 'em-1', status: 'SENT' });
    await expect(service.retry('org-1', 'em-1')).rejects.toBeInstanceOf(BadRequestException);

    prisma.emailMessage.findFirst.mockResolvedValue({ id: 'em-1', status: 'FAILED' });
    await service.retry('org-1', 'em-1');
    expect(prisma.emailMessage.update.mock.calls[0][0].data).toEqual({ status: 'PENDING', attempts: 0, lastError: null });
    expect(events.emit).toHaveBeenCalledWith('email.queued', { emailId: 'em-1' });
  });
});

describe('RemindersService', () => {
  let prisma: { organization: ModelMock; invoice: ModelMock };
  let emails: { create: jest.Mock; ownerReplyTo: jest.Mock };
  let inbox: { notifyOrganization: jest.Mock };
  let service: RemindersService;
  const now = new Date('2026-10-08T06:00:00Z'); // 8 Oct in Harare → 7 days after a 1 Oct due date

  beforeEach(() => {
    prisma = {
      organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Moyo Management', reminderDays: [1, 7, 14] }), findMany: jest.fn() },
      invoice: { findMany: jest.fn().mockResolvedValue([invoiceRow()]) },
    };
    emails = { create: jest.fn().mockResolvedValue({ id: 'em-1' }), ownerReplyTo: jest.fn().mockResolvedValue('rudo@moyo.co.zw') };
    inbox = { notifyOrganization: jest.fn() };
    const payments = { shareableLink: jest.fn().mockResolvedValue({ url: 'https://app.example.com/pay/tok', payable: true }) };
    service = new RemindersService(
      prisma as unknown as PrismaService,
      emails as unknown as EmailService,
      payments as unknown as PaymentsService,
      inbox as unknown as InboxService,
      config({ REMINDERS_TZ: 'Africa/Harare' }),
    );
  });

  it('sends the 7-day reminder once, keyed so it cannot repeat, and tells the owners', async () => {
    const result = await service.runForOrganization('org-1', now);

    expect(prisma.invoice.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org-1', status: { in: ['SENT', 'PARTIALLY_PAID'] } });
    const email = emails.create.mock.calls[0][0];
    expect(email).toMatchObject({ kind: 'INVOICE_REMINDER', toEmail: 'tariro@events.co.zw', dedupeKey: 'reminder:inv-1:7', replyTo: 'rudo@moyo.co.zw' });
    expect(email.bodyText).toContain('7 days ago');
    expect(result).toEqual({ sent: 1, skippedNoEmail: 0 });
    expect(inbox.notifyOrganization).toHaveBeenCalledWith('org-1', expect.objectContaining({ type: 'REMINDERS_SENT', title: 'Sent 1 overdue reminder' }), ['OWNER', 'FINANCE']);
  });

  it('counts a reminder already sent (dedupe hit) as not sent', async () => {
    emails.create.mockResolvedValue(null);
    expect(await service.runForOrganization('org-1', now)).toEqual({ sent: 0, skippedNoEmail: 0 });
    expect(inbox.notifyOrganization).not.toHaveBeenCalled();
  });

  it('skips fully paid invoices and reports ones with no client email', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      invoiceRow({ id: 'paid', payments: [{ id: 'p', amount: '1000.00', paidAt: new Date(), voidedAt: null }] }),
      invoiceRow({ id: 'no-email', clientEmail: null, client: null }),
    ]);
    expect(await service.runForOrganization('org-1', now)).toEqual({ sent: 0, skippedNoEmail: 1 });
    expect(emails.create).not.toHaveBeenCalled();
  });

  it('keeps going when one organisation fails', async () => {
    prisma.organization.findMany.mockResolvedValue([{ id: 'broken' }, { id: 'org-1' }]);
    prisma.organization.findUniqueOrThrow.mockRejectedValueOnce(new Error('boom'));
    expect(await service.runForAll(now)).toEqual({ sent: 1, skippedNoEmail: 0 });
  });
});

describe('PaymentEventsListener', () => {
  let prisma: { paymentAttempt: ModelMock; user: ModelMock };
  let emails: { create: jest.Mock; ownerReplyTo: jest.Mock };
  let inbox: { notifyOrganization: jest.Mock };
  let listener: PaymentEventsListener;

  const attempt = {
    id: 'att-1',
    status: 'PAID',
    amount: '400.00',
    currency: 'USD',
    provider: 'PAYNOW',
    reference: 'INV-0007-AB12',
    providerReference: '998877',
    payerEmail: 'payer@example.com',
    invoice: { ...invoiceRow({ payments: [{ id: 'p', amount: '400.00', paidAt: new Date(), voidedAt: null }] }), organization: { name: 'Moyo Management' } },
  };

  beforeEach(() => {
    prisma = {
      paymentAttempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u-owner', email: 'rudo@moyo.co.zw', firstName: 'Rudo' }]) },
    };
    emails = { create: jest.fn().mockResolvedValue({ id: 'em' }), ownerReplyTo: jest.fn().mockResolvedValue('rudo@moyo.co.zw') };
    inbox = { notifyOrganization: jest.fn() };
    const payments = { shareableLink: jest.fn().mockResolvedValue({ url: 'https://app.example.com/pay/tok', payable: true }) };
    listener = new PaymentEventsListener(
      prisma as unknown as PrismaService,
      emails as unknown as EmailService,
      payments as unknown as PaymentsService,
      inbox as unknown as InboxService,
      config({ WEB_BASE_URL: 'https://app.example.com' }),
    );
  });

  it('sends the payer a receipt and each owner an alert, each keyed to the payment', async () => {
    await listener.onPaymentReceived({ attemptId: 'att-1' });

    const [receipt, alert] = emails.create.mock.calls.map((c) => c[0]);
    expect(receipt).toMatchObject({ kind: 'PAYMENT_RECEIPT', toEmail: 'payer@example.com', dedupeKey: 'receipt:att-1', replyTo: 'rudo@moyo.co.zw' });
    expect(receipt.bodyText).toContain('Remaining balance: $600.00.');
    expect(receipt.bodyText).toContain('Payment reference: 998877 (Paynow)');
    expect(alert).toMatchObject({ kind: 'PAYMENT_ALERT', toEmail: 'rudo@moyo.co.zw', dedupeKey: 'payment-alert:att-1:u-owner', ctaUrl: 'https://app.example.com/invoices' });
    expect(prisma.user.findMany.mock.calls[0][0].where.role).toEqual({ in: ['OWNER', 'FINANCE'] });
    expect(inbox.notifyOrganization).toHaveBeenCalledWith('org-1', expect.objectContaining({ type: 'PAYMENT_RECEIVED', title: 'Tariro Events paid $400.00' }));
  });

  it('falls back to the invoice email, and skips the receipt if there is no address at all', async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue({ ...attempt, payerEmail: null });
    await listener.onPaymentReceived({ attemptId: 'att-1' });
    expect(emails.create.mock.calls[0][0].toEmail).toBe('tariro@events.co.zw');

    emails.create.mockClear();
    prisma.paymentAttempt.findUnique.mockResolvedValue({ ...attempt, payerEmail: null, invoice: { ...attempt.invoice, clientEmail: null, client: null } });
    await listener.onPaymentReceived({ attemptId: 'att-1' });
    expect(emails.create.mock.calls.map((c) => c[0].kind)).toEqual(['PAYMENT_ALERT']);
  });

  it('never lets a notification failure escape into the payment flow', async () => {
    emails.create.mockRejectedValue(new Error('db down'));
    await expect(listener.onPaymentReceived({ attemptId: 'att-1' })).resolves.toBeUndefined();
  });
});
