import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { extractErrorMessage } from './AuthContext'
import { streamAi } from './aiApi'

export type AiStreamState = 'idle' | 'streaming' | 'done' | 'error'

/** Runs one AI generation at a time and exposes its growing text. Unmounting or starting again cancels the previous one. */
export function useAiStream() {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [state, setState] = useState<AiStreamState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const start = useCallback(
    async (path: Parameters<typeof streamAi>[0], body: object, onText?: (full: string) => void) => {
      controller.current?.abort()
      const ctrl = new AbortController()
      controller.current = ctrl
      setText('')
      setError(null)
      setTruncated(false)
      setState('streaming')
      let full = ''
      let settled = false
      try {
        await streamAi(
          path,
          body,
          (event) => {
            if (ctrl.signal.aborted) return
            if (event.type === 'start') setDemo(event.demo)
            else if (event.type === 'text') {
              full += event.text
              setText(full)
              onText?.(full)
            } else if (event.type === 'done') {
              settled = true
              setTruncated(event.truncated)
              setState('done')
            } else if (event.type === 'error') {
              settled = true
              setError(event.message)
              setState('error')
            }
          },
          ctrl.signal,
        )
        // The connection closed without a final event (network drop, server restart).
        if (!settled && !ctrl.signal.aborted) {
          setError('The response was interrupted. Please try again.')
          setState('error')
        }
      } catch (err) {
        if (ctrl.signal.aborted) return
        setError(err instanceof TypeError ? 'Could not reach the server. Please try again.' : extractErrorMessage(err))
        setState('error')
      } finally {
        if (!ctrl.signal.aborted) {
          queryClient.invalidateQueries({ queryKey: ['ai-status'] })
          queryClient.invalidateQueries({ queryKey: ['ai-history'] })
        }
      }
    },
    [queryClient],
  )

  /** Clears the output, cancelling anything in flight (e.g. when the request's inputs change). */
  const reset = useCallback(() => {
    controller.current?.abort()
    setText('')
    setError(null)
    setTruncated(false)
    setState('idle')
  }, [])

  const cancel = useCallback(() => {
    controller.current?.abort()
    setState((s) => (s === 'streaming' ? 'idle' : s))
  }, [])

  return { text, state, error, demo, truncated, start, cancel, reset }
}
