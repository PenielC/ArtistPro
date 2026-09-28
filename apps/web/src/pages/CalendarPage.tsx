import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, GripVertical, Link2, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarDndProvider } from '../components/CalendarDndProvider'
import { CalendarEntryModal } from '../components/CalendarEntryModal'
import { CalendarMonthGrid } from '../components/CalendarMonthGrid'
import { CalendarSubscribeModal } from '../components/CalendarSubscribeModal'
import { DashboardLayout } from '../components/DashboardLayout'
import { MoveConfirmDialog } from '../components/MoveConfirmDialog'
import { UndoToast } from '../components/UndoToast'
import { Button } from '../components/ui/button'
import { listArtists } from '../lib/artistsApi'
import {
  applyMoves,
  CALENDAR_GROUPS,
  covers,
  dayDiff,
  ENTRY_KINDS,
  formatDay,
  getCalendar,
  isMovable,
  monthGrid,
  movesFor,
  parseDay,
  shiftDay,
  todayDay,
  type CalendarGroupId,
  type CalendarItem,
  type CalendarItemType,
  type MoveRequest,
} from '../lib/calendarApi'
import { agendaTarget, navTarget, PANEL_TARGET, useCalendarDnd, useCalendarDraggable, useCalendarDroppable } from '../lib/calendarDnd'

const TYPE_STYLES: Record<CalendarItemType, string> = {
  BOOKING: 'bg-brand-orange/20 text-orange-200',
  CONTRACT: 'bg-sky-500/15 text-sky-200',
  INVOICE_DUE: 'bg-amber-500/15 text-amber-200',
  QUOTE_EXPIRY: 'bg-violet-500/15 text-violet-200',
  PAYMENT: 'bg-emerald-500/15 text-emerald-200',
  ENTRY: 'bg-white/10 text-neutral-200',
}
const TYPE_LABELS: Record<CalendarItemType, string> = {
  BOOKING: 'Booking',
  CONTRACT: 'Contract',
  INVOICE_DUE: 'Invoice due',
  QUOTE_EXPIRY: 'Quote expires',
  PAYMENT: 'Payment',
  ENTRY: 'Entry',
}
const AGENDA_DAYS = 60
const short = (day: string) => formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })

function chipClass(item: CalendarItem) {
  if (item.type === 'INVOICE_DUE' && item.overdue) return 'bg-red-500/20 text-red-200'
  if (item.type === 'ENTRY' && item.entryKind === 'BLOCKED') return 'bg-neutral-500/25 text-neutral-300 line-through decoration-neutral-500'
  return TYPE_STYLES[item.type]
}

/**
 * One item in the day panel or agenda. Movable items get a grip handle (the
 * row itself stays a normal link/button: links are natively draggable in
 * browsers and would fight the drag sensor) and a checkbox for multi-move.
 */
function ItemRow({ item, day, scope, onEdit }: { item: CalendarItem; day: string; scope: string; onEdit: (item: CalendarItem) => void }) {
  const { isSelected, toggleSelected } = useCalendarDnd()
  const { movable, setNodeRef, isDragging, dragProps } = useCalendarDraggable(item, day, scope)
  const kindLabel = item.entryKind ? ENTRY_KINDS.find((k) => k.value === item.entryKind)?.label : null
  const body = (
    <>
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chipClass(item)}`}>
        {kindLabel ?? TYPE_LABELS[item.type]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{item.title}</span>
        <span className="block text-xs text-neutral-500">
          {[item.status, item.detail, item.artistName, item.date !== item.endDate ? `until ${formatDay(item.endDate, { day: 'numeric', month: 'short' })}` : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {item.conflict && (
          <span className="mt-1 flex items-center gap-1 text-xs text-red-300">
            <AlertTriangle size={12} />
            {item.conflict}
          </span>
        )}
      </span>
      {item.link && <ArrowRight size={14} className="mt-1 shrink-0 text-neutral-600" />}
    </>
  )
  const rowClass = 'flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-white/5'
  return (
    <div className={`flex items-start gap-1 ${isDragging ? 'opacity-40' : ''} ${isSelected(item) ? 'rounded-lg bg-sky-500/10' : ''}`}>
      {movable ? (
        <span className="flex shrink-0 flex-col items-center gap-1 pt-2.5">
          <span
            ref={setNodeRef}
            {...dragProps}
            aria-label={`Move ${item.title}`}
            aria-roledescription="draggable calendar item"
            className="cursor-grab touch-manipulation rounded p-0.5 text-neutral-500 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange active:cursor-grabbing"
          >
            <GripVertical size={14} />
          </span>
          <input
            type="checkbox"
            checked={isSelected(item)}
            onChange={() => toggleSelected(item)}
            aria-label={`Select ${item.title}`}
            className="h-3.5 w-3.5 accent-sky-400"
          />
        </span>
      ) : (
        <span className="w-[22px] shrink-0" />
      )}
      {item.link ? (
        <Link to={item.link} className={rowClass} data-testid="calendar-item" draggable={false}>
          {body}
        </Link>
      ) : (
        <button onClick={() => onEdit(item)} className={rowClass} data-testid="calendar-item">
          {body}
        </button>
      )}
    </div>
  )
}

/** Month arrow that also flips the month when an item is held over it mid-drag. */
function NavArrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  const { dragging } = useCalendarDnd()
  const { setNodeRef, isOver } = useCalendarDroppable(navTarget(dir))
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      aria-label={dir === 1 ? 'Next month' : 'Previous month'}
      data-testid={dir === 1 ? 'nav-next' : 'nav-prev'}
      className={`rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white ${dragging ? 'bg-white/5 ring-1 ring-white/20' : ''} ${
        isOver ? 'bg-brand-orange/25 text-white ring-2 ring-brand-orange' : ''
      }`}
    >
      {dir === 1 ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
    </button>
  )
}

function DayPanel({ day, items, onAdd, onEdit }: { day: string | null; items: CalendarItem[]; onAdd: () => void; onEdit: (item: CalendarItem) => void }) {
  const { dragging, groupSize } = useCalendarDnd()
  const { setNodeRef, isOver } = useCalendarDroppable(PANEL_TARGET, !day)
  return (
    <aside
      ref={setNodeRef}
      className={`rounded-xl border bg-white/[0.02] p-4 transition-colors ${isOver ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10'}`}
      data-testid="day-panel"
    >
      {day ? (
        <>
          <div className="flex items-center justify-between">
            <p className="font-semibold text-white">{formatDay(day)}</p>
            <button onClick={onAdd} className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/5 hover:text-white" aria-label="Add entry on this day">
              <Plus size={16} />
            </button>
          </div>
          {dragging && (
            <p className="mt-2 rounded-lg border border-dashed border-brand-orange/40 px-3 py-2 text-xs text-orange-200" data-testid="panel-drop-hint">
              Drop here to move {groupSize > 1 ? `${groupSize} items` : 'it'} to {short(day)}
            </p>
          )}
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Nothing on this day.</p>
          ) : (
            <div className="-mx-2 mt-2 flex flex-col">
              {items.map((i) => (
                <ItemRow key={i.id} item={i} day={day} scope="panel" onEdit={onEdit} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-500">Pick a day to see everything on it, or to add an entry. Pick one first to drop items on it.</p>
      )}
    </aside>
  )
}

function AgendaDay({ day, today, items, onEdit }: { day: string; today: string; items: CalendarItem[]; onEdit: (item: CalendarItem) => void }) {
  const { setNodeRef, isOver } = useCalendarDroppable(agendaTarget(day))
  return (
    <section
      ref={setNodeRef}
      data-agenda-day={day}
      className={`rounded-lg px-2 py-1 transition-colors ${isOver ? 'bg-brand-orange/15 ring-2 ring-brand-orange' : ''} ${items.length === 0 ? 'border border-dashed border-white/10' : ''}`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${day === today ? 'text-brand-orange-light' : 'text-neutral-500'}`}>
        {day === today ? 'Today · ' : ''}
        {formatDay(day)}
      </p>
      {items.length > 0 && (
        <div className="-mx-1 mt-1 flex flex-col">
          {items.map((i) => (
            <ItemRow key={i.id} item={i} day={day} scope="agenda" onEdit={onEdit} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Days with something on them; while dragging, every day, so there's somewhere to drop. */
function Agenda({ today, on, onEdit, empty }: { today: string; on: (day: string) => CalendarItem[]; onEdit: (item: CalendarItem) => void; empty: boolean }) {
  const { dragging } = useCalendarDnd()
  const days = Array.from({ length: AGENDA_DAYS }, (_, n) => shiftDay(today, n))
  return (
    <div className={`mt-4 flex flex-col ${dragging ? 'gap-1.5' : 'gap-4'}`} data-testid="agenda">
      {days
        .map((day) => ({ day, dayItems: on(day) }))
        .filter(({ dayItems }) => dragging || dayItems.length > 0)
        .map(({ day, dayItems }) => (
          <AgendaDay key={day} day={day} today={today} items={dayItems} onEdit={onEdit} />
        ))}
      {empty && !dragging && <p className="text-sm text-neutral-500">Nothing in the next {AGENDA_DAYS} days.</p>}
    </div>
  )
}

export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const today = todayDay()
  const focus = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today
  const [view, setView] = useState<'month' | 'agenda'>(() => (window.innerWidth < 768 ? 'agenda' : 'month'))
  const [selected, setSelected] = useState<string | null>(params.get('date'))
  const [artistId, setArtistId] = useState('')
  const [hidden, setHidden] = useState<Set<CalendarGroupId>>(new Set())
  const [editing, setEditing] = useState<{ entry?: CalendarItem; day?: string } | null>(null)
  const [subscribing, setSubscribing] = useState(false)
  const [confirming, setConfirming] = useState<{ moves: MoveRequest[]; label: string } | null>(null)
  const [toast, setToast] = useState<{ message: string; undo: () => Promise<void> } | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Map<string, CalendarItem>>(new Map())
  const [moveToDate, setMoveToDate] = useState('')
  const queryClient = useQueryClient()
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['calendar'] }), [queryClient])
  const closeToast = useCallback(() => setToast(null), [])

  const grid = useMemo(() => monthGrid(focus), [focus])
  const [from, to] = view === 'month' ? [grid.days[0], grid.days[41]] : [today, shiftDay(today, AGENDA_DAYS - 1)]
  const { data: artists } = useQuery({ queryKey: ['artists'], queryFn: listArtists })
  // Keep showing the previous range while a new one loads, so a drag across months never loses its targets.
  const { data: items, isLoading } = useQuery({
    queryKey: ['calendar', from, to, artistId],
    queryFn: () => getCalendar(from, to, artistId || undefined),
    placeholderData: keepPreviousData,
  })

  const hiddenTypes = new Set(CALENDAR_GROUPS.filter((g) => hidden.has(g.id)).flatMap((g) => g.types as readonly CalendarItemType[]))
  const visible = (items ?? []).filter((i) => !hiddenTypes.has(i.type))
  const on = (day: string) => visible.filter((i) => covers(i, day))
  const clashes = visible.filter((i) => i.conflict).length

  const toggleSelected = useCallback((item: CalendarItem) => {
    if (!isMovable(item)) return
    setSelection((prev) => {
      const next = new Map(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.set(item.id, item)
      return next
    })
  }, [])
  const clearSelection = useCallback(() => setSelection(new Map()), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selection.size > 0 && !editing && !confirming && !subscribing) clearSelection()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selection.size, editing, confirming, subscribing, clearSelection])

  const flipMonth = useCallback(
    (dir: -1 | 1) => {
      const d = parseDay(grid.month + '-01')
      d.setMonth(d.getMonth() + dir)
      setParams({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })
    },
    [grid.month, setParams],
  )

  function describe(itemsToMove: CalendarItem[], delta: number) {
    if (itemsToMove.length > 1) return `Moved ${itemsToMove.length} items ${delta > 0 ? 'forward' : 'back'} ${Math.abs(delta)} day${Math.abs(delta) === 1 ? '' : 's'}.`
    return `Moved "${itemsToMove[0].title}" to ${short(shiftDay(itemsToMove[0].date, delta))}.`
  }

  function afterMove(label: string, undo: MoveRequest[]) {
    clearSelection()
    setToast({
      message: label,
      undo: async () => {
        await applyMoves(undo)
        await refresh()
      },
    })
  }

  /** Moves a group by `delta` days: straight away for entries only, via the confirm dialog when bookings are involved. */
  async function moveGroup(itemsToMove: CalendarItem[], delta: number) {
    setMoveError(null)
    if (delta === 0 || itemsToMove.length === 0) return
    const moves = movesFor(itemsToMove, delta)
    const label = describe(itemsToMove, delta)
    if (moves.some((m) => m.type === 'BOOKING')) {
      setConfirming({ moves, label })
      return
    }
    try {
      const { undo } = await applyMoves(moves)
      await refresh()
      afterMove(label, undo)
    } catch {
      setMoveError(itemsToMove.length > 1 ? "Couldn't move those items; nothing was changed." : `Couldn't move "${itemsToMove[0].title}". Please try again.`)
    }
  }

  const handleDrop = (itemsToMove: CalendarItem[], fromDay: string, toDay: string) => void moveGroup(itemsToMove, dayDiff(fromDay, toDay))

  /** "Move to date…": the earliest selected item lands on the chosen day; the rest keep their spacing. */
  function moveSelectionTo(day: string) {
    const group = [...selection.values()]
    const earliest = group.map((i) => i.date).sort()[0]
    void moveGroup(group, dayDiff(earliest, day))
    setMoveToDate('')
  }

  const toggleGroup = (id: CalendarGroupId) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <DashboardLayout>
      <CalendarDndProvider selection={selection} onToggleSelected={toggleSelected} panelDay={view === 'month' ? selected : null} gridMonth={view === 'month' ? grid.month : null} onDrop={handleDrop} onFlipMonth={flipMonth}>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Calendar</h1>
              <p className="mt-1 text-sm text-neutral-400">Bookings, deadlines, payments and your own plans in one place.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setSubscribing(true)} variant="outline" className="gap-2 rounded-lg border-white/10 bg-transparent text-white hover:bg-white/5">
                <Link2 size={15} />
                Sync to phone
              </Button>
              <Button onClick={() => setEditing({ day: selected ?? today })} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
                <Plus size={15} />
                Add entry
              </Button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-white/10 p-0.5" role="tablist">
              {(['month', 'agenda'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 text-sm capitalize ${view === v ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white'}`}
                >
                  {v}
                </button>
              ))}
            </div>
            {view === 'month' && (
              <div className="flex items-center gap-1">
                <NavArrow dir={-1} onClick={() => { flipMonth(-1); setSelected(null) }} />
                <p className="min-w-40 text-center font-semibold text-white" data-testid="month-label">
                  {parseDay(grid.month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </p>
                <NavArrow dir={1} onClick={() => { flipMonth(1); setSelected(null) }} />
                <button onClick={() => { setParams({}); setSelected(today) }} className="ml-1 rounded-lg px-2.5 py-1.5 text-sm text-neutral-300 hover:bg-white/5 hover:text-white">
                  Today
                </button>
              </div>
            )}
            {artists && artists.length > 0 && (
              <select
                aria-label="Filter by artist"
                value={artistId}
                onChange={(e) => setArtistId(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-brand-orange focus:outline-none"
              >
                <option value="" className="bg-brand-ink">All artists</option>
                {artists.map((a) => (
                  <option key={a.id} value={a.id} className="bg-brand-ink">{a.name}</option>
                ))}
              </select>
            )}
            <div className="flex flex-wrap gap-1.5 sm:ml-auto">
              {CALENDAR_GROUPS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => toggleGroup(g.id)}
                  aria-pressed={!hidden.has(g.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${hidden.has(g.id) ? 'border-white/10 text-neutral-600 line-through' : 'border-white/20 text-neutral-200'}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {selection.size > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-100" data-testid="selection-bar">
              <span className="font-semibold">{selection.size} selected</span>
              <span className="text-xs text-sky-200/70">Drag any of them to move them all.</span>
              <label className="flex items-center gap-2 text-xs sm:ml-auto">
                Move to
                <input
                  type="date"
                  aria-label="Move selection to date"
                  value={moveToDate}
                  onChange={(e) => setMoveToDate(e.target.value)}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white [color-scheme:dark]"
                />
              </label>
              <Button onClick={() => moveSelectionTo(moveToDate)} disabled={!moveToDate} className="h-7 rounded-md bg-sky-500 px-2.5 text-xs text-white hover:bg-sky-400">
                Move
              </Button>
              <button onClick={clearSelection} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-sky-200 hover:bg-white/5" aria-label="Clear selection">
                <X size={12} />
                Clear
              </button>
            </div>
          )}

          {moveError && (
            <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-300" role="alert">
              {moveError}
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            Tip: drag a booking or one of your entries to another day (long-press on touch screens). Shift-click or tick several to move them together; hold one over ‹ › to change month.
          </p>

          {clashes > 0 && (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-300" data-testid="clash-banner">
              <AlertTriangle size={16} />
              {clashes} item{clashes === 1 ? '' : 's'} in view clash with another booking or a blocked day.
            </p>
          )}

          {isLoading ? (
            <p className="mt-6 text-sm text-neutral-500">Loading…</p>
          ) : view === 'month' ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
              <CalendarMonthGrid days={grid.days} month={grid.month} today={today} selected={selected} itemsOn={on} chipClass={chipClass} onSelect={setSelected} />
              <DayPanel day={selected} items={selected ? on(selected) : []} onAdd={() => setEditing({ day: selected ?? today })} onEdit={(entry) => setEditing({ entry })} />
            </div>
          ) : (
            <Agenda today={today} on={on} onEdit={(entry) => setEditing({ entry })} empty={visible.length === 0} />
          )}
        </div>
      </CalendarDndProvider>

      {editing && <CalendarEntryModal entry={editing.entry} day={editing.day} onClose={() => setEditing(null)} />}
      {subscribing && <CalendarSubscribeModal onClose={() => setSubscribing(false)} />}
      {confirming && (
        <MoveConfirmDialog
          moves={confirming.moves}
          onCancel={() => setConfirming(null)}
          onDone={async (undo) => {
            const { label } = confirming
            setConfirming(null)
            await refresh()
            afterMove(label, undo)
          }}
        />
      )}
      {toast && <UndoToast message={toast.message} onUndo={toast.undo} onClose={closeToast} />}
    </DashboardLayout>
  )
}
