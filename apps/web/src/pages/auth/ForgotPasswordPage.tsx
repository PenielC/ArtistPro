import { Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { extractErrorMessage } from '../../lib/AuthContext'
import { requestPasswordReset } from '../../lib/authApi'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you sign in with and we'll send you a link to choose a new password."
      footer={
        <Link to="/login" className="font-medium text-brand-orange-light hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200" role="status" data-testid="reset-sent">
          If <span className="font-medium text-white">{email}</span> has an ArtBH account, a reset link is on its way.
          It works for one hour. Check your spam folder if it doesn&apos;t arrive in a few minutes.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 h-11 rounded-lg bg-brand-orange text-sm font-semibold text-white hover:bg-brand-orange/90"
          >
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
