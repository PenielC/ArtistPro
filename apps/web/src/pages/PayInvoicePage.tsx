import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { CheckCircle2, Clock, Download, Lock, XCircle } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { extractErrorMessage } from '../lib/AuthContext'
import { formatMoney } from '../lib/money'
import { getAttemptStatus, getPublicInvoice, startPayment, type PublicInvoice } from '../lib/paymentsApi'

const POLL_MS = 3000
const GIVE_UP_AFTER_MS = 3 * 60_000

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Shown after the payer returns from the provider: waits for the payment to be confirmed. */
function AttemptBanner({ token, attemptId }: { token: string; attemptId: string }) {
  const queryClient = useQueryClient()
  const [startedAt] = useState(() => Date.now())
  const { data, isError, dataUpdatedAt } = useQuery({
    queryKey: ['attempt', token, attemptId],
    queryFn: () => getAttemptStatus(token, attemptId),
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' && Date.now() - startedAt < GIVE_UP_AFTER_MS ? POLL_MS : false),
  })

  const settled = data && data.status !== 'PENDING'
  useEffect(() => {
    if (settled) queryClient.invalidateQueries({ queryKey: ['public-invoice', token] })
  }, [settled, queryClient, token])

  if (isError) return null
  if (!data || data.status === 'PENDING') {
    // Measured to the latest poll, so the message changes once polling has stopped.
    const waitedTooLong = dataUpdatedAt - startedAt >= GIVE_UP_AFTER_MS
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="attempt-banner">
        <Clock size={18} className="mt-0.5 shrink-0" />
        <p>
          {waitedTooLong
            ? "We're still waiting for confirmation from the payment provider. If money left your account, it will show here once confirmed, and you can safely close this page."
            : 'Confirming your payment with the payment provider…'}
        </p>
      </div>
    )
  }
  if (data.status === 'PAID') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900" data-testid="attempt-banner">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
        <p>
          <strong>Payment received. Thank you!</strong> {formatMoney(data.amount, data.currency)} has been recorded against this invoice.
        </p>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-neutral-300 bg-neutral-100 p-4 text-sm text-neutral-800" data-testid="attempt-banner">
      <XCircle size={18} className="mt-0.5 shrink-0" />
      <p>
        {data.status === 'CANCELLED' ? 'The payment was cancelled.' : 'The payment did not go through.'} No money was taken. You can try again below.
      </p>
    </div>
  )
}

function PayBox({ token, invoice }: { token: string; invoice: PublicInvoice }) {
  const [custom, setCustom] = useState(false)
  const [amount, setAmount] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pay = useMutation({
    mutationFn: () =>
      startPayment(token, {
        amount: custom ? Number(amount) : undefined,
        email: email.trim() || undefined,
      }),
    // Leave for the provider's secure checkout page.
    onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
    onError: (err) => setError(extractErrorMessage(err)),
  })

  if (!invoice.onlinePayment.available) {
    return (
      <p className="rounded-xl bg-neutral-100 p-4 text-sm text-neutral-700 print:hidden" data-testid="pay-unavailable">
        {invoice.onlinePayment.unavailableReason}
      </p>
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    pay.mutate()
  }

  const payAmount = custom ? Number(amount) || 0 : invoice.balance
  const via = invoice.onlinePayment.provider === 'TEST' ? 'the test checkout' : 'Paynow (EcoCash, OneMoney, card or ZIPIT)'

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 print:hidden" data-testid="pay-box">
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} className="h-4 w-4 accent-[#fa5813]" />
        Pay part of the balance (e.g. a deposit)
      </label>
      {custom && (
        <input
          required
          type="number"
          min="0.01"
          step="0.01"
          max={invoice.balance}
          aria-label="Amount to pay"
          placeholder={`Amount in ${invoice.currency} (up to ${invoice.balance.toFixed(2)})`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:border-[#fa5813] focus:outline-none"
        />
      )}
      <input
        type="email"
        aria-label="Your email"
        placeholder="Your email (optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-3 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:border-[#fa5813] focus:outline-none"
      />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pay.isPending || payAmount <= 0}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#fa5813] text-base font-semibold text-white hover:bg-[#fa5813]/90 disabled:opacity-60"
      >
        <Lock size={16} />
        {pay.isPending ? 'Opening secure checkout…' : `Pay ${formatMoney(payAmount, invoice.currency)}`}
      </button>
      <p className="mt-2 text-center text-xs text-neutral-500">You'll complete payment securely via {via}.</p>
    </form>
  )
}

export function PayInvoicePage() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const attemptId = params.get('attempt')
  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['public-invoice', token],
    queryFn: () => getPublicInvoice(token),
    retry: (count, err) => !(axios.isAxiosError(err) && err.response?.status === 404) && count < 2,
  })

  useEffect(() => {
    if (invoice) document.title = `${invoice.number} | ${invoice.businessName}`
  }, [invoice])

  if (!invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 text-center">
        {isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Invoice not available</h1>
            <p className="mt-2 text-sm text-neutral-600">
              {axios.isAxiosError(error) && error.response?.status === 404
                ? 'This payment link is not valid or has been turned off. Please ask the sender for a new link.'
                : 'We could not load this invoice. Please try again in a moment.'}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-900 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {attemptId && <AttemptBanner token={token} attemptId={attemptId} />}

        <article className="rounded-2xl bg-white p-6 shadow-sm sm:p-10 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fa5813]">Invoice</p>
              <h1 className="mt-1 text-2xl font-bold">{invoice.businessName}</h1>
            </div>
            <div className="text-sm sm:text-right">
              <p className="font-semibold">{invoice.number}</p>
              <p className="text-neutral-500">Issued {formatDate(invoice.issueDate)}</p>
              {invoice.dueDate && <p className="text-neutral-500">Due {formatDate(invoice.dueDate)}</p>}
            </div>
          </header>

          <div className="mt-6 flex flex-wrap justify-between gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Billed to</p>
              <p className="mt-1 font-medium">{invoice.clientName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">For</p>
              <p className="mt-1 font-medium">{invoice.title}</p>
            </div>
          </div>

          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 font-medium">Description</th>
                <th className="hidden py-2 text-right font-medium sm:table-cell">Qty</th>
                <th className="hidden py-2 text-right font-medium sm:table-cell">Price</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-2.5 pr-3">
                    {item.description}
                    <span className="block text-xs text-neutral-500 sm:hidden">
                      {item.quantity} × {formatMoney(item.unitPrice, invoice.currency)}
                    </span>
                  </td>
                  <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{item.quantity}</td>
                  <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{formatMoney(item.unitPrice, invoice.currency)}</td>
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums">{formatMoney(item.quantity * item.unitPrice, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Total</dt>
              <dd className="tabular-nums">{formatMoney(invoice.total, invoice.currency)}</dd>
            </div>
            {invoice.amountPaid > 0 && (
              <div className="flex justify-between">
                <dt className="text-neutral-500">Paid</dt>
                <dd className="tabular-nums">−{formatMoney(invoice.amountPaid, invoice.currency)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-bold">
              <dt>Balance due</dt>
              <dd className="tabular-nums" data-testid="balance-due">{formatMoney(invoice.balance, invoice.currency)}</dd>
            </div>
          </dl>

          {invoice.notes && (
            <div className="mt-6 border-t border-neutral-100 pt-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Notes</p>
              <p className="mt-1 whitespace-pre-line text-neutral-700">{invoice.notes}</p>
            </div>
          )}
        </article>

        <PayBox token={token} invoice={invoice} />

        <footer className="flex items-center justify-between gap-3 px-1 text-xs text-neutral-500 print:hidden">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 hover:text-neutral-800">
            <Download size={14} />
            Download PDF
          </button>
          <span className="flex items-center gap-2">
            Powered by <Logo className="h-7" />
          </span>
        </footer>
      </div>
    </div>
  )
}
