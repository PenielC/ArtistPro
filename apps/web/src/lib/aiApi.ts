import { api, tokenStorage } from './api'

export type AiFeature = 'BRIEFING' | 'DRAFT' | 'CONTENT' | 'PRICING'
export type DraftDocument = 'INVOICE' | 'QUOTE' | 'CONTRACT' | 'BOOKING'
export type ContentType = 'ARTIST_BIO' | 'EPK_TAGLINE' | 'PRESS_RELEASE' | 'SOCIAL_POSTS'

export const CONTENT_TYPES: { value: ContentType; label: string; hint: string }[] = [
  { value: 'ARTIST_BIO', label: 'Artist bio', hint: 'A press-ready biography from the profile and press kit.' },
  { value: 'EPK_TAGLINE', label: 'Tagline', hint: 'A one-line tagline for the profile and press kit.' },
  { value: 'PRESS_RELEASE', label: 'Press release', hint: 'Announce news: a release, a festival slot, an award…' },
  { value: 'SOCIAL_POSTS', label: 'Social posts', hint: 'Three caption ideas for a platform.' },
]

export interface AiStatus {
  available: boolean
  provider: 'anthropic' | 'demo' | null
  model: string | null
  used: number
  limit: number
  resetsAt: string
}

export interface AiHistoryItem {
  id: string
  feature: AiFeature
  variant: string | null
  status: 'STREAMING' | 'COMPLETED' | 'REFUSED' | 'FAILED'
  output: string | null
  error: string | null
  instructions: string | null
  model: string
  costUsd: number
  createdAt: string
  user: { firstName: string } | null
}

export type AiStreamEvent =
  | { type: 'start'; generationId: string; model: string; demo: boolean }
  | { type: 'text'; text: string }
  | { type: 'done'; generationId: string; truncated: boolean; usage: { used: number; limit: number } }
  | { type: 'error'; message: string }

export async function getAiStatus(): Promise<AiStatus> {
  return (await api.get<AiStatus>('/ai/status')).data
}

export async function getAiHistory(feature?: AiFeature): Promise<AiHistoryItem[]> {
  return (await api.get<AiHistoryItem[]>('/ai/history', { params: feature ? { feature } : {} })).data
}

/**
 * POSTs to an AI endpoint and reads its Server-Sent Events. Uses fetch (not
 * EventSource) so the bearer token travels in a header. The status call first
 * goes through the axios client, whose interceptor refreshes an expired token.
 */
export async function streamAi(
  path: 'briefing' | 'draft' | 'content' | 'pricing',
  body: object,
  onEvent: (event: AiStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  await getAiStatus()
  const response = await fetch(`${api.defaults.baseURL}/ai/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStorage.getAccess()}` },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok || !response.body) {
    let message = 'The AI request failed. Please try again.'
    try {
      const data = (await response.json()) as { message?: string | string[] }
      message = Array.isArray(data.message) ? data.message[0] : (data.message ?? message)
    } catch {
      // not JSON; keep the generic message
    }
    onEvent({ type: 'error', message })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let boundary: number
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)) as AiStreamEvent)
      }
    }
  }
}
