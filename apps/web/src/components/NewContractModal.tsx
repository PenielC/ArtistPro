import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { extractErrorMessage, useAuth } from '../lib/AuthContext'
import { listBookings } from '../lib/bookingsApi'
import { listClients } from '../lib/clientsApi'
import {
  LEGAL_NOTE,
  SUGGESTED_CANCELLATION_TERMS,
  SUGGESTED_PAYMENT_TERMS,
  createContract,
  listContractTemplates,
} from '../lib/contractsApi'
import { CURRENCIES } from '../lib/currencies'
import { formatMoney } from '../lib/money'
import { listQuotes, type Quote } from '../lib/quotesApi'
import { ArtistSelect } from './ArtistSelect'
import { useArtistNames } from '../lib/useArtistNames'
import { Button } from './ui/button'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500'

export function NewContractModal({ initialQuote, onClose }: { initialQuote?: Quote; onClose: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: listClients })
  const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: listBookings })
  const { data: quotes } = useQuery({ queryKey: ['quotes'], queryFn: listQuotes })
  const { data: templates } = useQuery({ queryKey: ['contract-templates'], queryFn: listContractTemplates })

  const [templateId, setTemplateId] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [quoteId, setQuoteId] = useState(initialQuote?.id ?? '')
  const [artistId, setArtistId] = useState(initialQuote?.artistId ?? '')
  const artistNames = useArtistNames()
  const [clientId, setClientId] = useState(initialQuote?.clientId ?? '')
  const [clientName, setClientName] = useState(initialQuote?.clientName ?? '')
  const [clientEmail, setClientEmail] = useState(initialQuote?.clientEmail ?? '')
  const [title, setTitle] = useState(initialQuote?.title ?? '')
  const [artistName, setArtistName] = useState('')
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [venue, setVenue] = useState('')
  const [duration, setDuration] = useState('')
  const [currency, setCurrency] = useState(initialQuote?.currency ?? user?.organizationCurrency ?? 'USD')
  const [fee, setFee] = useState(initialQuote ? String(initialQuote.total) : '')
  const [deposit, setDeposit] = useState('')
  const [paymentTerms, setPaymentTerms] = useState(SUGGESTED_PAYMENT_TERMS)
  const [cancellationTerms, setCancellationTerms] = useState(SUGGESTED_CANCELLATION_TERMS)
  const [accommodation, setAccommodation] = useState('')
  const [transport, setTransport] = useState('')
  const [extraTerms, setExtraTerms] = useState('')
  const [error, setError] = useState<string | null>(null)

  const feeNumber = Number(fee) || 0
  const depositNumber = Number(deposit) || 0
  const depositTooBig = depositNumber > feeNumber

  const mutation = useMutation({
    mutationFn: () =>
      createContract({
        templateId: templateId || undefined,
        bookingId: bookingId || undefined,
        quoteId: quoteId || undefined,
        artistId: artistId || undefined,
        clientId: clientId || undefined,
        title,
        artistName: artistName || undefined,
        clientName,
        clientEmail: clientEmail || undefined,
        eventType: eventType || undefined,
        eventDate: eventDate || undefined,
        venue: venue || undefined,
        durationMinutes: duration ? Number(duration) : undefined,
        currency,
        fee: feeNumber,
        depositAmount: depositNumber,
        paymentTerms: paymentTerms || undefined,
        cancellationTerms: cancellationTerms || undefined,
        accommodation: accommodation || undefined,
        transport: transport || undefined,
        extraTerms: extraTerms || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      onClose()
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  function handleBookingSelect(id: string) {
    setBookingId(id)
    const booking = bookings?.find((b) => b.id === id)
    if (!booking) return
    setArtistId(booking.artistId ?? '')
    setClientId(booking.clientId ?? '')
    setClientName(booking.clientName)
    setClientEmail(booking.clientEmail ?? '')
    if (booking.eventType) setEventType(booking.eventType)
    if (booking.eventDate) setEventDate(booking.eventDate.slice(0, 10))
    if (booking.venue) setVenue(booking.venue)
    setCurrency(booking.currency)
    if (booking.fee) setFee(String(Number(booking.fee)))
    if (!title) setTitle([booking.eventType, booking.venue].filter(Boolean).join(' – '))
  }

  function handleQuoteSelect(id: string) {
    setQuoteId(id)
    const quote = quotes?.find((q) => q.id === id)
    if (!quote) return
    setArtistId(quote.artistId ?? '')
    setClientId(quote.clientId ?? '')
    setClientName(quote.clientName)
    setClientEmail(quote.clientEmail ?? '')
    setCurrency(quote.currency)
    setFee(String(quote.total))
    if (!title) setTitle(quote.title)
  }

  function handleClientSelect(id: string) {
    setClientId(id)
    const client = clients?.find((c) => c.id === id)
    if (client) {
      setClientName(client.name)
      setClientEmail(client.email ?? '')
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">New Contract</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Template</label>
              <select aria-label="Template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputClass}>
                <option value="" className="bg-brand-ink">
                  Standard performance agreement (built-in)
                </option>
                {templates?.map((t) => (
                  <option key={t.id} value={t.id} className="bg-brand-ink">
                    {t.name}
                  </option>
                ))}
              </select>
              {!templateId && <p className="mt-1 text-xs text-amber-300/80">{LEGAL_NOTE}</p>}
            </div>
            <div>
              <label className={labelClass}>Start from a booking or quote (optional)</label>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="Booking" value={bookingId} onChange={(e) => handleBookingSelect(e.target.value)} className={inputClass}>
                  <option value="" className="bg-brand-ink">
                    No booking
                  </option>
                  {bookings?.map((b) => (
                    <option key={b.id} value={b.id} className="bg-brand-ink">
                      {b.clientName}
                      {b.eventType ? ` — ${b.eventType}` : ''}
                    </option>
                  ))}
                </select>
                <select aria-label="Quote" value={quoteId} onChange={(e) => handleQuoteSelect(e.target.value)} className={inputClass}>
                  <option value="" className="bg-brand-ink">
                    No quote
                  </option>
                  {quotes?.map((q) => (
                    <option key={q.id} value={q.id} className="bg-brand-ink">
                      {q.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <ArtistSelect value={artistId} onChange={(id) => setArtistId(id)} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input required placeholder="Contract title (e.g. Wedding performance)" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
            <input
              placeholder={`Artist name (default: ${artistNames.get(artistId) ?? user?.organizationName ?? 'your business'})`}
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select aria-label="Client" value={clientId} onChange={(e) => handleClientSelect(e.target.value)} className={inputClass}>
              <option value="" className="bg-brand-ink">
                One-off client
              </option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id} className="bg-brand-ink">
                  {c.name}
                </option>
              ))}
            </select>
            <input required placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputClass} />
            <input type="email" placeholder="Client email (optional)" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={inputClass} />
          </div>

          <div>
            <p className={labelClass}>The event</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input placeholder="Event type" value={eventType} onChange={(e) => setEventType(e.target.value)} className={inputClass} />
              <input type="date" aria-label="Event date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
              <input placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} />
              <input
                type="number"
                min="1"
                max="1440"
                step="1"
                placeholder="Duration (minutes)"
                aria-label="Duration in minutes"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <p className={labelClass}>Fee and deposit</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code} className="bg-brand-ink">
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                placeholder="Total fee"
                aria-label="Total fee"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className={inputClass}
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Deposit"
                  aria-label="Deposit"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setDeposit(String(Math.round(feeNumber * 50) / 100))}
                  className="shrink-0 rounded-lg border border-white/10 px-3 text-xs text-neutral-300 hover:bg-white/5"
                  title="Set the deposit to 50% of the fee"
                >
                  50%
                </button>
              </div>
            </div>
            {feeNumber > 0 && (
              <p className={`mt-1 text-xs ${depositTooBig ? 'text-red-300' : 'text-neutral-500'}`} data-testid="balance-note">
                {depositTooBig
                  ? 'The deposit cannot be more than the total fee.'
                  : `Balance after deposit: ${formatMoney(feeNumber - depositNumber, currency)}`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Balance payable (suggested)</label>
              <textarea aria-label="Payment terms" rows={2} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cancellation terms (suggested — edit to suit)</label>
              <textarea aria-label="Cancellation terms" rows={4} value={cancellationTerms} onChange={(e) => setCancellationTerms(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input placeholder="Accommodation (optional)" value={accommodation} onChange={(e) => setAccommodation(e.target.value)} className={inputClass} />
            <input placeholder="Transport (optional)" value={transport} onChange={(e) => setTransport(e.target.value)} className={inputClass} />
          </div>

          <textarea
            placeholder="Additional terms (optional) — e.g. sound and stage requirements"
            rows={2}
            value={extraTerms}
            onChange={(e) => setExtraTerms(e.target.value)}
            className={inputClass}
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button
            type="submit"
            disabled={mutation.isPending || depositTooBig}
            className="h-11 rounded-lg bg-brand-orange text-sm font-semibold text-white hover:bg-brand-orange/90"
          >
            {mutation.isPending ? 'Creating…' : 'Create Contract'}
          </Button>
        </form>
      </div>
    </div>
  )
}
