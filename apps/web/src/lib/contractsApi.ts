import { api } from './api'

export type ContractStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'CANCELLED'

export interface Contract {
  id: string
  organizationId: string
  artistId: string | null
  clientId: string | null
  bookingId: string | null
  quoteId: string | null
  templateId: string | null
  number: number
  title: string
  artistName: string
  clientName: string
  clientEmail: string | null
  eventType: string | null
  eventDate: string | null
  venue: string | null
  durationMinutes: number | null
  currency: string
  fee: number
  depositAmount: number
  balanceAmount: number
  cancellationTerms: string | null
  accommodation: string | null
  transport: string | null
  paymentTerms: string | null
  extraTerms: string | null
  /** The agreed text, frozen when the contract was created. */
  body: string
  status: ContractStatus
  signedAt: string | null
  createdAt: string
}

export interface ContractTemplate {
  id: string
  name: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface DefaultTemplate {
  name: string
  body: string
  placeholders: { key: string; description: string }[]
}

export interface CreateContractInput {
  templateId?: string
  artistId?: string
  clientId?: string
  bookingId?: string
  quoteId?: string
  title: string
  artistName?: string
  clientName: string
  clientEmail?: string
  eventType?: string
  eventDate?: string
  venue?: string
  durationMinutes?: number
  currency?: string
  fee: number
  depositAmount?: number
  cancellationTerms?: string
  accommodation?: string
  transport?: string
  paymentTerms?: string
  extraTerms?: string
}

export async function listContracts(): Promise<Contract[]> {
  const { data } = await api.get<Contract[]>('/contracts')
  return data
}

export async function createContract(input: CreateContractInput): Promise<Contract> {
  const { data } = await api.post<Contract>('/contracts', input)
  return data
}

export async function updateContractStatus(id: string, status: ContractStatus, signedAt?: string): Promise<Contract> {
  const { data } = await api.patch<Contract>(`/contracts/${id}/status`, { status, signedAt })
  return data
}

export async function deleteContract(id: string): Promise<void> {
  await api.delete(`/contracts/${id}`)
}

export async function listContractTemplates(): Promise<ContractTemplate[]> {
  const { data } = await api.get<ContractTemplate[]>('/contracts/templates')
  return data
}

export async function getDefaultTemplate(): Promise<DefaultTemplate> {
  const { data } = await api.get<DefaultTemplate>('/contracts/templates/default')
  return data
}

export async function createContractTemplate(input: { name: string; body: string }): Promise<ContractTemplate> {
  const { data } = await api.post<ContractTemplate>('/contracts/templates', input)
  return data
}

export async function updateContractTemplate(
  id: string,
  input: { name?: string; body?: string },
): Promise<ContractTemplate> {
  const { data } = await api.patch<ContractTemplate>(`/contracts/templates/${id}`, input)
  return data
}

export async function deleteContractTemplate(id: string): Promise<void> {
  await api.delete(`/contracts/templates/${id}`)
}

export const CONTRACT_STATUSES: Record<ContractStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-neutral-500/15 text-neutral-300' },
  SENT: { label: 'Sent', className: 'bg-sky-500/15 text-sky-300' },
  SIGNED: { label: 'Signed', className: 'bg-emerald-500/15 text-emerald-300' },
  CANCELLED: { label: 'Cancelled', className: 'bg-red-500/15 text-red-300' },
}

export function formatContractNumber(number: number) {
  return `CON-${String(number).padStart(4, '0')}`
}

/** Suggestions only — pre-filled in the form where the user can edit them, never applied silently. */
export const SUGGESTED_PAYMENT_TERMS = 'no later than 7 days before the event'
export const SUGGESTED_CANCELLATION_TERMS =
  'If the Client cancels more than 30 days before the event, the deposit is retained by the Artist. ' +
  'If the Client cancels 30 days or fewer before the event, 50% of the fee is payable. ' +
  'If the Client cancels 7 days or fewer before the event, the full fee is payable. ' +
  'If the Artist cancels, the deposit is refunded in full.'

export const LEGAL_NOTE =
  'This is a general-purpose starting template, not legal advice. Have a lawyer review it before you rely on it.'
