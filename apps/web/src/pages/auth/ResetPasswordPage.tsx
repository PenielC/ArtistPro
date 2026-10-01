import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PasswordField } from '../../components/PasswordField'
import { Button } from '../../components/ui/button'
import { extractErrorMessage, useAuth } from '../../lib/AuthContext'
import { resetPassword } from '../../lib/authApi'
import { AuthLayout } from './AuthLayout'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError("The two passwords don't match.")
    setIsSubmitting(true)
    try {
      await resetPassword(token, password)
      // Every session was signed out on the server; drop this one too.
      if (user) logout()
      navigate('/login', { state: { notice: 'Your password has been changed. Sign in with your new password.' } })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="You'll be signed out on every device, then you can sign in with the new password."
      footer={
        <Link to="/forgot-password" className="font-medium text-brand-orange-light hover:underline">
          Need a new link?
        </Link>
      }
    >
      {!token ? (
        <p className="text-sm text-red-400">This link is incomplete. Open the link from your email again, or ask for a new one.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-neutral-300">
              New password
            </label>
            <PasswordField id="password" required minLength={8} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-neutral-300">
              Confirm new password
            </label>
            <PasswordField id="confirm" required minLength={8} placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 h-11 rounded-lg bg-brand-orange text-sm font-semibold text-white hover:bg-brand-orange/90"
          >
            {isSubmitting ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
