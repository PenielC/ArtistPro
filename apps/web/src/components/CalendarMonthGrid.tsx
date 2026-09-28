import { AlertTriangle } from 'lucide-react'
import type { MouseEvent } from 'react'
import { formatDay, type CalendarItem } from '../lib/calendarApi'
import { dayTarget, useCalendarDnd, useCalendarDraggable, useCalendarDroppable } from '../lib/calendarDnd'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function Chip({ item, day, className }: { item: CalendarItem; day: string; className: string }) {
  const { isSelected, toggleSelected } = useCalendarDnd()
  const { movable, setNodeRef, isDragging, dragProps } = useCalendarDraggable(item, day, 'grid')
  const selected = isSelected(item)

  // Shift/Ctrl/⌘-click adds to or removes from the multi-move selection; a plain click selects the day.
  function onClick(e: MouseEvent) {
    if (movable && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.stopPropagation()
      toggleSelected(item)
    }
  }

  return (
    <span
      ref={setNodeRef}
      {...dragProps}
      onClick={onClick}
      aria-label={movable ? `Move ${item.title}` : undefined}
      aria-roledescription={movable ? 'draggable calendar item' : undefined}
      aria-pressed={movable ? selected : undefined}
      data-testid={movable ? 'drag-chip' : undefined}
      className={`flex items-center gap-0.5 truncate rounded px-1.5 py-0.5 text-[11px] ${className} ${item.conflict ? 'ring-1 ring-red-400/70' : ''} ${
        selected ? 'ring-2 ring-sky-400' : ''
      } ${movable ? 'cursor-grab touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange active:cursor-grabbing' : ''} ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <span className="truncate">{item.title}</span>
    </span>
  )
}

function DayCell({
  day,
  items,
  inMonth,
  isToday,
  isSelected,
  chipClass,
  onSelect,
}: {
  day: string
  items: CalendarItem[]
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  chipClass: (item: CalendarItem) => string
  onSelect: (day: string) => void
}) {
  const { setNodeRef, isOver } = useCalendarDroppable(dayTarget(day))
  const hasClash = items.some((i) => i.conflict)
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      data-day={day}
      onClick={() => onSelect(day)}
      className={`flex min-h-24 cursor-pointer flex-col gap-1 border-b border-r border-white/5 p-1.5 transition-colors hover:bg-white/[0.04] ${
        isSelected ? 'bg-brand-orange/10 ring-1 ring-inset ring-brand-orange/40' : ''
      } ${isOver ? 'bg-brand-orange/20 ring-2 ring-inset ring-brand-orange' : ''} ${inMonth ? '' : 'opacity-40'}`}
    >
      <span className="flex items-center justify-between">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSelect(day)
          }}
          aria-label={formatDay(day)}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ${
            isToday ? 'bg-brand-orange font-bold text-white' : 'text-neutral-400'
          }`}
        >
          {Number(day.slice(8))}
        </button>
        {hasClash && <AlertTriangle size={12} className="text-red-400" aria-label="Clash" />}
      </span>
      {items.slice(0, 3).map((i) => (
        <Chip key={i.id} item={i} day={day} className={chipClass(i)} />
      ))}
      {items.length > 3 && <span className="px-1.5 text-[11px] text-neutral-500">+{items.length - 3} more</span>}
    </div>
  )
}

/** The month grid. Drag-and-drop comes from the page's CalendarDndProvider. */
export function CalendarMonthGrid({
  days,
  month,
  today,
  selected,
  itemsOn,
  chipClass,
  onSelect,
}: {
  days: string[]
  month: string
  today: string
  selected: string | null
  itemsOn: (day: string) => CalendarItem[]
  chipClass: (item: CalendarItem) => string
  onSelect: (day: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10" role="grid" aria-label="Month calendar">
      <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.03]" role="row">
        {WEEKDAYS.map((d) => (
          <p key={d} role="columnheader" className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {d}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <DayCell
            key={day}
            day={day}
            items={itemsOn(day)}
            inMonth={day.startsWith(month)}
            isToday={day === today}
            isSelected={selected === day}
            chipClass={chipClass}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
