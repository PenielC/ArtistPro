import { api } from './api'

export type BookingStatus =
  | 'NEW_ENQUIRY'
  | 'QUALIFIED'
  | 'QUOTE_SENT'
  | 'NEGOTIATION'
  | 'CONTRACT_SENT'
  | 'DEPOSIT_PAID'
  | 'CONFIRMED'
  | 'EVENT'
  | 'COMPLETED'
  | 'PAYMENT_RECEIVED'

export interface Booking {
  id: string
  organizationId: string
  artistId: string | null
  clientId: string | null
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  eventType: string | null
  eventDate: string | null
  venue: string | null
  fee: string | null
  currency: string
  status: BookingStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateBookingInput {
  artistId?: string
  clientId?: string
  clientName: string
  clientEmail?: string
  clientPhone?: string
  eventType?: string
  eventDate?: string
  venue?: string
  fee?: number
  currency?: string
  notes?: string
}

export async function listBookings(): Promise<Booking[]> {
  const { data } = await api.get<Booking[]>('/bookings')
  return data
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const { data } = await api.post<Booking>('/bookings', input)
  return data
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
  const { data } = await api.patch<Booking>(`/bookings/${id}/status`, { status })
  return data
}

export const BOOKING_STATUSES: { value: BookingStatus; label: string; className: string }[] = [
  { value: 'NEW_ENQUIRY', label: 'New Enquiry', className: 'bg-neutral-500/15 text-neutral-300' },
  { value: 'QUALIFIED', label: 'Qualified', className: 'bg-sky-500/15 text-sky-300' },
  { value: 'QUOTE_SENT', label: 'Quote Sent', className: 'bg-brand-purple/15 text-purple-300' },
  { value: 'NEGOTIATION', label: 'Negotiation', className: 'bg-amber-500/15 text-amber-300' },
  { value: 'CONTRACT_SENT', label: 'Contract Sent', className: 'bg-indigo-500/15 text-indigo-300' },
  { value: 'DEPOSIT_PAID', label: 'Deposit Paid', className: 'bg-teal-500/15 text-teal-300' },
  { value: 'CONFIRMED', label: 'Confirmed', className: 'bg-emerald-500/15 text-emerald-300' },
  { value: 'EVENT', label: 'Event', className: 'bg-brand-orange/15 text-brand-orange-light' },
  { value: 'COMPLETED', label: 'Completed', className: 'bg-slate-500/15 text-slate-300' },
  { value: 'PAYMENT_RECEIVED', label: 'Payment Received', className: 'bg-green-500/15 text-green-300' },
]

export function bookingStatusMeta(status: BookingStatus) {
  return BOOKING_STATUSES.find((s) => s.value === status) ?? BOOKING_STATUSES[0]
}
