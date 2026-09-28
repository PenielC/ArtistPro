import { api } from './api'

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'VOID'

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  position: number
}

export interface InvoicePayment {
  id: string
  amount: number
  paidAt: string
  method: string | null
  note: string | null
  voided: boolean
  voidedAt: string | null
  voidReason: string | null
}

export interface Invoice {
  id: string
  organizationId: string
  artistId: string | null
  clientId: string | null
  bookingId: string | null
  quoteId: string | null
  number: number
  title: string
  clientName: string
  clientEmail: string | null
  currency: string
  /** Units of the organisation's base currency per 1 unit of `currency`. */
  exchangeRate: number
  status: InvoiceStatus
  issueDate: string
  dueDate: string | null
  notes: string | null
  createdAt: string
  items: InvoiceItem[]
  payments: InvoicePayment[]
  total: number
  amountPaid: number
  balance: number
  totalInBaseCurrency: number
  balanceInBaseCurrency: number
  overdue: boolean
}

export interface InvoiceSummary {
  baseCurrency: string
  receivedThisMonth: number
  outstanding: number
  openCount: number
  overdueCount: number
}

export interface ExchangeRateLookup {
  from: string
  to: string
  rate: number | null
  date: string | null
  source: 'same-currency' | 'frankfurter' | 'exchangerate-api' | null
}

export interface CreateInvoiceInput {
  artistId?: string
  clientId?: string
  bookingId?: string
  title: string
  clientName: string
  clientEmail?: string
  currency?: string
  exchangeRate?: number
  dueDate?: string
  notes?: string
  items: { description: string; quantity: number; unitPrice: number }[]
}

export async function listInvoices(): Promise<Invoice[]> {
  const { data } = await api.get<Invoice[]>('/invoices')
  return data
}

export async function getInvoiceSummary(): Promise<InvoiceSummary> {
  const { data } = await api.get<InvoiceSummary>('/invoices/summary')
  return data
}

export async function lookupExchangeRate(from: string, to?: string): Promise<ExchangeRateLookup> {
  const { data } = await api.get<ExchangeRateLookup>('/invoices/exchange-rate', { params: { from, to } })
  return data
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const { data } = await api.post<Invoice>('/invoices', input)
  return data
}

export async function createInvoiceFromQuote(
  quoteId: string,
  input: { dueDate?: string; exchangeRate?: number } = {},
): Promise<Invoice> {
  const { data } = await api.post<Invoice>(`/invoices/from-quote/${quoteId}`, input)
  return data
}

export async function updateInvoiceStatus(id: string, status: 'DRAFT' | 'SENT' | 'VOID'): Promise<Invoice> {
  const { data } = await api.patch<Invoice>(`/invoices/${id}/status`, { status })
  return data
}

export async function recordInvoicePayment(
  id: string,
  input: { amount: number; method?: string; paidAt?: string; note?: string },
): Promise<Invoice> {
  const { data } = await api.post<Invoice>(`/invoices/${id}/payments`, input)
  return data
}

export async function voidInvoicePayment(invoiceId: string, paymentId: string, reason?: string): Promise<Invoice> {
  const { data } = await api.post<Invoice>(`/invoices/${invoiceId}/payments/${paymentId}/void`, { reason })
  return data
}

export async function deleteInvoice(id: string): Promise<void> {
  await api.delete(`/invoices/${id}`)
}

export const INVOICE_STATUSES: Record<InvoiceStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-neutral-500/15 text-neutral-300' },
  SENT: { label: 'Sent', className: 'bg-sky-500/15 text-sky-300' },
  PARTIALLY_PAID: { label: 'Partially paid', className: 'bg-amber-500/15 text-amber-300' },
  PAID: { label: 'Paid', className: 'bg-emerald-500/15 text-emerald-300' },
  VOID: { label: 'Void', className: 'bg-red-500/15 text-red-300' },
}

export function formatInvoiceNumber(number: number) {
  return `INV-${String(number).padStart(4, '0')}`
}

export const RATE_SOURCE_LABEL: Record<string, string> = {
  frankfurter: 'Frankfurter (ECB reference rates)',
  'exchangerate-api': 'Exchange Rate API',
}
