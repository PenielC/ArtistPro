import { useMutation } from '@tanstack/react-query'
import { MailWarning } from 'lucide-react'
import { extractErrorMessage, useAuth } from '../lib/AuthContext'
import { resendVerification } from '../lib/authApi'

/** Until the email is confirmed, sending to clients is blocked; this says why and offers a fresh link. */
export function VerifyEmailBanner() {
  const { user } = useAuth()
  const resend = useMutation({ mutationFn: resendVerification })
  if (!user || user.emailVerified !== false) return null

  return (
    <div
      className="flex flex-col gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100 sm:flex-row sm:items-center sm:px-8"
      role="status"
      data-testid="verify-banner"
    >
      <MailWarning size={16} className="hidden shrink-0 sm:block" />
      <p className="min-w-0 flex-1">
        Confirm your email to send quotes, invoices and payment links to clients. We sent a link to{' '}
        <span className="font-medium text-white">{user.email}</span>.
      </p>
      {resend.isSuccess ? (
        <span className="shrink-0 text-xs text-emerald-200">New link sent. Check your inbox.</span>
      ) : (
        <button
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
          className="shrink-0 self-start rounded-md border border-amber-300/40 px-3 py-1 text-xs font-medium hover:bg-amber-300/10 disabled:opacity-60 sm:self-auto"
        >
          {resend.isPending ? 'Sending…' : 'Send a new link'}
        </button>
      )}
      {resend.isError && <span className="shrink-0 text-xs text-red-200">{extractErrorMessage(resend.error)}</span>}
    </div>
  )
}
