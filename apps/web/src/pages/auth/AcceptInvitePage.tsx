import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PasswordField } from '../../components/PasswordField'
import { Button } from '../../components/ui/button'
import { extractErrorMessage, useAuth } from '../../lib/AuthContext'
import { getInvitation } from '../../lib/authApi'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../lib/teamApi'
import { AuthLayout } from './AuthLayout'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

export function AcceptInvitePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { user, acceptInvitation } = useAuth()
  const invite = useQuery({ queryKey: ['invitation', token], queryFn: () => getInvitation(token), enabled: !!token, retry: false })
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await acceptInvitation({ token, firstName, lastName, password })
      navigate('/dashboard')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const data = invite.data
  return (
    <AuthLayout
      title={data ? `Join ${data.organizationName}` : 'Join your team on ArtBH'}
      subtitle={data ? `${data.invitedByName} invited you as ${ROLE_LABELS[data.role]}.` : 'Checking your invitation…'}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-orange-light hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {!token || invite.isError ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-3 text-sm text-red-200" role="alert" data-testid="invite-invalid">
          {token ? extractErrorMessage(invite.error) : 'This link is incomplete. Open the link from your email again.'}
        </p>
      ) : !data ? (
        <p className="text-sm text-neutral-300">Loading…</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="rounded-lg bg-white/5 px-3 py-2.5 text-xs text-neutral-400">
            <span className="font-medium text-neutral-200">{ROLE_LABELS[data.role]}:</span> {ROLE_DESCRIPTIONS[data.role]}
          </p>
          {user && (
            <p className="text-xs text-amber-200">
              You&apos;re signed in as {user.email}. Accepting signs you in to the new account instead.
            </p>
          )}
          <div>
            <label htmlFor="inviteEmail" className="mb-1 block text-sm font-medium text-neutral-300">
              Email Address
            </label>
            <input id="inviteEmail" value={data.email} readOnly className={`${inputClass} opacity-70`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="mb-1 block text-sm font-medium text-neutral-300">
                First name
              </label>
              <input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="lastName" className="mb-1 block text-sm font-medium text-neutral-300">
                Last name
              </label>
              <input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-neutral-300">
              Choose a password
            </label>
            <PasswordField id="password" required minLength={8} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 h-11 rounded-lg bg-brand-orange text-sm font-semibold text-white hover:bg-brand-orange/90"
          >
            {isSubmitting ? 'Joining…' : `Join ${data.organizationName}`}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
