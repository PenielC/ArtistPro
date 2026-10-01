import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Megaphone, X } from 'lucide-react'
import { useState } from 'react'
import { getPublicPlatform } from '../lib/platformApi'

const DISMISSED_KEY = 'artbh_dismissed_announcement'

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

/** The platform-wide announcement set by an admin. Dismissing hides it until the message changes. */
export function AnnouncementBanner() {
  const { data } = useQuery({ queryKey: ['public-platform'], queryFn: getPublicPlatform, staleTime: 5 * 60_000 })
  const [dismissed, setDismissed] = useState(readDismissed)
  const announcement = data?.announcement
  if (!announcement || dismissed === announcement.updatedAt) return null

  const warning = announcement.tone === 'WARNING'
  const Icon = warning ? AlertTriangle : Megaphone

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, announcement!.updatedAt)
    } catch {
      // Storage unavailable: hidden for this page view only.
    }
    setDismissed(announcement!.updatedAt)
  }

  return (
    <div
      className={`flex items-start gap-3 border-b px-4 py-2.5 text-sm sm:px-8 ${
        warning ? 'border-amber-500/20 bg-amber-500/10 text-amber-100' : 'border-brand-purple/20 bg-brand-purple/10 text-violet-100'
      }`}
      role="status"
      data-testid="announcement"
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 whitespace-pre-line">{announcement.message}</p>
      <button onClick={dismiss} className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Dismiss announcement">
        <X size={16} />
      </button>
    </div>
  )
}
