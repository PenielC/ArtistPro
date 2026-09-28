import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, MapPin, Plus } from 'lucide-react'
import { useState } from 'react'
import { DashboardLayout } from '../components/DashboardLayout'
import { EnquiryReplyButton } from '../components/EnquiryReplyButton'
import { NewBookingModal } from '../components/NewBookingModal'
import { Button } from '../components/ui/button'
import { useArtistNames } from '../lib/useArtistNames'
import { BOOKING_STATUSES, bookingStatusMeta, listBookings, updateBookingStatus, type BookingStatus } from '../lib/bookingsApi'

export function BookingsPage() {
  const artistNames = useArtistNames()
  const [showModal, setShowModal] = useState(false)
  const queryClient = useQueryClient()

  const { data: bookings, isLoading } = useQuery({ queryKey: ['bookings'], queryFn: listBookings })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) => updateBookingStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  })

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Bookings</h1>
            <p className="mt-1 text-sm text-neutral-400">Track every enquiry from first message to confirmed booking.</p>
          </div>
          <Button onClick={() => setShowModal(true)} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            <Plus size={16} />
            New Booking
          </Button>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : !bookings || bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <Calendar size={28} className="mx-auto text-neutral-600" />
              <p className="mt-4 text-sm font-medium text-white">No bookings yet</p>
              <p className="mt-1 text-sm text-neutral-500">Create your first booking enquiry to start the pipeline.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {bookings.map((booking) => {
                const meta = bookingStatusMeta(booking.status)
                return (
                  <div
                    key={booking.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white">{booking.clientName}</p>
                        {booking.eventType && <span className="text-xs text-neutral-500">· {booking.eventType}</span>}
                        {booking.artistId && artistNames.has(booking.artistId) && (
                          <span className="rounded-full bg-brand-purple/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                            {artistNames.get(booking.artistId)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                        {booking.eventDate && (
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {new Date(booking.eventDate).toLocaleDateString()}
                          </span>
                        )}
                        {booking.venue && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} />
                            {booking.venue}
                          </span>
                        )}
                        {booking.fee && (
                          <span>
                            {booking.currency} {Number(booking.fee).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <EnquiryReplyButton bookingId={booking.id} clientName={booking.clientName} />
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                      <select
                        value={booking.status}
                        onChange={(e) =>
                          statusMutation.mutate({ id: booking.id, status: e.target.value as BookingStatus })
                        }
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-brand-orange focus:outline-none"
                      >
                        {BOOKING_STATUSES.map((s) => (
                          <option key={s.value} value={s.value} className="bg-brand-ink">
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showModal && <NewBookingModal onClose={() => setShowModal(false)} />}
    </DashboardLayout>
  )
}
