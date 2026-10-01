import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { extractErrorMessage } from '../../lib/AuthContext'
import {
  listAdminOrganizations,
  timeAgo,
  type OrganizationSort,
  type OrganizationStatus,
  adminInputClass as inputClass,
} from '../../lib/adminApi'
import { AdminLayout, Pager, StatusPill } from './AdminLayout'

const STATUSES: { value: OrganizationStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

const SORTS: { value: OrganizationSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
]

export function AdminBusinessesPage() {
  const navigate = useNavigate()
  // Filters live in the URL, so Back from a business returns to the same page of results.
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const status = (params.get('status') as OrganizationStatus | null) ?? 'all'
  const sort = (params.get('sort') as OrganizationSort | null) ?? 'newest'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [draft, setDraft] = useState(search)

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === '' || (k === 'page' && v === '1')) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true },
    )

  // Search as you type, after a short pause.
  useEffect(() => {
    if (draft.trim() === search) return
    const timer = setTimeout(() => update({ q: draft.trim() || null, page: null }), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const { data, error, isFetching } = useQuery({
    queryKey: ['admin-organizations', search, status, sort, page],
    queryFn: () => listAdminOrganizations({ search, status, sort, page }),
    placeholderData: keepPreviousData,
  })

  return (
    <AdminLayout>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:w-96">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search business name or member email"
            className={`${inputClass} pl-9`}
            aria-label="Search businesses"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => update({ status: s.value === 'all' ? null : s.value, page: null })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                status === s.value ? 'border-brand-orange bg-brand-orange/15 text-white' : 'border-white/10 text-neutral-400 hover:text-white'
              }`}
              aria-pressed={status === s.value}
              data-testid={`status-${s.value}`}
            >
              {s.label}
              {data && <span className="ml-1.5 text-neutral-400">{data.counts[s.value]}</span>}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value === 'newest' ? null : e.target.value, page: null })}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white focus:border-brand-orange focus:outline-none"
            aria-label="Sort businesses"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value} className="bg-brand-ink">
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-6 text-sm text-red-400">{extractErrorMessage(error)}</p>}
      {data && (
        <>
          <div className={`mt-6 overflow-x-auto rounded-2xl border border-white/10 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[820px] text-left text-sm" data-testid="businesses-table">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Last active</th>
                  <th className="px-4 py-3 text-right font-medium">Members</th>
                  <th className="px-4 py-3 text-right font-medium">Artists</th>
                  <th className="px-4 py-3 text-right font-medium">Bookings</th>
                  <th className="px-4 py-3 text-right font-medium">AI this month</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.items.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/admin/businesses/${o.id}`)}
                    className="cursor-pointer hover:bg-white/[0.03]"
                    data-testid="business-row"
                  >
                    <td className="px-4 py-3">
                      <Link to={`/admin/businesses/${o.id}`} className="font-medium text-white hover:underline" onClick={(e) => e.stopPropagation()}>
                        {o.name}
                      </Link>
                      <p className="text-xs text-neutral-500">{o.owner ? o.owner.email : 'No owner'}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-300">{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-300">{timeAgo(o.lastActiveAt)}</td>
                    <td className="px-4 py-3 text-right text-neutral-300">{o.counts.users}</td>
                    <td className="px-4 py-3 text-right text-neutral-300">{o.counts.artists}</td>
                    <td className="px-4 py-3 text-right text-neutral-300">{o.counts.bookings}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-neutral-300">
                      {o.aiUsedThisMonth} / {o.aiMonthlyLimit}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill suspended={!!o.suspendedAt} />
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-neutral-500">
                      No businesses match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={(p) => update({ page: String(p) })} />
        </>
      )}
    </AdminLayout>
  )
}
