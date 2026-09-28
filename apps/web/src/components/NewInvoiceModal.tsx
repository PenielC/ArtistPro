import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { extractErrorMessage, useAuth } from '../lib/AuthContext'
import { listBookings } from '../lib/bookingsApi'
import { listClients } from '../lib/clientsApi'
import { CURRENCIES } from '../lib/currencies'
import { RATE_SOURCE_LABEL, createInvoice, lookupExchangeRate, type ExchangeRateLookup } from '../lib/invoicesApi'
import { formatMoney, formatRate } from '../lib/money'
import { ArtistSelect } from './ArtistSelect'
import { Button } from './ui/button'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

interface ItemRow {
  description: string
  quantity: string
  unitPrice: string
}

type RateStatus = 'idle' | 'loading' | 'live' | 'unavailable' | 'error'

const emptyItem = (): ItemRow => ({ description: '', quantity: '1', unitPrice: '' })

export function NewInvoiceModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const baseCurrency = user?.organizationCurrency ?? 'USD'
  const queryClient = useQueryClient()
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: listClients })
  const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: listBookings })

  const [bookingId, setBookingId] = useState('')
  const [artistId, setArtistId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)

  const [currency, setCurrency] = useState(baseCurrency)
  const [rateInput, setRateInput] = useState('')
  const [liveRate, setLiveRate] = useState<ExchangeRateLookup | null>(null)
  const [rateStatus, setRateStatus] = useState<RateStatus>('idle')
  const latestCurrency = useRef(baseCurrency)

  const isForeign = currency !== baseCurrency
  const rate = isForeign ? Number(rateInput) || 0 : 1
  const total = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
  const isManualRate = isForeign && (!liveRate || Number(rateInput) !== liveRate.rate)

  function handleCurrencyChange(code: string) {
    setCurrency(code)
    latestCurrency.current = code
    setLiveRate(null)
    setRateInput('')

    if (code === baseCurrency) {
      setRateStatus('idle')
      return
    }

    setRateStatus('loading')
    lookupExchangeRate(code, baseCurrency)
      .then((result) => {
        if (latestCurrency.current !== code) return // user already picked something else
        if (result.rate) {
          setLiveRate(result)
          setRateInput(String(result.rate))
          setRateStatus('live')
        } else {
          setRateStatus('unavailable')
        }
      })
      .catch(() => {
        if (latestCurrency.current === code) setRateStatus('error')
      })
  }

  const mutation = useMutation({
    mutationFn: () =>
      createInvoice({
        bookingId: bookingId || undefined,
        artistId: artistId || undefined,
        clientId: clientId || undefined,
        clientName,
        clientEmail: clientEmail || undefined,
        title,
        currency,
        exchangeRate: isForeign ? Number(rateInput) : undefined,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        items: items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-summary'] })
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
    if (!title) setTitle([booking.eventType, booking.venue].filter(Boolean).join(' – '))
    if (booking.currency !== currency) handleCurrencyChange(booking.currency)
    if (booking.fee && items.length === 1 && !items[0].description && !items[0].unitPrice) {
      setItems([{ description: booking.eventType ?? 'Performance', quantity: '1', unitPrice: String(Number(booking.fee)) }])
    }
  }

  function handleClientSelect(id: string) {
    setClientId(id)
    const client = clients?.find((c) => c.id === id)
    if (client) {
      setClientName(client.name)
      setClientEmail(client.email ?? '')
    }
  }

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">New Invoice</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
          <ArtistSelect value={artistId} onChange={(id) => setArtistId(id)} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select aria-label="Booking" value={bookingId} onChange={(e) => handleBookingSelect(e.target.value)} className={inputClass}>
              <option value="" className="bg-brand-ink">
                No linked booking
              </option>
              {bookings?.map((b) => (
                <option key={b.id} value={b.id} className="bg-brand-ink">
                  {b.clientName}
                  {b.eventType ? ` — ${b.eventType}` : ''}
                </option>
              ))}
            </select>
            <select aria-label="Client" value={clientId} onChange={(e) => handleClientSelect(e.target.value)} className={inputClass}>
              <option value="" className="bg-brand-ink">
                One-off client (type details below)
              </option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id} className="bg-brand-ink">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input required placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputClass} />
            <input
              type="email"
              placeholder="Client email (optional)"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <input required placeholder="Invoice title (e.g. Wedding performance)" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Currency</label>
              <select aria-label="Currency" value={currency} onChange={(e) => handleCurrencyChange(e.target.value)} className={inputClass}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code} className="bg-brand-ink">
                    {c.code} — {c.name}
                    {c.code === baseCurrency ? ' (your base)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Due date</label>
              <input type="date" aria-label="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
            </div>
          </div>

          {isForeign && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Exchange rate to your base currency
              </label>
              <div className="flex items-center gap-2 text-sm text-neutral-300">
                <span>1 {currency} =</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  aria-label="Exchange rate"
                  placeholder={rateStatus === 'loading' ? 'Looking up…' : 'Enter rate'}
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  className={`${inputClass} max-w-40`}
                />
                <span>{baseCurrency}</span>
                {rateStatus === 'loading' && <Loader2 size={14} className="animate-spin text-neutral-500" />}
              </div>

              <p className="mt-2 text-xs text-neutral-500" data-testid="rate-note">
                {rateStatus === 'live' && liveRate?.source && !isManualRate && (
                  <>
                    Live rate from {RATE_SOURCE_LABEL[liveRate.source] ?? liveRate.source}
                    {liveRate.date && ` · published ${liveRate.date}`}.{' '}
                  </>
                )}
                {rateStatus === 'live' && isManualRate && <>Manual rate — overriding the live rate. </>}
                {rateStatus === 'unavailable' && (
                  <>No live rate is available for {currency}. Enter the rate you want to use. </>
                )}
                {rateStatus === 'error' && <>Couldn&apos;t reach the rate service. Enter the rate manually. </>}
                {rateStatus === 'live' && isManualRate && liveRate?.rate && (
                  <button type="button" onClick={() => setRateInput(String(liveRate.rate))} className="text-brand-orange-light hover:underline">
                    Use live rate ({formatRate(liveRate.rate)})
                  </button>
                )}
                {liveRate?.source === 'exchangerate-api' && (
                  <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer" className="text-neutral-400 underline">
                    Rates By Exchange Rate API
                  </a>
                )}
              </p>
            </div>
          )}

          <div className="mt-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Line items</p>
            <div className="flex flex-col gap-2">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_64px_96px_32px] items-center gap-2">
                  <input
                    required
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(index, { description: e.target.value })}
                    className={inputClass}
                  />
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    aria-label="Quantity"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: e.target.value })}
                    className={inputClass}
                  />
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Price"
                    aria-label="Unit price"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    disabled={items.length === 1}
                    className="text-neutral-500 hover:text-red-400 disabled:opacity-30"
                    aria-label="Remove line item"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, emptyItem()])}
              className="mt-2 flex items-center gap-1 text-sm text-brand-orange-light hover:underline"
            >
              <Plus size={14} />
              Add line item
            </button>
          </div>

          <textarea
            placeholder="Notes / payment instructions (optional) — e.g. bank details or EcoCash number"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={inputClass}
          />

          <div className="border-t border-white/10 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">Total</span>
              <span className="text-lg font-bold text-white" data-testid="form-total">
                {formatMoney(total, currency)}
              </span>
            </div>
            {isForeign && rate > 0 && (
              <p className="mt-1 text-right text-xs text-neutral-500" data-testid="form-total-base">
                ≈ {formatMoney(total * rate, baseCurrency)} in your base currency
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button
            type="submit"
            disabled={mutation.isPending}
            className="h-11 rounded-lg bg-brand-orange text-sm font-semibold text-white hover:bg-brand-orange/90"
          >
            {mutation.isPending ? 'Creating…' : 'Create Invoice'}
          </Button>
        </form>
      </div>
    </div>
  )
}
