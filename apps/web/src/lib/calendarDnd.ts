import { useDraggable, useDroppable } from '@dnd-kit/core'
import { createContext, useContext } from 'react'
import { isMovable, type CalendarItem } from './calendarApi'

/**
 * Drop-target ids shared by the grid, agenda, day panel and month arrows:
 * "day:YYYY-MM-DD" (grid cell), "agenda:YYYY-MM-DD" (agenda day), "panel"
 * (the day panel = its selected day), "nav:-1" / "nav:1" (month arrows).
 */
export const dayTarget = (day: string) => `day:${day}`
export const agendaTarget = (day: string) => `agenda:${day}`
export const PANEL_TARGET = 'panel'
export const navTarget = (dir: -1 | 1) => `nav:${dir}`

export interface DragData {
  item: CalendarItem
  /** The day the item was picked up from; the move is by the days between this and the drop. */
  fromDay: string
}

export interface CalendarDndState {
  /** What is being dragged right now (null when idle). */
  dragging: DragData | null
  /** How many items this drag moves (the whole selection when a selected item is dragged). */
  groupSize: number
  isSelected: (item: CalendarItem) => boolean
  toggleSelected: (item: CalendarItem) => void
}

export const CalendarDndContext = createContext<CalendarDndState>({
  dragging: null,
  groupSize: 0,
  isSelected: () => false,
  toggleSelected: () => {},
})

export function useCalendarDnd() {
  return useContext(CalendarDndContext)
}

/**
 * Makes a calendar item draggable from one place. `scope` keeps ids unique when
 * the same item shows in several places (grid cell, panel, agenda).
 */
export function useCalendarDraggable(item: CalendarItem, day: string, scope: string) {
  const movable = isMovable(item)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${scope}:${item.id}@${day}`,
    data: { item, fromDay: day } satisfies DragData,
    disabled: !movable,
  })
  return { movable, setNodeRef, isDragging, dragProps: movable ? { ...attributes, ...listeners } : {} }
}

export function useCalendarDroppable(id: string, disabled = false) {
  return useDroppable({ id, disabled })
}
