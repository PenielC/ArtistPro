import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { extractErrorMessage } from '../../lib/AuthContext'
import { getAdminOverview, monthLabel, type AdminOverview, type CurrencyTotal } from '../../lib/adminApi'
import { formatMoney } from '../../lib/money'
import { AdminLayout, Panel, StatCard } from './AdminLayout'

function thisMonth() {
  const now = new Date()
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }
}

function shift({ year, month }: { year: number; month: number }, by: number) {
  const d = new Date(Date.UTC(year, month - 1 + by, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

function MoneyList({ rows, empty }: { rows: CurrencyTotal[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-neutral-500">{empty}</p>
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.currency} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-neutral-300">
            {r.currency} <span className="text-neutral-500">· {r.count} payment{r.count === 1 ? '' : 's'}</span>
          </span>
          <span className="font-semibold text-white">{formatMoney(r.total, r.currency)}</span>
        </li>
      ))}
    </ul>
  )
}

const SERIES = [
  { key: 'newBusinesses', label: 'New businesses', color: 'bg-brand-orange' },
  { key: 'activeBusinesses', label: 'Active businesses', color: 'bg-brand-purple' },
  { key: 'newUsers', label: 'New users', color: 'bg-sky-400' },
] as const

/** Grouped bars for the six months ending at the selected one. Plain elements, no chart library. */
function GrowthChart({ trend }: { trend: AdminOverview['trend'] }) {
  const max = Math.max(1, ...trend.flatMap((t) => SERIES.map((s) => t[s.key])))
  return (
    <div>
      <div className="flex flex-wrap gap-4 text-xs text-neutral-400">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${s.color}`} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="mt-4 grid h-48 grid-cols-6 gap-3" role="img" aria-label="Growth over the last six months" data-testid="growth-chart">
        {trend.map((t) => (
          <div key={`${t.year}-${t.month}`} className="flex flex-col">
            <div className="flex flex-1 items-end justify-center gap-1">
              {SERIES.map((s) => (
                <div key={s.key} className="flex h-full w-full max-w-4 flex-col justify-end" title={`${s.label}: ${t[s.key]}`}>
                  <span className="mb-1 text-center text-[10px] text-neutral-400">{t[s.key] || ''}</span>
                  <div className={`${s.color} w-full rounded-t`} style={{ height: `${(t[s.key] / max) * 100}%`, minHeight: t[s.key] ? 3 : 0 }} />
                </div>
              ))}
            </div>
            <p className="mt-2 border-t border-white/10 pt-1.5 text-center text-xs text-neutral-400">{monthLabel(t.year, t.month, 'short')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AdminOverviewPage() {
  const [period, setPeriod] = useState(thisMonth)
  const current = thisMonth()
  const atCurrent = period.year === current.year && period.month === current.month
  const { data, error, isFetching } = useQuery({
    queryKey: ['admin-overview', period.year, period.month],
    queryFn: () => getAdminOverview(period.year, period.month),
    placeholderData: keepPreviousData,
  })

  const stepper = (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-1">
      <button onClick={() => setPeriod((p) => shift(p, -1))} className="rounded-lg p-1.5 text-neutral-300 hover:bg-white/5 hover:text-white" aria-label="Previous month">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-36 text-center text-sm font-medium text-white" data-testid="overview-month">
        {monthLabel(period.year, period.month)}
      </span>
      <button
        onClick={() => setPeriod((p) => shift(p, 1))}
        disabled={atCurrent}
        className="rounded-lg p-1.5 text-neutral-300 hover:bg-white/5 hover:text-white disabled:opacity-30"
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )

  return (
    <AdminLayout actions={stepper}>
      {error && <p className="text-sm text-red-400">{extractErrorMessage(error)}</p>}
      {!data && !error && <p className="text-sm text-neutral-500">Loading…</p>}
      {data && (
        <div className={`flex flex-col gap-8 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Right now</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Businesses"
                value={data.totals.businesses}
                hint={`${data.totals.suspendedBusinesses} suspended`}
                testId="stat-businesses"
              />
              <StatCard label="Active (last 30 days)" value={data.totals.activeBusinesses} hint="Someone signed in" testId="stat-active" />
              <StatCard label="Users" value={data.totals.users} />
              <StatCard label="Artists" value={data.totals.artists} hint={`${data.totals.publishedArtists} with a public profile`} />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{monthLabel(period.year, period.month)}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="New businesses" value={data.month.newBusinesses} testId="stat-new-businesses" />
              <StatCard label="New users" value={data.month.newUsers} />
              <StatCard label="Active businesses" value={data.month.activeBusinesses} />
              <StatCard label="Bookings created" value={data.month.bookingsCreated} />
              <StatCard label="Invoices created" value={data.month.invoicesCreated} />
              <StatCard label="AI generations" value={data.month.aiGenerations} hint={`≈ ${formatMoney(data.month.aiCostUsd, 'USD')} estimated cost`} />
              <StatCard
                label="Emails sent"
                value={data.month.emailsSent}
                hint={
                  <>
                    <span className={data.month.emailsFailed ? 'text-red-400' : ''}>{data.month.emailsFailed} failed</span> · {data.month.emailsPending} waiting
                  </>
                }
              />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Payments recorded" aside={<span className="text-xs text-neutral-500">per currency, not converted</span>}>
              <MoneyList rows={data.month.paymentsRecorded} empty="No payments recorded this month." />
            </Panel>
            <Panel title="Paid online (Paynow)">
              <MoneyList rows={data.month.onlinePayments} empty="No online payments this month." />
            </Panel>
          </div>

          <Panel title="Growth" aside={<span className="text-xs text-neutral-500">6 months to {monthLabel(period.year, period.month, 'short')}</span>}>
            <GrowthChart trend={data.trend} />
          </Panel>
        </div>
      )}
    </AdminLayout>
  )
}
