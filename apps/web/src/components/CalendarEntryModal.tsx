import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { extractErrorMessage } from '../lib/AuthContext'
import { listArtists } from '../lib/artistsApi'
import { createEntry, deleteEntry, ENTRY_KINDS, updateEntry, type CalendarItem, type EntryKind } from '../lib/calendarApi'
import { Button } from './ui/button'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20 [color-scheme:dark]'

/** Create (with a pre-picked day) or edit one of the user's own calendar entries. */
export function CalendarEntryModal({ entry, day, onClose }: { entry?: CalendarItem; day?: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: artists } = useQuery({ queryKey: ['artists'], queryFn: listArtists })
  const [title, setTitle] = useState(entry?.title ?? '')
  const [kind, setKind] = useState<EntryKind>(entry?.entryKind ?? 'REHEARSAL')
  const [artistId, setArtistId] = useState(entry?.artistId ?? '')
  const [startDate, setStartDate] = useState(entry?.date ?? day ?? '')
  const [endDate, setEndDate] = useState(entry?.endDate ?? day ?? '')
  const [startTime, setStartTime] = useState(entry?.startTime ?? '')
  const [endTime, setEndTime] = useState(entry?.endTime ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['calendar'] })
    onClose()
  }
  const save = useMutation({
    mutationFn: () => {
      const input = {
        title: title.trim(),
        kind,
        artistId: artistId || null,
        startDate,
        endDate: endDate && endDate !== startDate ? endDate : undefined,
        startTime: startTime || null,
        endTime: startTime && endTime ? endTime : null,
        notes: notes.trim() || null,
      }
      return entry ? updateEntry(entry.sourceId, input) : createEntry(input)
    },
    onSuccess: done,
    onError: (err) => setError(extractErrorMessage(err)),
  })
  const remove = useMutation({ mutationFn: () => deleteEntry(entry!.sourceId), onSuccess: done, onError: (err) => setError(extractErrorMessage(err)) })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (endDate && endDate < startDate) {
      setError('The end date must be on or after the start date.')
      return
    }
    save.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{entry ? 'Edit entry' : 'Add to calendar'}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close entry">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
          <input required maxLength={120} aria-label="Title" placeholder="What is it? (e.g. Band rehearsal)" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          <div className="grid grid-cols-2 gap-3">
            <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as EntryKind)} className={inputClass}>
              {ENTRY_KINDS.map((k) => (
                <option key={k.value} value={k.value} className="bg-brand-ink">{k.label}</option>
              ))}
            </select>
            <select aria-label="Entry artist" value={artistId} onChange={(e) => setArtistId(e.target.value)} className={inputClass}>
              <option value="" className="bg-brand-ink">{kind === 'BLOCKED' ? 'Everyone' : 'No specific artist'}</option>
              {artists?.map((a) => (
                <option key={a.id} value={a.id} className="bg-brand-ink">{a.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-neutral-500">
              From
              <input
                required
                type="date"
                aria-label="Start date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (!endDate || endDate < e.target.value) setEndDate(e.target.value)
                }}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-xs text-neutral-500">
              To
              <input type="date" aria-label="End date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="time" aria-label="Start time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
            <input type="time" aria-label="End time" disabled={!startTime} value={endTime} onChange={(e) => setEndTime(e.target.value)} className={`${inputClass} disabled:opacity-50`} />
          </div>
          <textarea aria-label="Notes" rows={2} maxLength={1000} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          {kind === 'BLOCKED' && (
            <p className="text-xs text-neutral-500">Bookings on blocked days are flagged as clashes{artistId ? ' for this artist' : ' for everyone'}.</p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="mt-1 flex gap-2">
            <Button type="submit" disabled={save.isPending} className="h-10 flex-1 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
              {save.isPending ? 'Saving…' : entry ? 'Save changes' : 'Add'}
            </Button>
            {entry && (
              <Button
                type="button"
                onClick={() => window.confirm('Delete this entry?') && remove.mutate()}
                disabled={remove.isPending}
                variant="outline"
                className="h-10 gap-1.5 rounded-lg border-red-500/30 bg-transparent text-red-300 hover:bg-red-500/10"
              >
                <Trash2 size={14} />
                Delete
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
