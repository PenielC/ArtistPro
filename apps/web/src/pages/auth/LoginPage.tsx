import { Mail } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PasswordField } from '../../components/PasswordField'
import { Button } from '../../components/ui/button'
import { extractErrorMessage, useAuth } from '../../lib/AuthContext'
import { clearSessionNotice, readSessionNotice } from '../../lib/sessionNotice'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Why the previous session ended (suspended, expired), shown once.
  const location = useLocation()
  // A message handed over by the previous page (e.g. after a password reset), else why the last session ended.
  const [notice] = useState(() => (location.state as { notice?: string } | null)?.notice ?? readSessionNotice())
  useEffect(clearSessionNotice, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your account to continue."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-brand-orange-light hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {notice && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200" role="status" data-testid="session-notice">
            {notice}
          </p>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-neutral-300">
            Email Address
          </label>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              id="email"
              type="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-neutral-300">
              Password
            </label>
            <Link to="/forgot-password" className="text-xs font-medium text-brand-orange-light hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordField
            id="password"
            required
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 h-11 rounded-lg bg-brand-orange text-sm font-semibold text-white hover:bg-brand-orange/90"
        >
          {isSubmitting ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>
    </AuthLayout>
  )
}
