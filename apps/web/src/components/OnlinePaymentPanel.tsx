import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, Link2, Link2Off, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { extractErrorMessage } from '../lib/AuthContext'
import { formatMoney } from '../lib/money'
import {
  ATTEMPT_STATUSES,
  PROVIDER_LABELS,
  disablePaymentLink,
  enablePaymentLink,
  getInvoicePaymentInfo,
} from '../lib/paymentsApi'
import { whatsappShareUrl } from '../lib/whatsapp'
import { Button } from './ui/button'

/** Payment-link controls and online payment attempts, inside the invoice's internal panel. */
export function OnlinePaymentPanel({
  invoiceId,
  invoiceStatus,
  shareMessage,
}: {
  invoiceId: string
  invoiceStatus: string
  /** Builds the WhatsApp message around the payment link. */
  shareMessage: (link: string) => string
}) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: info } = useQuery({ queryKey: ['invoice-payment', invoiceId], queryFn: () => getInvoicePaymentInfo(invoiceId) })

  const linkMutation = useMutation({
    mutationFn: (enable: boolean) => (enable ? enablePaymentLink(invoiceId) : disablePaymentLink(invoiceId)),
    onSuccess: (data) => {
      setError(null)
      queryClient.setQueryData(['invoice-payment', invoiceId], data)
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  if (!info) return null
  const canShare = invoiceStatus === 'SENT' || invoiceStatus === 'PARTIALLY_PAID'

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this payment link:', link)
    }
  }

  return (
    <div className="mt-5 border-t border-white/10 pt-4" data-testid="online-payment">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Online payment</p>
        {info.provider ? (
          <span className="text-xs text-neutral-500">
            Via {PROVIDER_LABELS[info.provider]} ({info.currency})
          </span>
        ) : (
          <Link to="/payments" className="text-xs text-brand-orange-light hover:text-white">
            Set up {info.currency} online payments →
          </Link>
        )}
      </div>

      {info.link ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-white/5 px-3 py-2 text-xs text-neutral-300" data-testid="payment-link">
            {info.link}
          </code>
          <Button type="button" onClick={() => copy(info.link!)} variant="outline" className="h-8 gap-1.5 rounded-lg border-white/10 bg-transparent text-xs text-white hover:bg-white/5">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button asChild variant="outline" className="h-8 gap-1.5 rounded-lg border-white/10 bg-transparent text-xs text-white hover:bg-white/5">
            <a href={info.link} target="_blank" rel="noreferrer">
              <ExternalLink size={12} />
              Open
            </a>
          </Button>
          <Button asChild variant="outline" className="h-8 gap-1.5 rounded-lg border-emerald-500/30 bg-transparent text-xs text-emerald-300 hover:bg-emerald-500/10">
            <a href={whatsappShareUrl(shareMessage(info.link))} target="_blank" rel="noreferrer" data-testid="whatsapp-share">
              <MessageCircle size={12} />
              WhatsApp
            </a>
          </Button>
          <Button
            type="button"
            onClick={() => window.confirm('Turn off this payment link? Anyone holding it will no longer be able to pay. A new link can be created later.') && linkMutation.mutate(false)}
            disabled={linkMutation.isPending}
            variant="outline"
            className="h-8 gap-1.5 rounded-lg border-white/10 bg-transparent text-xs text-neutral-400 hover:bg-white/5 hover:text-red-300"
          >
            <Link2Off size={12} />
            Turn off
          </Button>
        </div>
      ) : canShare ? (
        <div className="mt-2">
          <Button
            type="button"
            onClick={() => linkMutation.mutate(true)}
            disabled={linkMutation.isPending}
            className="h-9 gap-2 rounded-lg bg-brand-orange text-sm text-white hover:bg-brand-orange/90"
          >
            <Link2 size={14} />
            Create payment link
          </Button>
          <p className="mt-1.5 text-xs text-neutral-500">
            Send it to your client: they see this invoice and can pay by EcoCash, OneMoney, card or ZIPIT. Payments are recorded here automatically.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-neutral-500">
          {invoiceStatus === 'DRAFT' ? 'Mark the invoice as sent to create a payment link.' : 'This invoice can’t take online payments.'}
        </p>
      )}

      {info.link && !info.provider && (
        <p className="mt-2 text-xs text-amber-400">Clients can view this invoice but can’t pay online until {info.currency} payments are set up.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {info.attempts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5" data-testid="payment-attempts">
          {info.attempts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-medium ${ATTEMPT_STATUSES[a.status].className}`}>{ATTEMPT_STATUSES[a.status].label}</span>
              <span className="text-neutral-300">{formatMoney(a.amount, a.currency)}</span>
              <span className="text-neutral-500">
                {new Date(a.createdAt).toLocaleString()} · {a.reference}
              </span>
              {a.failureReason && <span className="w-full text-amber-400/90">{a.failureReason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
