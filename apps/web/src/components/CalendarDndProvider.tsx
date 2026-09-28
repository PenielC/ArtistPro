import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import { GripVertical, Layers } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dayDiff, formatDay, monthGrid, shiftDay, type CalendarItem } from '../lib/calendarApi'
import { CalendarDndContext, PANEL_TARGET, type DragData } from '../lib/calendarDnd'

const FLIP_AFTER_MS = 700

/** Pointer: whatever is under the cursor. Keyboard (no pointer): the nearest target. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : closestCenter(args)
}

/** The calendar day a drop target stands for (the panel stands for its selected day). */
function dayOfTarget(id: unknown, panelDay: string | null): string | null {
  if (typeof id !== 'string') return null
  if (id === PANEL_TARGET) return panelDay
  const m = id.match(/^(day|agenda):(\d{4}-\d{2}-\d{2})$/)
  return m ? m[2] : null
}

/**
 * One drag-and-drop layer for the whole calendar page: grid cells, agenda days,
 * the day panel and the month arrows are all drop targets. Dragging a selected
 * item moves the whole selection by the same number of days. Hovering a month
 * arrow flips the month mid-drag (keyboard: stepping past the grid's edge).
 */
export function CalendarDndProvider({
  children,
  selection,
  onToggleSelected,
  panelDay,
  gridMonth,
  onDrop,
  onFlipMonth,
}: {
  children: ReactNode
  selection: Map<string, CalendarItem>
  onToggleSelected: (item: CalendarItem) => void
  panelDay: string | null
  /** "YYYY-MM" of the month grid on screen (null in the agenda). */
  gridMonth: string | null
  onDrop: (items: CalendarItem[], fromDay: string, toDay: string) => void
  onFlipMonth: (dir: -1 | 1) => void
}) {
  const [dragging, setDragging] = useState<DragData | null>(null)
  // What was picked up, captured at drag start. dnd-kit's active.data can lose the item once the
  // source chip unmounts (e.g. its day leaves the grid after a month flip), so never read it mid-drag.
  const draggingRef = useRef<DragData | null>(null)
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs so the (stable) keyboard getter sees current values.
  const panelDayRef = useRef(panelDay)
  const gridMonthRef = useRef(gridMonth)
  const flipRef = useRef(onFlipMonth)
  useEffect(() => {
    panelDayRef.current = panelDay
    gridMonthRef.current = gridMonth
    flipRef.current = onFlipMonth
  })

  const stopFlip = () => {
    if (flipTimer.current) clearTimeout(flipTimer.current)
    flipTimer.current = null
  }
  useEffect(() => stopFlip, [])

  /** Arrows move by date: ←/→ a day, ↑/↓ a week (a day in the agenda). Past the grid's edge, the month flips. */
  const keyboardCoordinates = useMemo<KeyboardCoordinateGetter>(
    () => (event, { currentCoordinates, context }) => {
      const overId = context.over?.id
      const baseDay = dayOfTarget(overId, panelDayRef.current)
      if (typeof overId !== 'string' || !baseDay) return undefined
      const inAgenda = overId.startsWith('agenda:')
      const steps: Record<string, number> = inAgenda
        ? { [KeyboardCode.Right]: 1, [KeyboardCode.Down]: 1, [KeyboardCode.Left]: -1, [KeyboardCode.Up]: -1 }
        : { [KeyboardCode.Right]: 1, [KeyboardCode.Left]: -1, [KeyboardCode.Down]: 7, [KeyboardCode.Up]: -7 }
      const step = steps[event.code]
      if (!step) return undefined
      const current = context.droppableRects.get(overId)
      const targetDay = shiftDay(baseDay, step)
      const target = context.droppableRects.get(`${inAgenda ? 'agenda' : 'day'}:${targetDay}`)
      if (current && target) {
        return { x: currentCoordinates.x + (target.left - current.left), y: currentCoordinates.y + (target.top - current.top) }
      }
      // Past the grid's edge: flip the month and aim at where the target day will sit in the
      // new grid (layouts are predictable), so the item keeps its date rather than its screen spot.
      const month = gridMonthRef.current
      if (inAgenda || !month || !current) return undefined
      const dir = step > 0 ? 1 : -1
      const [y, m] = month.split('-').map(Number)
      const flipped = new Date(y, m - 1 + dir, 1)
      const newDays = monthGrid(`${flipped.getFullYear()}-${String(flipped.getMonth() + 1).padStart(2, '0')}-01`).days
      const from = monthGrid(`${month}-01`).days.indexOf(overId === PANEL_TARGET ? '' : baseDay)
      const to = newDays.indexOf(targetDay)
      flipRef.current(dir)
      if (from < 0 || to < 0) return undefined
      const w = current.width
      const h = current.height
      return {
        x: currentCoordinates.x + ((to % 7) - (from % 7)) * w,
        y: currentCoordinates.y + (Math.floor(to / 7) - Math.floor(from / 7)) * h,
      }
    },
    [],
  )

  const sensors = useSensors(
    // Mouse only: touches also fire pointer events, which would start a drag on a quick swipe.
    // A small movement is needed so clicks still select days.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press on touch screens, so a normal swipe still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  )

  const groupFor = (data: DragData) => (selection.has(data.item.id) ? [...selection.values()] : [data.item])
  const groupSize = dragging ? groupFor(dragging).length : 0
  const title = () => {
    const d = draggingRef.current
    if (!d) return 'The item'
    const n = groupFor(d).length
    return n > 1 ? `${n} items` : d.item.title
  }
  const where = (id: unknown) => {
    const day = dayOfTarget(id, panelDayRef.current)
    if (day) return formatDay(day)
    return typeof id === 'string' && id.startsWith('nav:') ? (id === 'nav:1' ? 'the next month' : 'the previous month') : 'nowhere'
  }
  const announcements: Announcements = {
    onDragStart: () => `Picked up ${title()}. Use the arrow keys to choose a day, space to drop, escape to cancel.`,
    onDragOver: ({ over }) => `${title()} is over ${where(over?.id)}.`,
    onDragEnd: ({ over }) => (dayOfTarget(over?.id, panelDayRef.current) ? `${title()} dropped on ${where(over?.id)}.` : `${title()} was not moved.`),
    onDragCancel: () => `Moving ${title()} was cancelled.`,
  }

  function handleStart(event: DragStartEvent) {
    const data = (event.active.data.current as DragData | undefined) ?? null
    draggingRef.current = data
    setDragging(data)
  }

  function handleOver(event: DragOverEvent) {
    stopFlip()
    const id = event.over?.id
    if (typeof id !== 'string' || !id.startsWith('nav:')) return
    const dir = id === 'nav:1' ? 1 : -1
    // Keep flipping every FLIP_AFTER_MS while the pointer rests on the arrow.
    const arm = () => {
      flipTimer.current = setTimeout(() => {
        flipRef.current(dir)
        arm()
      }, FLIP_AFTER_MS)
    }
    arm()
  }

  function handleEnd(event: DragEndEvent) {
    stopFlip()
    setDragging(null)
    // Not cleared here: dnd-kit announces the drop after this handler and still needs the title.
    const data = draggingRef.current
    const toDay = dayOfTarget(event.over?.id, panelDayRef.current)
    if (!data || !toDay || dayDiff(data.fromDay, toDay) === 0) return
    onDrop(groupFor(data), data.fromDay, toDay)
  }

  return (
    <CalendarDndContext.Provider value={{ dragging, groupSize, isSelected: (i) => selection.has(i.id), toggleSelected: onToggleSelected }}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        // Targets change mid-drag (a month flips, the agenda shows empty days), so keep measuring.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleStart}
        onDragOver={handleOver}
        onDragEnd={handleEnd}
        onDragCancel={() => {
          stopFlip()
          setDragging(null)
        }}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: 'To move this item, press space, use the arrow keys to choose a day, then press space again. Press escape to cancel.',
          },
        }}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <span className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-2.5 py-1.5 text-xs text-white shadow-2xl ring-2 ring-brand-orange" data-testid="drag-overlay">
              {groupSize > 1 ? <Layers size={13} /> : <GripVertical size={13} />}
              {groupSize > 1 ? `${groupSize} items` : dragging.item.title}
            </span>
          )}
        </DragOverlay>
      </DndContext>
    </CalendarDndContext.Provider>
  )
}
