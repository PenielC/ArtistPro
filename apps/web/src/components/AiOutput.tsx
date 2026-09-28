import { Check, Copy, Square } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { AiStreamState } from '../lib/useAiStream'
import { SimpleMarkdown } from './SimpleMarkdown'

/** Streamed AI text with its states, a copy button, and the "review before use" reminder. */
export function AiOutput({
  text,
  state,
  error,
  truncated,
  markdown = true,
  onCancel,
  actions,
}: {
  text: string
  state: AiStreamState
  error: string | null
  truncated?: boolean
  markdown?: boolean
  onCancel?: () => void
  actions?: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  if (state === 'idle' && !text) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this text:', text)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" data-testid="ai-output" data-state={state}>
      {state === 'streaming' && !text && <p className="animate-pulse text-sm text-neutral-400">Thinking…</p>}
      {text && (markdown ? <SimpleMarkdown text={text} /> : <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{text}</p>)}
      {state === 'streaming' && text && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-brand-orange align-middle" />}
      {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}
      {truncated && <p className="mt-3 text-xs text-amber-400">The answer was cut off because it reached the length limit.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
        {state === 'streaming' && onCancel && (
          <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/5 hover:text-white">
            <Square size={12} />
            Stop
          </button>
        )}
        {state !== 'streaming' && text && (
          <button onClick={copy} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/5 hover:text-white">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
        {state === 'done' && actions}
        <span className="ml-auto text-[11px] text-neutral-600">AI suggestion: check it before you use it.</span>
      </div>
    </div>
  )
}
