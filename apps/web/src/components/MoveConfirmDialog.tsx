import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, FileText, X } from 'lucide-react'
import { extractErrorMessage } from '../lib/AuthContext'
import { applyMoves, formatDay, previewMoves, type MoveRequest } from '../lib/calendarApi'
import { Button } from './ui/button'

const short = (day: string) => formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })

/**
 * Confirm step for any move that includes bookings: for each booking, what
 * else is on its new day and which documents keep the old date. Moving
 * applies the whole group at once (all or nothing).
 */
export function MoveConfirmDialog({
  moves,
  onDone,
  onCancel,
}: {
  moves: MoveRequest[]
  onDone: (undo: MoveRequest[]) => void
  onCancel: () => void
}) {
  const { data: preview, error: previewError } = useQuery({
    queryKey: ['moves-preview', moves],
    queryFn: () => previewMoves(moves),
    gcTime: 0,
  })
  const apply = useMutation({ mutationFn: () => applyMoves(moves), onSuccess: (r) => onDone(r.undo) })
  const count = moves.length
  const single = count === 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-labelledby="move-title">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="move-title" className="text-lg font-bold text-white">
            {single ? 'Move booking?' : `Move ${count} items?`}
          </h2>
          <button onClick={onCancel} className="text-neutral-500 hover:text-white" aria-label="Cancel move">
            <X size={18} />
          </button>
        </div>

        {!preview && !previewError && <p className="mt-4 text-sm text-neutral-500">Checking the new days…</p>}
        {previewError && <p className="mt-4 text-sm text-red-400">{extractErrorMessage(previewError)}</p>}
        {preview && (
          <div className="mt-4 flex flex-col gap-4" data-testid="move-preview">
            {preview.bookings.map((b) => (
              <section key={b.id} className="rounded-xl border border-white/10 p-3" data-testid="move-booking">
                <p className="font-medium text-white">{b.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-neutral-300">
                  {b.from ? short(b.from) : 'No date'}
                  <ArrowRight size={14} className="text-brand-orange-light" />
                  <span className="font-semibold text-white">{short(b.to)}</span>
                  {b.inPast && <span className="rounded bg-white/10 px-1.5 text-xs text-neutral-300">in the past</span>}
                </p>
                {b.clashes.length > 0 && (
                  <p className="mt-2 flex gap-2 rounded-lg bg-red-500/10 px-2.5 py-2 text-xs text-red-200" data-testid="move-clash">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>Clash: {b.clashes.map((c) => (c.type === 'BLOCKED' ? `blocked (${c.title})` : c.title)).join(', ')}.</span>
                  </p>
                )}
                {b.linked.length > 0 && (
                  <div className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-100" data-testid="move-linked">
                    <p className="flex items-center gap-1.5 font-medium">
                      <FileText size={13} />
                      These stay as they are:
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-200/90">
                      {b.linked.map((l) => (
                        <li key={l.label}>
                          <span className="font-medium">{l.label}</span>: {l.note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ))}
            {preview.entryCount > 0 && (
              <p className="text-sm text-neutral-400">
                Plus {preview.entryCount} of your own {preview.entryCount === 1 ? 'entry' : 'entries'}, moving by the same number of days.
              </p>
            )}
            {preview.bookings.some((b) => b.clashes.length > 0) && <p className="text-xs text-neutral-500">Clashes are warnings only; you can still move.</p>}
            {preview.bookings.some((b) => b.linked.length > 0) && (
              <p className="text-xs text-neutral-500">Let clients know about new dates, and update or reissue documents if needed.</p>
            )}
          </div>
        )}

        {apply.error && <p className="mt-3 text-sm text-red-400">{extractErrorMessage(apply.error)}</p>}
        <div className="mt-5 flex gap-2">
          <Button onClick={() => apply.mutate()} disabled={!preview || apply.isPending} className="h-10 flex-1 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            {apply.isPending ? 'Moving…' : single ? 'Move booking' : `Move ${count} items`}
          </Button>
          <Button onClick={onCancel} variant="outline" className="h-10 rounded-lg border-white/10 bg-transparent text-white hover:bg-white/5">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
