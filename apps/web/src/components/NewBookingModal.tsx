import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { createBooking } from '../lib/bookingsApi'
import { extractErrorMessage } from '../lib/AuthContext'
import { getConflicts } from '../lib/calendarApi'
import { listClients } from '../lib/clientsApi'
import { ArtistSelect } from './ArtistSelect'
import { Button } from './ui/button'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

export function NewBookingModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: listClients })
  const [artistId, setArtistId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [venue, setVenue] = useState('')
  const [fee, setFee] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Warn (never block) when this artist already has something that day.
  const { data: clashes } = useQuery({
    queryKey: ['calendar-conflicts', eventDate, artistId],
    queryFn: () => getConflicts(eventDate, artistId || undefined),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(eventDate),
  })

  const mutation = useMutation({
    mutationFn: () =>
      createBooking({
        artistId: artistId || undefined,
        clientId: clientId || undefined,
        clientName,
        clientEmail: clientEmail || undefined,
        clientPhone: clientPhone || undefined,
        eventType: eventType || undefined,
        eventDate: eventDate || undefined,
        venue: venue || undefined,
        fee: fee ? Number(fee) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      onClose()
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  function handleClientSelect(id: string) {
    setClientId(id)
    const selected = clients?.find((c) => c.id === id)
    if (selected) {
      setClientName(selected.name)
      setClientEmail(selected.email ?? '')
      setClientPhone(selected.phone ?? '')
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">New Booking Enquiry</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
          <ArtistSelect value={artistId} onChange={(id) => setArtistId(id)} />
          {clients && clients.length > 0 && (
            <select
              aria-label="Existing client"
              value={clientId}
              onChange={(e) => handleClientSelect(e.target.value)}
              className={inputClass}
            >
              <option value="" className="bg-brand-ink">
                One-off client (type details below)
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id} className="bg-brand-ink">
                  {c.name}
                  {c.company ? ` — ${c.company}` : ''}
                </option>
              ))}
            </select>
          )}
          <input
            required
            placeholder="Client / organiser name"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="Email (optional)"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className={inputClass}
            />
            <input
              placeholder="Phone (optional)"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Event type (e.g. Wedding)"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className={inputClass}
            />
            <input type="date" aria-label="Event date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
          </div>
          {clashes && clashes.length > 0 && (
            <div className="flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200" role="alert" data-testid="booking-clash">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Heads up: {clashes.map((c) => (c.type === 'BLOCKED' ? `blocked (${c.title})` : c.title)).join(', ')} already on this day. You can still save it.
              </span>
            </div>
          )}
          <input placeholder="Venue (optional)" value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Fee (optional)"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className={inputClass}
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button
            type="submit"
            disabled={mutation.isPending}
            className="mt-2 h-11 rounded-lg bg-brand-orange text-sm font-semibold text-white hover:bg-brand-orange/90"
          >
            {mutation.isPending ? 'Creating…' : 'Create Booking'}
          </Button>
        </form>
      </div>
    </div>
  )
}
