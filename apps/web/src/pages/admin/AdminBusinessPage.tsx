import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ExternalLink, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { extractErrorMessage, useAuth } from '../../lib/AuthContext'
import {
  ACTION_LABELS,
  getAdminOrganization,
  reactivateOrganization,
  setOrganizationAiLimit,
  suspendOrganization,
  timeAgo,
  type AdminOrganization,
  describeAudit,
  adminInputClass as inputClass,
} from '../../lib/adminApi'
import { formatMoney } from '../../lib/money'
import { AdminLayout, Panel, StatCard, StatusPill } from './AdminLayout'

const ROLE_LABELS: Record<string, string> = { OWNER: 'Owner', MANAGER: 'Manager', STAFF: 'Staff', FINANCE: 'Finance' }
const dateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function SuspendDialog({ org, onClose }: { org: AdminOrganization; onClose: () => void }) {
  const queryClient = useQueryClient()
  const suspended = !!org.suspendedAt
  const [reason, setReason] = useState('')
  const action = useMutation({
    mutationFn: () => (suspended ? reactivateOrganization(org.id) : suspendOrganization(org.id, reason.trim())),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin-organization', org.id], data)
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
      queryClient.invalidateQueries({ queryKey: ['admin-audit'] })
      onClose()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    action.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-labelledby="suspend-title">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="suspend-title" className="text-lg font-bold text-white">
            {suspended ? `Reactivate ${org.name}?` : `Suspend ${org.name}?`}
          </h2>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {suspended ? (
          <p className="mt-3 text-sm text-neutral-300">
            Members can log in again straight away, and the business's public profile, press kits, payment links and calendar feeds come back as they were.
          </p>
        ) : (
          <>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-300">
              <li>All {org.counts.users} member{org.counts.users === 1 ? ' is' : 's are'} signed out immediately and can't log in.</li>
              <li>Public artist pages, press kits, payment links and calendar feeds stop working.</li>
              <li>Overdue reminders stop. Nothing is deleted, and reactivating restores everything.</li>
            </ul>
            <label htmlFor="suspend-reason" className="mt-4 block text-sm font-medium text-neutral-300">
              Reason <span className="font-normal text-neutral-500">(for other admins; the business isn't shown it)</span>
            </label>
            <textarea
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              required
              minLength={3}
              className={`${inputClass} mt-1`}
              placeholder="e.g. Chargebacks reported by Paynow"
            />
          </>
        )}
        {action.error && <p className="mt-3 text-sm text-red-400">{extractErrorMessage(action.error)}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-white/15 bg-transparent text-white hover:bg-white/5">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={action.isPending || (!suspended && reason.trim().length < 3)}
            className={suspended ? 'bg-emerald-600 text-white hover:bg-emerald-600/90' : 'bg-red-600 text-white hover:bg-red-600/90'}
          >
            {action.isPending ? 'Saving…' : suspended ? 'Reactivate' : 'Suspend business'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function AiLimitForm({ org }: { org: AdminOrganization }) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(String(org.aiMonthlyLimit))
  const save = useMutation({
    mutationFn: () => setOrganizationAiLimit(org.id, Number(value)),
    onSuccess: (data) => {
      setValue(String(data.aiMonthlyLimit))
      queryClient.setQueryData(['admin-organization', org.id], data)
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-audit'] })
    },
  })
  const valid = /^\d+$/.test(value) && Number(value) <= 100_000
  const changed = valid && Number(value) !== org.aiMonthlyLimit
  const used = org.aiUsedThisMonth
  const pct = org.aiMonthlyLimit ? Math.min(100, (used / org.aiMonthlyLimit) * 100) : 100

  return (
    <div>
      <p className="text-sm text-neutral-300">
        <span className="text-2xl font-bold text-white" data-testid="ai-used">
          {used}
        </span>{' '}
        of {org.aiMonthlyLimit} generations used this month
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${pct >= 100 ? 'bg-red-500' : 'bg-brand-orange'}`} style={{ width: `${pct}%` }} />
      </div>
      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (changed) save.mutate()
        }}
      >
        <div className="flex-1">
          <label htmlFor="ai-limit" className="block text-xs font-medium text-neutral-400">
            Monthly limit
          </label>
          <input id="ai-limit" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.trim())} className={`${inputClass} mt-1`} />
        </div>
        <Button type="submit" disabled={!changed || save.isPending} className="h-10 bg-brand-orange text-white hover:bg-brand-orange/90">
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>
      {!valid && <p className="mt-2 text-xs text-red-400">Enter a whole number from 0 to 100,000.</p>}
      {save.error && <p className="mt-2 text-xs text-red-400">{extractErrorMessage(save.error)}</p>}
      {save.isSuccess && !changed && <p className="mt-2 text-xs text-emerald-400">Saved.</p>}
    </div>
  )
}

export function AdminBusinessPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [dialog, setDialog] = useState(false)
  const { data: org, error } = useQuery({ queryKey: ['admin-organization', id], queryFn: () => getAdminOrganization(id) })
  const own = org?.id === user?.organizationId

  return (
    <AdminLayout>
      <Link to="/admin/businesses" className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white">
        <ArrowLeft size={14} />
        All businesses
      </Link>
      {error && <p className="mt-6 text-sm text-red-400">{extractErrorMessage(error)}</p>}
      {!org && !error && <p className="mt-6 text-sm text-neutral-500">Loading…</p>}
      {org && (
        <div className="mt-4 flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-white" data-testid="business-name">
                  {org.name}
                </h2>
                <StatusPill suspended={!!org.suspendedAt} />
              </div>
              <p className="mt-1 text-sm text-neutral-400">
                Joined {new Date(org.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })} · Last active {timeAgo(org.lastActiveAt)} · Base
                currency {org.currency}
              </p>
            </div>
            {own ? (
              <p className="max-w-xs text-xs text-neutral-500">This is your own business, so it can't be suspended from here.</p>
            ) : (
              <Button
                onClick={() => setDialog(true)}
                variant="outline"
                className={org.suspendedAt ? 'border-emerald-500/40 bg-transparent text-emerald-300 hover:bg-emerald-500/10' : 'border-red-500/40 bg-transparent text-red-300 hover:bg-red-500/10'}
                data-testid="suspend-toggle"
              >
                {org.suspendedAt ? 'Reactivate' : 'Suspend'}
              </Button>
            )}
          </div>

          {org.suspendedAt && (
            <div className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100" data-testid="suspended-banner">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-300" />
              <div>
                <p className="font-medium">Suspended {dateTime(org.suspendedAt)}</p>
                <p className="mt-0.5 text-red-200/80">Reason: {org.suspendedReason}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Artists" value={org.counts.artists} />
            <StatCard label="Clients" value={org.counts.clients} />
            <StatCard label="Bookings" value={org.counts.bookings} />
            <StatCard label="Invoices" value={org.counts.invoices} hint={`${org.counts.quotes} quotes · ${org.counts.contracts} contracts`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="AI Manager">
              <AiLimitForm org={org} />
            </Panel>
            <Panel title="Money">
              {org.paymentsRecorded.length ? (
                <ul className="flex flex-col gap-2 text-sm">
                  {org.paymentsRecorded.map((p) => (
                    <li key={p.currency} className="flex justify-between">
                      <span className="text-neutral-300">
                        Recorded in {p.currency} <span className="text-neutral-500">· {p.count}</span>
                      </span>
                      <span className="font-semibold text-white">{formatMoney(p.total, p.currency)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-500">No payments recorded yet.</p>
              )}
              <p className="mt-4 text-xs text-neutral-500">
                Online payments:{' '}
                {org.paymentAccounts.length
                  ? org.paymentAccounts.map((a) => `${a.provider === 'PAYNOW' ? 'Paynow' : 'Test'} ${a.currency}`).join(', ')
                  : 'not set up'}
                {' · '}Overdue reminders {org.reminderEnabled ? 'on' : 'off'}
              </p>
            </Panel>
          </div>

          <Panel title={`Members (${org.users.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Joined</th>
                    <th className="pb-2 font-medium">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {org.users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 text-white">{u.name}</td>
                      <td className="py-2 text-neutral-300">{u.email}</td>
                      <td className="py-2 text-neutral-300">{ROLE_LABELS[u.role] ?? u.role}</td>
                      <td className="py-2 text-neutral-300">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 text-neutral-300">{timeAgo(u.lastActiveAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title={`Artists (${org.artists.length})`}>
            {org.artists.length ? (
              <ul className="flex flex-col divide-y divide-white/5 text-sm">
                {org.artists.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-white">{a.name}</span>
                    <span className="flex items-center gap-3 text-xs text-neutral-400">
                      {a.isPublished ? 'Public profile' : 'Profile not published'}
                      {a.epkPublished && ' · Press kit live'}
                      {a.isPublished && !org.suspendedAt && (
                        <a href={`/a/${a.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-orange-light hover:underline">
                          View <ExternalLink size={12} />
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">No artists yet.</p>
            )}
          </Panel>

          <Panel title="Admin history" aside={<Link to={`/admin/audit?business=${org.id}`} className="text-xs text-brand-orange-light hover:underline">Full log</Link>}>
            {org.audit.length ? (
              <ul className="flex flex-col gap-3 text-sm" data-testid="business-audit">
                {org.audit.map((e) => (
                  <li key={e.id}>
                    <p className="text-white">
                      {ACTION_LABELS[e.action]} <span className="text-neutral-500">· {e.adminEmail} · {dateTime(e.createdAt)}</span>
                    </p>
                    {describeAudit(e) && <p className="text-xs text-neutral-400">{describeAudit(e)}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">No admin actions yet.</p>
            )}
          </Panel>
        </div>
      )}
      {dialog && org && <SuspendDialog org={org} onClose={() => setDialog(false)} />}
    </AdminLayout>
  )
}
