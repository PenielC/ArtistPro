import { api } from './api'

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED'

export interface QuoteItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  position: number
}

export interface Quote {
  id: string
  organizationId: string
  artistId: string | null
  clientId: string | null
  bookingId: string | null
  number: number
  title: string
  clientName: string
  clientEmail: string | null
  currency: string
  status: QuoteStatus
  validUntil: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  items: QuoteItem[]
  total: number
}

export interface CreateQuoteInput {
  artistId?: string
  clientId?: string
  bookingId?: string
  title: string
  clientName: string
  clientEmail?: string
  currency?: string
  validUntil?: string
  notes?: string
  items: { description: string; quantity: number; unitPrice: number }[]
}

export async function listQuotes(): Promise<Quote[]> {
  const { data } = await api.get<Quote[]>('/quotes')
  return data
}

export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  const { data } = await api.post<Quote>('/quotes', input)
  return data
}

export async function updateQuoteStatus(id: string, status: QuoteStatus): Promise<Quote> {
  const { data } = await api.patch<Quote>(`/quotes/${id}/status`, { status })
  return data
}

export async function deleteQuote(id: string): Promise<void> {
  await api.delete(`/quotes/${id}`)
}

export const QUOTE_STATUSES: { value: QuoteStatus; label: string; className: string }[] = [
  { value: 'DRAFT', label: 'Draft', className: 'bg-neutral-500/15 text-neutral-300' },
  { value: 'SENT', label: 'Sent', className: 'bg-sky-500/15 text-sky-300' },
  { value: 'ACCEPTED', label: 'Accepted', className: 'bg-emerald-500/15 text-emerald-300' },
  { value: 'DECLINED', label: 'Declined', className: 'bg-red-500/15 text-red-300' },
]

export function quoteStatusMeta(status: QuoteStatus) {
  return QUOTE_STATUSES.find((s) => s.value === status) ?? QUOTE_STATUSES[0]
}

export function formatQuoteNumber(number: number) {
  return `Q-${String(number).padStart(4, '0')}`
}
