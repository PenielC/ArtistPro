import { CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { extractErrorMessage, useAuth } from '../../lib/AuthContext'
import { verifyEmail } from '../../lib/authApi'
import { AuthLayout } from './AuthLayout'

type State = { kind: 'checking' } | { kind: 'done' } | { kind: 'failed'; message: string }

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, refreshUser } = useAuth()
  const [state, setState] = useState<State>(token ? { kind: 'checking' } : { kind: 'failed', message: 'This link is incomplete.' })
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    verifyEmail(token)
      .then(async () => {
        setState({ kind: 'done' })
        if (user) await refreshUser().catch(() => {})
      })
      .catch((err) => setState({ kind: 'failed', message: extractErrorMessage(err) }))
  }, [token, user, refreshUser])

  const next = user ? { to: '/dashboard', label: 'Go to your dashboard' } : { to: '/login', label: 'Sign in' }

  return (
    <AuthLayout
      title="Confirm your email"
      subtitle="One moment while we check your link."
      footer={
        <Link to={next.to} className="font-medium text-brand-orange-light hover:underline">
          {next.label}
        </Link>
      }
    >
      {state.kind === 'checking' && <p className="text-sm text-neutral-300">Checking…</p>}
      {state.kind === 'done' && (
        <p className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200" role="status" data-testid="verify-done">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          Your email is confirmed. You can now send quotes, invoices, contracts and payment links to your clients.
        </p>
      )}
      {state.kind === 'failed' && (
        <p className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-3 text-sm text-red-200" role="alert" data-testid="verify-failed">
          <XCircle size={18} className="mt-0.5 shrink-0" />
          <span>
            {state.message} {user ? 'You can send a new link from the banner on your dashboard.' : 'Sign in to send a new link.'}
          </span>
        </p>
      )}
    </AuthLayout>
  )
}
