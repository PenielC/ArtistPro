import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { extractErrorMessage } from '../../lib/AuthContext'
import {
  ACTION_LABELS,
  listAudit,
  type AdminAction,
  describeAudit,
} from '../../lib/adminApi'
import { AdminLayout, Pager } from './AdminLayout'

export function AdminAuditPage() {
  const [params, setParams] = useSearchParams()
  const action = (params.get('action') as AdminAction | null) ?? undefined
  const organizationId = params.get('business') ?? undefined
  const page = Math.max(1, Number(params.get('page')) || 1)

  const set = (k: string, v: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (v) next.set(k, v)
        else next.delete(k)
        if (k !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )

  const { data, error, isFetching } = useQuery({
    queryKey: ['admin-audit', page, action, organizationId],
    queryFn: () => listAudit({ page, action, organizationId }),
    placeholderData: keepPreviousData,
  })

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={action ?? ''}
          onChange={(e) => set('action', e.target.value || null)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
          aria-label="Filter by action"
        >
          <option value="" className="bg-brand-ink">
            All actions
          </option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value} className="bg-brand-ink">
              {label}
            </option>
          ))}
        </select>
        {organizationId && (
          <button onClick={() => set('business', null)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:text-white">
            One business only ✕
          </button>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-red-400">{extractErrorMessage(error)}</p>}
      {data && (
        <>
          <ul className={`mt-6 divide-y divide-white/5 rounded-2xl border border-white/10 transition-opacity ${isFetching ? 'opacity-60' : ''}`} data-testid="audit-list">
            {data.items.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-6">
                <span className="w-40 shrink-0 text-xs text-neutral-500">
                  {new Date(e.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">
                    {ACTION_LABELS[e.action]}
                    {e.organizationName && (
                      <>
                        {' · '}
                        {e.organizationId ? (
                          <Link to={`/admin/businesses/${e.organizationId}`} className="text-brand-orange-light hover:underline">
                            {e.organizationName}
                          </Link>
                        ) : (
                          <span className="text-neutral-300">{e.organizationName} (deleted)</span>
                        )}
                      </>
                    )}
                  </p>
                  {describeAudit(e) && <p className="mt-0.5 break-words text-xs text-neutral-400">{describeAudit(e)}</p>}
                </div>
                <span className="shrink-0 text-xs text-neutral-500">{e.adminEmail}</span>
              </li>
            ))}
            {data.items.length === 0 && <li className="px-4 py-12 text-center text-sm text-neutral-500">No admin actions recorded yet.</li>}
          </ul>
          <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </AdminLayout>
  )
}
