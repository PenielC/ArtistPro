import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SecretBox } from './crypto';
import { GatewayError } from './gateways/gateway.types';
import { paynowHash, PaynowGateway, type Pairs } from './gateways/paynow.gateway';
import { PaymentsService } from './payments.service';

const ENC_KEY = randomBytes(32).toString('base64');
const box = new SecretBox(ENC_KEY);
const MERCHANT_KEY = 'merchant-integration-key';

function config(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    PAYMENTS_ENCRYPTION_KEY: ENC_KEY,
    WEB_BASE_URL: 'https://app.example.com',
    API_PUBLIC_URL: 'https://api.example.com',
    PAYMENTS_TEST_PROVIDER: 'false',
    ...overrides,
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    number: 7,
    title: 'Wedding performance',
    clientName: 'Tariro Events',
    currency: 'USD',
    exchangeRate: '1',
    status: 'SENT',
    issueDate: new Date('2026-09-01'),
    dueDate: null,
    notes: '50% deposit',
    publicToken: 'tok',
    items: [{ id: 'i1', description: 'Performance', quantity: 1, unitPrice: '1000.00', position: 0 }],
    payments: [{ id: 'p1', amount: '400.00', paidAt: new Date(), voidedAt: null, method: 'Cash', note: 'internal note' }],
    organization: { name: 'Moyo Management' },
    ...overrides,
  };
}

const paynowAccount = {
  id: 'acc-1',
  organizationId: 'org-1',
  provider: 'PAYNOW',
  currency: 'USD',
  integrationId: '1201',
  integrationKeyEncrypted: box.encrypt(MERCHANT_KEY),
};

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    organizationId: 'org-1',
    invoiceId: 'inv-1',
    paymentAccountId: 'acc-1',
    provider: 'PAYNOW',
    currency: 'USD',
    amount: '600.00',
    reference: 'INV-0007-AB12CD34',
    status: 'PENDING',
    pollUrl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=1',
    lastPolledAt: null,
    paymentAccount: paynowAccount,
    ...overrides,
  };
}

function signedPairs(fields: Pairs, key = MERCHANT_KEY): Pairs {
  return [...fields, ['hash', paynowHash(fields.map(([, v]) => v), key)]];
}

describe('PaymentsService', () => {
  type ModelMock = Record<string, jest.Mock>;
  let prisma: { paymentAccount: ModelMock; paymentAttempt: ModelMock; invoice: ModelMock; invoicePayment: ModelMock; $transaction: jest.Mock };
  let paynow: { initiate: jest.Mock; poll: jest.Mock; readStatus: PaynowGateway['readStatus'] };
  let service: PaymentsService;
  let events: { emit: jest.Mock };

  beforeEach(() => {
    prisma = {
      paymentAccount: { findMany: jest.fn().mockResolvedValue([paynowAccount]), findFirst: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
      paymentAttempt: {
        create: jest.fn().mockResolvedValue({ id: 'att-1' }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      invoice: {
        findUnique: jest.fn().mockResolvedValue(invoiceRow()),
        findFirst: jest.fn().mockResolvedValue(invoiceRow()),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      invoicePayment: { create: jest.fn().mockResolvedValue({ id: 'pay-new' }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    events = { emit: jest.fn() };
    const real = new PaynowGateway('https://www.paynow.co.zw');
    paynow = { initiate: jest.fn(), poll: jest.fn(), readStatus: real.readStatus.bind(real) };
    service = new PaymentsService(prisma as unknown as PrismaService, config(), paynow as unknown as PaynowGateway, events as unknown as EventEmitter2);
  });

  describe('merchant accounts', () => {
    it('stores the integration key encrypted and never returns it', async () => {
      prisma.paymentAccount.findMany.mockResolvedValue([{ id: 'acc-1', provider: 'PAYNOW', currency: 'USD', integrationId: '1201' }]);

      const result = await service.saveAccount('org-1', { provider: 'PAYNOW', currency: 'USD', integrationId: '1201', integrationKey: ` ${MERCHANT_KEY} ` });

      const stored = prisma.paymentAccount.upsert.mock.calls[0][0].create.integrationKeyEncrypted;
      expect(stored).not.toContain(MERCHANT_KEY);
      expect(box.decrypt(stored)).toBe(MERCHANT_KEY);
      expect(JSON.stringify(result)).not.toContain('integrationKey');
      expect(prisma.paymentAccount.findMany.mock.calls[0][0].select).not.toHaveProperty('integrationKeyEncrypted');
    });

    it('requires both Paynow credentials', async () => {
      await expect(service.saveAccount('org-1', { provider: 'PAYNOW', currency: 'USD', integrationId: '1201' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses the test provider unless the server enables it', async () => {
      await expect(service.saveAccount('org-1', { provider: 'TEST', currency: 'USD' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to store keys when no encryption key is configured', async () => {
      const unconfigured = new PaymentsService(prisma as unknown as PrismaService, config({ PAYMENTS_ENCRYPTION_KEY: undefined }), paynow as unknown as PaynowGateway, events as unknown as EventEmitter2);
      await expect(
        unconfigured.saveAccount('org-1', { provider: 'PAYNOW', currency: 'USD', integrationId: '1', integrationKey: 'abcdefghij' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('payment links', () => {
    it('only issues links for sent invoices, and keeps an existing token', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ status: 'DRAFT', publicToken: null }));
      await expect(service.enableLink('org-1', 'inv-1')).rejects.toBeInstanceOf(BadRequestException);

      prisma.invoice.findFirst.mockResolvedValue(invoiceRow({ publicToken: 'existing' }));
      const info = await service.enableLink('org-1', 'inv-1');
      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(info.link).toBe('https://app.example.com/pay/existing');
    });

    it('generates an unguessable token', async () => {
      prisma.invoice.findFirst.mockResolvedValueOnce(invoiceRow({ publicToken: null }));
      await service.enableLink('org-1', 'inv-1');
      expect(prisma.invoice.update.mock.calls[0][0].data.publicToken).toMatch(/^[\w-]{32}$/);
    });
  });

  describe('public invoice', () => {
    it('shows the client what they owe, without internal payment details or exchange rates', async () => {
      const view = await service.publicInvoice('tok');

      expect(view).toMatchObject({ businessName: 'Moyo Management', number: 'INV-0007', total: 1000, amountPaid: 400, balance: 600 });
      expect(view.onlinePayment).toEqual({ available: true, provider: 'PAYNOW', unavailableReason: null });
      const json = JSON.stringify(view);
      for (const hidden of ['exchangeRate', 'internal note', 'organizationId', 'publicToken', 'Cash']) expect(json).not.toContain(hidden);
    });

    it('explains why online payment is unavailable', async () => {
      prisma.paymentAccount.findMany.mockResolvedValue([]);
      expect((await service.publicInvoice('tok')).onlinePayment.unavailableReason).toMatch(/isn't set up for USD/);
    });
  });

  describe('startPayment', () => {
    it('defaults to the full balance and sends signed-off URLs to Paynow', async () => {
      paynow.initiate.mockResolvedValue({ redirectUrl: 'https://www.paynow.co.zw/pay/1', pollUrl: 'https://www.paynow.co.zw/poll/1' });

      const result = await service.startPayment('tok', { email: 'client@example.com' });

      expect(prisma.paymentAttempt.create.mock.calls[0][0].data).toMatchObject({ amount: 600, provider: 'PAYNOW', invoiceId: 'inv-1' });
      const [creds, req] = paynow.initiate.mock.calls[0];
      expect(creds).toEqual({ integrationId: '1201', integrationKey: MERCHANT_KEY });
      expect(req.reference).toMatch(/^INV-0007-[0-9A-F]{8}$/);
      expect(req.returnUrl).toBe('https://app.example.com/pay/tok?attempt=att-1');
      expect(req.resultUrl).toBe('https://api.example.com/public/payments/paynow/result/att-1');
      expect(result).toEqual({ attemptId: 'att-1', redirectUrl: 'https://www.paynow.co.zw/pay/1' });
    });

    it('rejects more than the balance, and paid or voided invoices', async () => {
      await expect(service.startPayment('tok', { amount: 600.5 })).rejects.toBeInstanceOf(BadRequestException);
      prisma.invoice.findUnique.mockResolvedValue(invoiceRow({ status: 'VOID' }));
      await expect(service.startPayment('tok', {})).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
    });

    it('marks the attempt failed and reports the provider error', async () => {
      paynow.initiate.mockRejectedValue(new GatewayError('Paynow declined the request: Invalid Id.'));

      await expect(service.startPayment('tok', {})).rejects.toThrow(new BadGatewayException('Paynow declined the request: Invalid Id.'));
      expect(prisma.paymentAttempt.update.mock.calls[0][0].data).toEqual({ status: 'FAILED', failureReason: 'Paynow declined the request: Invalid Id.' });
    });
  });

  describe('confirming payments', () => {
    const paid: Pairs = [
      ['reference', 'INV-0007-AB12CD34'],
      ['paynowreference', '998877'],
      ['amount', '600.00'],
      ['status', 'Paid'],
    ];

    beforeEach(() => {
      prisma.paymentAttempt.findUnique.mockResolvedValue(attemptRow());
      prisma.invoice.findUniqueOrThrow.mockResolvedValue(
        invoiceRow({ payments: [...invoiceRow().payments, { id: 'pay-new', amount: '600.00', paidAt: new Date(), voidedAt: null }] }),
      );
    });

    it('records a verified Paynow payment on the invoice and marks it paid', async () => {
      await service.handlePaynowResult('att-1', signedPairs(paid));

      expect(prisma.paymentAttempt.updateMany.mock.calls[0][0].where).toEqual({ id: 'att-1', status: { not: 'PAID' } });
      expect(prisma.invoicePayment.create.mock.calls[0][0].data).toMatchObject({ invoiceId: 'inv-1', amount: '600.00', method: 'Paynow (online)' });
      expect(prisma.paymentAttempt.update.mock.calls[0][0].data).toEqual({ invoicePaymentId: 'pay-new' });
      expect(prisma.invoice.update.mock.calls[0][0].data).toEqual({ status: 'PAID' });
    });

    it('records nothing for a duplicate callback (the attempt was already paid)', async () => {
      prisma.paymentAttempt.updateMany.mockResolvedValue({ count: 0 });

      await service.handlePaynowResult('att-1', signedPairs(paid));

      expect(prisma.invoicePayment.create).not.toHaveBeenCalled();
      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('announces payment.received once the payment is recorded', async () => {
      await service.handlePaynowResult('att-1', signedPairs(paid));
      expect(events.emit).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith('payment.received', { attemptId: 'att-1' });
    });

    it('does not announce a payment whose transaction failed', async () => {
      prisma.invoicePayment.create.mockRejectedValue(new Error('db down'));
      await expect(service.complete(attemptRow() as never)).rejects.toThrow('db down');
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('ignores a forged callback', async () => {
      await service.handlePaynowResult('att-1', signedPairs(paid, 'not-the-merchant-key'));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ignores a callback for a different reference', async () => {
      await service.handlePaynowResult('att-1', signedPairs([['reference', 'INV-0001-OTHER'], ...paid.slice(1)]));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not record a payment whose amount differs, and flags it for review', async () => {
      await service.handlePaynowResult('att-1', signedPairs([paid[0], paid[1], ['amount', '6.00'], paid[3]]));

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.paymentAttempt.updateMany.mock.calls[0][0].data.failureReason).toMatch(/6\.00 paid instead of 600\.00/);
    });

    it('marks a cancelled payment without touching the invoice', async () => {
      await service.handlePaynowResult('att-1', signedPairs([paid[0], paid[1], paid[2], ['status', 'Cancelled']]));

      expect(prisma.paymentAttempt.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'att-1', status: 'PENDING' }, data: { status: 'CANCELLED' } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('records the money but keeps the status of an invoice voided meanwhile', async () => {
      prisma.invoice.findUniqueOrThrow.mockResolvedValue(invoiceRow({ status: 'VOID' }));

      await service.handlePaynowResult('att-1', signedPairs(paid));

      expect(prisma.invoicePayment.create).toHaveBeenCalled();
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('marks a partial payment as partially paid', async () => {
      prisma.invoice.findUniqueOrThrow.mockResolvedValue(invoiceRow());
      await service.complete(attemptRow({ amount: '100.00' }) as never);
      expect(prisma.invoice.update.mock.calls[0][0].data).toEqual({ status: 'PARTIALLY_PAID' });
    });

    it('polls a pending payment from the return page, but not more than every 5 seconds', async () => {
      paynow.poll.mockResolvedValue({ reference: 'INV-0007-AB12CD34', amount: 600, outcome: 'PAID', rawStatus: 'Paid', providerReference: '998877' });

      await service.publicAttemptStatus('tok', 'att-1');
      expect(paynow.poll).toHaveBeenCalledWith('https://www.paynow.co.zw/Interface/CheckPayment/?guid=1', { integrationId: '1201', integrationKey: MERCHANT_KEY });
      expect(prisma.invoicePayment.create).toHaveBeenCalled();

      prisma.paymentAttempt.findUnique.mockResolvedValue(attemptRow({ lastPolledAt: new Date() }));
      paynow.poll.mockClear();
      await service.publicAttemptStatus('tok', 'att-1');
      expect(paynow.poll).not.toHaveBeenCalled();
    });

    it('does not reveal an attempt through another invoice\'s link', async () => {
      prisma.paymentAttempt.findUnique.mockResolvedValue(attemptRow({ invoiceId: 'someone-elses-invoice' }));
      await expect(service.publicAttemptStatus('tok', 'att-1')).rejects.toThrow('Payment not found.');
    });
  });
});
