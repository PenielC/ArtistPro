/** What a provider reports about a payment, normalised across providers. */
export type GatewayOutcome = 'PAID' | 'FAILED' | 'CANCELLED' | 'PENDING';

export interface MerchantCredentials {
  integrationId: string;
  integrationKey: string;
}

export interface InitiateRequest {
  reference: string;
  /** In the invoice currency, 2 decimal places. */
  amount: number;
  description: string;
  returnUrl: string;
  resultUrl: string;
  payerEmail?: string;
}

export interface InitiateResult {
  redirectUrl: string;
  pollUrl?: string;
}

export interface StatusReport {
  reference: string;
  providerReference?: string;
  amount: number;
  outcome: GatewayOutcome;
  /** The provider's own status word, kept for the audit trail. */
  rawStatus: string;
  pollUrl?: string;
}

/** A provider call failed or answered with an error; the message is safe to show the payer. */
export class GatewayError extends Error {}

/** A status message failed authentication (bad hash) or was malformed. Never acted on. */
export class UntrustedMessageError extends Error {}
