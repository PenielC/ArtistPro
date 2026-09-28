import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bell, BellRing, CheckCheck, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getInbox, markAllNotificationsRead, markNotificationRead, type Inbox, type InboxNotification } from '../lib/notificationsApi'

const ICONS: Record<InboxNotification['type'], { icon: typeof Bell; className: string }> = {
  PAYMENT_RECEIVED: { icon: Wallet, className: 'text-emerald-400' },
  EMAIL_FAILED: { icon: AlertTriangle, className: 'text-red-300' },
  REMINDERS_SENT: { icon: BellRing, className: 'text-amber-300' },
}

/** Relative to when the list was last fetched (refreshed every 30s), so rendering stays pure. */
function timeAgo(iso: string, now: number) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString()
}

export function NotificationBell() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data, dataUpdatedAt } = useQuery({ queryKey: ['inbox'], queryFn: getInbox, refetchInterval: 30_000 })

  const update = (inbox: Inbox) => queryClient.setQueryData(['inbox'], inbox)
  const markRead = useMutation({
    mutationFn: markNotificationRead,
    // Update the cache immediately: clicking an item navigates, which remounts the
    // bell, and the badge must not wait on the request to clear.
    onMutate: (id: string) => {
      queryClient.setQueryData<Inbox>(['inbox'], (prev) =>
        prev && {
          unread: Math.max(0, prev.unread - (prev.items.some((i) => i.id === id && !i.readAt) ? 1 : 0)),
          items: prev.items.map((i) => (i.id === id && !i.readAt ? { ...i, readAt: new Date().toISOString() } : i)),
        },
      )
    },
    onSuccess: update,
    onError: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  })
  const markAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: update })

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function handleItem(item: InboxNotification) {
    if (!item.readAt) markRead.mutate(item.id)
    setOpen(false)
    if (item.link) navigate(item.link)
  }

  const unread = data?.unread ?? 0

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white"
        aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white" data-testid="unread-count">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-brand-ink shadow-2xl" data-testid="notification-panel">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            {unread > 0 && (
              <button onClick={() => markAll.mutate()} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white">
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
          </div>
          {!data || data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">Nothing yet. Payments and email problems show up here.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-white/5 overflow-y-auto">
              {data.items.map((item) => {
                const { icon: Icon, className } = ICONS[item.type]
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => handleItem(item)}
                      className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-white/5 ${item.readAt ? 'opacity-60' : ''}`}
                    >
                      <Icon size={16} className={`mt-0.5 shrink-0 ${className}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-white">{item.title}</span>
                        {item.body && <span className="mt-0.5 block text-xs text-neutral-400">{item.body}</span>}
                        <span className="mt-1 block text-[11px] text-neutral-600">{timeAgo(item.createdAt, dataUpdatedAt)}</span>
                      </span>
                      {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-orange" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
