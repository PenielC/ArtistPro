import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { getFeedLink, resetFeedLink } from '../lib/calendarApi'
import { Button } from './ui/button'

export function CalendarSubscribeModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const { data } = useQuery({ queryKey: ['calendar-feed'], queryFn: getFeedLink })
  const reset = useMutation({ mutationFn: resetFeedLink, onSuccess: (d) => queryClient.setQueryData(['calendar-feed'], d) })

  async function copy() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link:', data.url)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Add to your phone or computer calendar</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close subscribe">
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm text-neutral-400">
          Subscribe once and your bookings, deadlines, payments and entries appear in Google Calendar, Apple Calendar or Outlook, and stay up to date.
          It&apos;s read-only: make changes here.
        </p>

        <div className="mt-4 flex gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-white/5 px-3 py-2.5 text-xs text-neutral-300" data-testid="feed-url">
            {data?.url ?? 'Loading…'}
          </code>
          <Button onClick={copy} disabled={!data} className="gap-1.5 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <div className="mt-5 flex flex-col gap-3 text-sm text-neutral-300">
          <div>
            <p className="font-semibold text-white">Google Calendar</p>
            <p className="text-neutral-400">On a computer: Other calendars → + → From URL → paste the link → Add calendar.</p>
          </div>
          <div>
            <p className="font-semibold text-white">iPhone / Mac</p>
            <p className="text-neutral-400">
              {data && (
                <a href={data.url.replace(/^https?:/, 'webcal:')} className="text-brand-orange-light underline" data-testid="webcal-link">
                  Open in Apple Calendar
                </a>
              )}
              , or add it by hand: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar (Mac: File → New Calendar
              Subscription). Menu names vary slightly between versions.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white">Outlook</p>
            <p className="text-neutral-400">Add calendar → Subscribe from web → paste the link.</p>
          </div>
          <p className="text-xs text-neutral-500">Calendar apps refresh subscriptions on their own schedule, usually every few hours, so changes can take a while to show.</p>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-xs text-neutral-500">
            Keep this link private: anyone who has it can see your calendar. If it leaks, reset it; the old link stops working immediately.
          </p>
          <Button
            onClick={() => window.confirm('Reset the link? Calendars subscribed with the old link will stop updating.') && reset.mutate()}
            disabled={reset.isPending}
            variant="outline"
            className="mt-3 gap-1.5 rounded-lg border-white/10 bg-transparent text-white hover:bg-white/5"
          >
            <RefreshCw size={14} />
            Reset link
          </Button>
        </div>
      </div>
    </div>
  )
}
