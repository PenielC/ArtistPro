import { Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const VISIBLE_MS = 7000

/** A short confirmation with an Undo button that dismisses itself after a few seconds. */
export function UndoToast({ message, onUndo, onClose }: { message: string; onUndo: () => Promise<void>; onClose: () => void }) {
  const [undoing, setUndoing] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (undoing) return
    const timer = setTimeout(onClose, VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [message, onClose, undoing])

  async function undo() {
    setUndoing(true)
    try {
      await onUndo()
      onClose()
    } catch {
      setFailed(true)
      setUndoing(false)
    }
  }

  return (
    <div
      role="status"
      data-testid="undo-toast"
      className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-sm text-white shadow-2xl"
    >
      <span className="min-w-0 flex-1">{failed ? "Couldn't undo. Please move it back by hand." : message}</span>
      {!failed && (
        <button onClick={undo} disabled={undoing} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold text-brand-orange-light hover:bg-white/5 disabled:opacity-50">
          <Undo2 size={14} />
          {undoing ? 'Undoing…' : 'Undo'}
        </button>
      )}
      <button onClick={onClose} className="rounded p-1 text-neutral-500 hover:text-white" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}
