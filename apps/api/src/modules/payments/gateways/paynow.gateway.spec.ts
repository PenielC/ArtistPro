import { randomBytes } from 'crypto';
import { SecretBox } from '../crypto';
import { GatewayError, UntrustedMessageError } from './gateway.types';
import { hasValidHash, parseForm, paynowHash, PaynowGateway, toOutcome, type Pairs } from './paynow.gateway';

const KEY = '3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977';
const creds = { integrationId: '1201', integrationKey: KEY };

/** Builds a form body signed the way Paynow signs its messages. */
function signed(fields: Pairs, key = KEY): string {
  return new URLSearchParams([...fields, ['hash', paynowHash(fields.map(([, v]) => v), key)]]).toString();
}

function fakeFetch(responseBody: string) {
  return jest.fn().mockResolvedValue({ text: async () => responseBody } as Response);
}

describe('paynowHash', () => {
  it('reproduces the worked example from the Paynow developer docs exactly', () => {
    const values = [
      '1201',
      'TEST REF',
      '99.99',
      'A test ticket transaction',
      'http://www.google.com/search?q=returnurl',
      'http://www.google.com/search?q=resulturl',
      'Message',
    ];
    expect(paynowHash(values, KEY)).toBe(
      '2A033FC38798D913D42ECB786B9B19645ADEDBDE788862032F1BD82CF3B92DEF84F316385D5B40DBB35F1A4FD7D5BFE73835174136463CDD48C9366B0749C689',
    );
  });
});

describe('hash verification', () => {
  const fields: Pairs = [
    ['reference', 'INV-0001-AB12'],
    ['amount', '100.00'],
    ['status', 'Paid'],
  ];

  it('accepts a correctly signed message, with keys in any case', () => {
    expect(hasValidHash(parseForm(signed(fields)), KEY)).toBe(true);
    expect(hasValidHash(parseForm(signed(fields).replace('status=', 'Status=')), KEY)).toBe(true);
  });

  it('rejects tampering, a wrong key, reordering and a missing hash', () => {
    expect(hasValidHash(parseForm(signed(fields).replace('100.00', '1.00')), KEY)).toBe(false);
    expect(hasValidHash(parseForm(signed(fields, 'someone-elses-key')), KEY)).toBe(false);
    const [ref, amount, status, hash] = parseForm(signed(fields));
    expect(hasValidHash([amount, ref, status, hash], KEY)).toBe(false);
    expect(hasValidHash(fields, KEY)).toBe(false);
  });
});

describe('toOutcome', () => {
  it('treats Paid, Awaiting Delivery and Delivered as paid; leaves disputes and refunds alone', () => {
    expect(['Paid', 'Awaiting Delivery', 'Delivered'].map(toOutcome)).toEqual(['PAID', 'PAID', 'PAID']);
    expect(toOutcome('Cancelled')).toBe('CANCELLED');
    expect(toOutcome('Sent')).toBe('PENDING');
    expect(toOutcome('Disputed')).toBeNull();
    expect(toOutcome('Refunded')).toBeNull();
  });
});

describe('PaynowGateway.initiate', () => {
  const request = {
    reference: 'INV-0007-AB12CD34',
    amount: 250,
    description: 'Moyo Management: invoice INV-0007',
    returnUrl: 'https://app.example.com/pay/tok?attempt=a1',
    resultUrl: 'https://api.example.com/public/payments/paynow/result/a1',
    payerEmail: 'client@example.com',
  };

  it('posts the documented fields in order, signed, to /interface/initiatetransaction', async () => {
    const fetchImpl = fakeFetch(signed([['status', 'Ok'], ['browserurl', 'https://www.paynow.co.zw/Payment/ConfirmPayment/1'], ['pollurl', 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=1']]));
    const gateway = new PaynowGateway('https://www.paynow.co.zw', fetchImpl);

    const result = await gateway.initiate(creds, request);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://www.paynow.co.zw/interface/initiatetransaction');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const sent = parseForm(init.body);
    expect(sent.map(([k]) => k)).toEqual(['id', 'reference', 'amount', 'additionalinfo', 'returnurl', 'resulturl', 'authemail', 'status', 'hash']);
    expect(sent.find(([k]) => k === 'amount')![1]).toBe('250.00');
    expect(hasValidHash(sent, KEY)).toBe(true);
    expect(result).toEqual({
      redirectUrl: 'https://www.paynow.co.zw/Payment/ConfirmPayment/1',
      pollUrl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=1',
    });
  });

  it('surfaces a Paynow error message', async () => {
    const gateway = new PaynowGateway('https://www.paynow.co.zw', fakeFetch('status=Error&error=Invalid+Id.'));
    await expect(gateway.initiate(creds, request)).rejects.toThrow(new GatewayError('Paynow declined the request: Invalid Id.'));
  });

  it('refuses to redirect the payer on an unverified "Ok" response', async () => {
    const forged = signed([['status', 'Ok'], ['browserurl', 'https://evil.example.com/pay']], 'wrong-key');
    const gateway = new PaynowGateway('https://www.paynow.co.zw', fakeFetch(forged));
    await expect(gateway.initiate(creds, request)).rejects.toBeInstanceOf(GatewayError);
  });

  it('reports an unreachable Paynow as a gateway error', async () => {
    const gateway = new PaynowGateway('https://www.paynow.co.zw', jest.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(gateway.initiate(creds, request)).rejects.toBeInstanceOf(GatewayError);
  });
});

describe('PaynowGateway status', () => {
  const statusFields: Pairs = [
    ['reference', 'INV-0007-AB12CD34'],
    ['paynowreference', '123456'],
    ['amount', '250.00'],
    ['status', 'Awaiting Delivery'],
    ['pollurl', 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=1'],
  ];

  it('reads a signed status message', () => {
    const gateway = new PaynowGateway('https://www.paynow.co.zw');
    expect(gateway.readStatus(parseForm(signed(statusFields)), creds)).toEqual({
      reference: 'INV-0007-AB12CD34',
      providerReference: '123456',
      amount: 250,
      rawStatus: 'Awaiting Delivery',
      outcome: 'PAID',
      pollUrl: 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=1',
    });
  });

  it('rejects an unsigned or forged status message', () => {
    const gateway = new PaynowGateway('https://www.paynow.co.zw');
    expect(() => gateway.readStatus(statusFields, creds)).toThrow(UntrustedMessageError);
    expect(() => gateway.readStatus(parseForm(signed(statusFields, 'forged')), creds)).toThrow(UntrustedMessageError);
  });

  it('polls with an empty POST, but never off the Paynow host', async () => {
    const fetchImpl = fakeFetch(signed(statusFields));
    const gateway = new PaynowGateway('https://www.paynow.co.zw', fetchImpl);

    const report = await gateway.poll('https://www.paynow.co.zw/Interface/CheckPayment/?guid=1', creds);
    expect(report.outcome).toBe('PAID');
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST');

    await expect(gateway.poll('http://169.254.169.254/latest/meta-data', creds)).rejects.toBeInstanceOf(UntrustedMessageError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('SecretBox', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips, and produces different ciphertext each time', () => {
    const box = new SecretBox(key);
    const a = box.encrypt('integration-key-123');
    expect(box.decrypt(a)).toBe('integration-key-123');
    expect(box.encrypt('integration-key-123')).not.toBe(a);
    expect(a).not.toContain('integration-key-123');
  });

  it('detects tampering and a different key', () => {
    const box = new SecretBox(key);
    const sealed = box.encrypt('secret');
    const [v, iv, tag, ct] = sealed.split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 1;
    expect(() => box.decrypt([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
    expect(() => new SecretBox(randomBytes(32).toString('base64')).decrypt(sealed)).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
