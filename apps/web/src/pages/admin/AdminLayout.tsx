import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { DashboardLayout } from '../../components/DashboardLayout'

const tabs = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/businesses', label: 'Businesses', end: false },
  { to: '/admin/settings', label: 'Settings', end: true },
  { to: '/admin/audit', label: 'Audit log', end: true },
]

/** The Platform admin area: the normal app shell plus its own tab bar. */
export function AdminLayout({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-orange-light">
              <ShieldCheck size={14} />
              Platform admin
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">ArtBH operations</h1>
            <p className="mt-1 text-sm text-neutral-400">Every business on the platform. Business data stays private: you see counts, not contents.</p>
          </div>
          {actions}
        </div>
        <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-white/10" aria-label="Admin sections">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                  isActive ? 'border-brand-orange text-white' : 'border-transparent text-neutral-400 hover:text-white'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-8">{children}</div>
      </div>
    </DashboardLayout>
  )
}

export function StatCard({ label, value, hint, testId }: { label: string; value: ReactNode; hint?: ReactNode; testId?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid={testId}>
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  )
}

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-white">{title}</h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function StatusPill({ suspended }: { suspended: boolean }) {
  return suspended ? (
    <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-300">Suspended</span>
  ) : (
    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">Active</span>
  )
}

export function Pager({ page, pageCount, total, onPage }: { page: number; pageCount: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-neutral-400">
      <span>{total === 1 ? '1 result' : `${total} results`}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-white/10 p-1.5 text-white hover:bg-white/5 disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span data-testid="page-label">
          Page {page} of {pageCount}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          className="rounded-lg border border-white/10 p-1.5 text-white hover:bg-white/5 disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
