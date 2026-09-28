import { api } from './api'

export type PaymentProvider = 'PAYNOW' | 'TEST'
export type PaymentAttemptStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'

export const PAYNOW_CURRENCIES = ['USD', 'ZWG'] as const

export const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  PAYNOW: 'Paynow',
  TEST: 'Test provider',
}

export const ATTEMPT_STATUSES: Record<PaymentAttemptStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-500/15 text-amber-300' },
  PAID: { label: 'Paid', className: 'bg-emerald-500/15 text-emerald-400' },
  FAILED: { label: 'Failed', className: 'bg-red-500/15 text-red-300' },
  CANCELLED: { label: 'Cancelled', className: 'bg-white/5 text-neutral-400' },
}

export interface PaymentAccount {
  id: string
  provider: PaymentProvider
  currency: string
  integrationId: string
  createdAt: string
  updatedAt: string
}

export interface PaymentAccounts {
  accounts: PaymentAccount[]
  testProviderAvailable: boolean
  configured: boolean
}

export interface PaymentAttempt {
  id: string
  provider: PaymentProvider
  currency: string
  amount: number
  reference: string
  status: PaymentAttemptStatus
  providerReference: string | null
  payerEmail: string | null
  failureReason: string | null
  createdAt: string
  completedAt: string | null
}

export interface InvoicePaymentInfo {
  link: string | null
  provider: PaymentProvider | null
  currency: string
  attempts: PaymentAttempt[]
}

export interface PublicInvoice {
  businessName: string
  number: string
  title: string
  clientName: string
  issueDate: string
  dueDate: string | null
  status: string
  currency: string
  notes: string | null
  items: { description: string; quantity: number; unitPrice: number }[]
  total: number
  amountPaid: number
  balance: number
  onlinePayment: { available: boolean; provider: PaymentProvider | null; unavailableReason: string | null }
}

export async function getPaymentAccounts(): Promise<PaymentAccounts> {
  return (await api.get<PaymentAccounts>('/payments/accounts')).data
}

export async function savePaymentAccount(input: {
  provider: PaymentProvider
  currency: string
  integrationId?: string
  integrationKey?: string
}): Promise<PaymentAccounts> {
  return (await api.put<PaymentAccounts>('/payments/accounts', input)).data
}

export async function removePaymentAccount(id: string): Promise<PaymentAccounts> {
  return (await api.delete<PaymentAccounts>(`/payments/accounts/${id}`)).data
}

export async function listPaymentAttempts(): Promise<(PaymentAttempt & { invoice: { id: string; number: number; title: string; clientName: string } })[]> {
  return (await api.get('/payments/attempts')).data
}

export async function getInvoicePaymentInfo(invoiceId: string): Promise<InvoicePaymentInfo> {
  return (await api.get<InvoicePaymentInfo>(`/payments/invoices/${invoiceId}`)).data
}

export async function enablePaymentLink(invoiceId: string): Promise<InvoicePaymentInfo> {
  return (await api.post<InvoicePaymentInfo>(`/payments/invoices/${invoiceId}/link`)).data
}

export async function disablePaymentLink(invoiceId: string): Promise<InvoicePaymentInfo> {
  return (await api.delete<InvoicePaymentInfo>(`/payments/invoices/${invoiceId}/link`)).data
}

// ── Public (payer) side ──

export async function getPublicInvoice(token: string): Promise<PublicInvoice> {
  return (await api.get<PublicInvoice>(`/public/invoices/${encodeURIComponent(token)}`)).data
}

export async function startPayment(token: string, input: { amount?: number; email?: string }): Promise<{ attemptId: string; redirectUrl: string }> {
  return (await api.post(`/public/invoices/${encodeURIComponent(token)}/pay`, input)).data
}

export async function getAttemptStatus(
  token: string,
  attemptId: string,
): Promise<{ status: PaymentAttemptStatus; amount: number; currency: string; balance: number }> {
  return (await api.get(`/public/invoices/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}`)).data
}

export async function getTestCheckout(attemptId: string) {
  return (
    await api.get<{ businessName: string; invoiceNumber: string; amount: number; currency: string; status: PaymentAttemptStatus; returnUrl: string | null }>(
      `/public/payments/test/${encodeURIComponent(attemptId)}`,
    )
  ).data
}

export async function completeTestCheckout(attemptId: string, outcome: 'paid' | 'cancelled') {
  return (await api.post<{ returnUrl: string | null }>(`/public/payments/test/${encodeURIComponent(attemptId)}`, { outcome })).data
}
