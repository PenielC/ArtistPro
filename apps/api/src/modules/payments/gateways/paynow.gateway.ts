import { createHash, timingSafeEqual } from 'crypto';
import {
  GatewayError,
  GatewayOutcome,
  InitiateRequest,
  InitiateResult,
  MerchantCredentials,
  StatusReport,
  UntrustedMessageError,
} from './gateway.types';

/** Ordered key/value pairs exactly as sent on the wire. Paynow's hash depends on field order. */
export type Pairs = [string, string][];

/**
 * Paynow message hash: every field value except `hash`, in message order, joined
 * without separators or URL-encoding, then the integration key appended;
 * SHA-512, uppercase hex. (developers.paynow.co.zw, "Generating Hash".)
 */
export function paynowHash(values: string[], integrationKey: string): string {
  return createHash('sha512').update(values.join('') + integrationKey, 'utf8').digest('hex').toUpperCase();
}

/** Parses a form-encoded body, keeping field order; keys are lowercased (Paynow's casing varies). */
export function parseForm(body: string): Pairs {
  return [...new URLSearchParams(body)].map(([k, v]) => [k.toLowerCase(), v]);
}

export function hasValidHash(pairs: Pairs, integrationKey: string): boolean {
  const received = pairs.find(([k]) => k === 'hash')?.[1];
  if (!received) return false;
  const expected = paynowHash(
    pairs.filter(([k]) => k !== 'hash').map(([, v]) => v),
    integrationKey,
  );
  const a = Buffer.from(received.toUpperCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// "Paid", "Awaiting Delivery" and "Delivered" all mean the payer's money was taken.
// "Disputed" and "Refunded" come after a payment and are left for a human, so they don't change anything here.
export function toOutcome(status: string): GatewayOutcome | null {
  switch (status.trim().toLowerCase()) {
    case 'paid':
    case 'awaiting delivery':
    case 'delivered':
      return 'PAID';
    case 'cancelled':
      return 'CANCELLED';
    case 'failed':
      return 'FAILED';
    case 'created':
    case 'sent':
      return 'PENDING';
    default:
      return null;
  }
}

const get = (pairs: Pairs, key: string) => pairs.find(([k]) => k === key)?.[1];

export class PaynowGateway {
  constructor(
    private readonly apiBase: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async initiate(creds: MerchantCredentials, req: InitiateRequest): Promise<InitiateResult> {
    const fields: Pairs = [
      ['id', creds.integrationId],
      ['reference', req.reference],
      ['amount', req.amount.toFixed(2)],
      ['additionalinfo', req.description],
      ['returnurl', req.returnUrl],
      ['resulturl', req.resultUrl],
    ];
    if (req.payerEmail) fields.push(['authemail', req.payerEmail]);
    fields.push(['status', 'Message']);
    fields.push(['hash', paynowHash(fields.map(([, v]) => v), creds.integrationKey)]);

    let text: string;
    try {
      const response = await this.fetchImpl(`${this.apiBase}/interface/initiatetransaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(20_000),
      });
      text = await response.text();
    } catch {
      throw new GatewayError('Paynow could not be reached. Please try again in a moment.');
    }

    const pairs = parseForm(text);
    const status = get(pairs, 'status')?.toLowerCase();
    if (status === 'error') {
      throw new GatewayError(`Paynow declined the request: ${get(pairs, 'error') ?? 'unknown error'}`);
    }
    if (status !== 'ok') throw new GatewayError('Paynow returned an unexpected response.');
    // A successful response must be verified before sending the payer anywhere.
    if (!hasValidHash(pairs, creds.integrationKey)) {
      throw new GatewayError('Paynow response failed verification. Check the integration key.');
    }
    const redirectUrl = get(pairs, 'browserurl');
    if (!redirectUrl) throw new GatewayError('Paynow did not return a payment page.');
    return { redirectUrl, pollUrl: get(pairs, 'pollurl') };
  }

  /** Authenticates and reads a status message (result callback or poll response). */
  readStatus(pairs: Pairs, creds: MerchantCredentials): StatusReport {
    if (!hasValidHash(pairs, creds.integrationKey)) {
      throw new UntrustedMessageError('Paynow status message failed hash verification.');
    }
    const reference = get(pairs, 'reference');
    const rawStatus = get(pairs, 'status');
    const amount = Number(get(pairs, 'amount'));
    if (!reference || !rawStatus || !Number.isFinite(amount)) {
      throw new UntrustedMessageError('Paynow status message is missing fields.');
    }
    return {
      reference,
      providerReference: get(pairs, 'paynowreference'),
      amount,
      rawStatus,
      outcome: toOutcome(rawStatus) ?? 'PENDING',
      pollUrl: get(pairs, 'pollurl'),
    };
  }

  /** Asks Paynow for the current status (empty POST to the poll URL, as the official SDKs do). */
  async poll(pollUrl: string, creds: MerchantCredentials): Promise<StatusReport> {
    // The poll URL came from Paynow, but it's still only ever fetched on Paynow's own host.
    if (new URL(pollUrl).origin !== new URL(this.apiBase).origin) {
      throw new UntrustedMessageError('Poll URL is not on the Paynow host.');
    }
    let text: string;
    try {
      const response = await this.fetchImpl(pollUrl, { method: 'POST', signal: AbortSignal.timeout(15_000) });
      text = await response.text();
    } catch {
      throw new GatewayError('Paynow could not be reached.');
    }
    return this.readStatus(parseForm(text), creds);
  }
}
