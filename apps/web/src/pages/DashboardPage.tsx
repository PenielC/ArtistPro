import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Calendar,
  FileSignature,
  Sparkles,
  CalendarDays,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { useAuth } from '../lib/AuthContext'
import { listBookings } from '../lib/bookingsApi'
import { listClients } from '../lib/clientsApi'
import { getInvoiceSummary } from '../lib/invoicesApi'
import { formatMoney } from '../lib/money'
import { listQuotes } from '../lib/quotesApi'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function isThisMonth(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export function DashboardPage() {
  const { user } = useAuth()
  const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: listBookings })

  const bookingsThisMonth = bookings?.filter((b) => isThisMonth(b.createdAt)).length ?? 0
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: listClients })
  const activeClients = clients?.length ?? 0
  const { data: quotes } = useQuery({ queryKey: ['quotes'], queryFn: listQuotes })
  const pendingQuotes = quotes?.filter((q) => q.status === 'SENT').length ?? 0
  const { data: invoiceSummary } = useQuery({ queryKey: ['invoice-summary'], queryFn: getInvoiceSummary })
  const baseCurrency = invoiceSummary?.baseCurrency ?? user?.organizationCurrency ?? 'USD'

  const stats: { label: string; value: string; icon: LucideIcon }[] = [
    { label: 'Bookings This Month', value: String(bookingsThisMonth), icon: Calendar },
    { label: 'Revenue This Month', value: formatMoney(invoiceSummary?.receivedThisMonth ?? 0, baseCurrency), icon: Wallet },
    { label: 'Active Clients', value: String(activeClients), icon: Users },
    { label: 'Pending Quotes', value: String(pendingQuotes), icon: FileSignature },
  ]

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-orange-light">{user?.organizationName}</p>
        <h1 className="mt-2 text-2xl font-bold text-white">
          {greeting()}, {user?.firstName}.
        </h1>
        <p className="mt-1 text-sm text-neutral-400">Here's what's happening with your business today.</p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
                <stat.icon size={16} className="text-brand-orange-light" />
              </span>
              <p className="mt-4 text-sm text-neutral-400">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Recent Bookings</h2>
            <Link to="/bookings" className="flex items-center gap-1 text-sm text-brand-orange-light hover:underline">
              View all
              <ArrowRight size={14} />
            </Link>
          </div>

          {!bookings || bookings.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-500">No bookings yet. Create your first one from the Bookings page.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {bookings.slice(0, 4).map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
                  <p className="text-sm font-medium text-white">{b.clientName}</p>
                  <p className="text-xs text-neutral-500">{b.eventType ?? '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-brand-orange/10 via-white/[0.02] to-brand-purple/10 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-orange to-brand-purple">
                <Sparkles size={16} className="text-white" />
              </span>
              <div>
                <h2 className="font-semibold text-white">Your AI Artist Manager</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  A briefing on what needs your attention, pricing help from your own history, and drafts for client messages and press copy.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/ai?tab=briefing"
                className="flex items-center gap-1.5 rounded-lg bg-brand-orange px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-orange/90"
              >
                Get today&apos;s briefing
                <ArrowRight size={14} />
              </Link>
              <Link to="/ai?tab=pricing" className="rounded-lg border border-white/15 px-3.5 py-2 text-sm text-white hover:bg-white/5">
                Suggest a price
              </Link>
            </div>
          </div>
        </div>

        <Link to="/calendar" className="mt-6 flex items-center gap-2 text-sm text-neutral-400 hover:text-white">
          <CalendarDays size={15} />
          See every booking, deadline and payment in your calendar
          <ArrowRight size={14} />
        </Link>
      </div>
    </DashboardLayout>
  )
}
