import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { extractErrorMessage, useAuth } from '../lib/AuthContext'
import {
  INVOICE_STATUSES,
  formatInvoiceNumber,
  listInvoices,
  recordInvoicePayment,
  updateInvoiceStatus,
  voidInvoicePayment,
} from '../lib/invoicesApi'
import { formatMoney, formatRate } from '../lib/money'
import { Logo } from './Logo'
import { OnlinePaymentPanel } from './OnlinePaymentPanel'
import { EmailDocumentButton } from './EmailDocumentButton'
import { Button } from './ui/button'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

export function InvoiceDocumentModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: invoices } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices })
  const invoice = invoices?.find((i) => i.id === invoiceId)

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['invoice-summary'] })
  }

  const statusMutation = useMutation({
    mutationFn: (status: 'DRAFT' | 'SENT' | 'VOID') => updateInvoiceStatus(invoiceId, status),
    onSuccess: refresh,
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const paymentMutation = useMutation({
    mutationFn: () =>
      recordInvoicePayment(invoiceId, { amount: Number(amount), method: method || undefined }),
    onSuccess: () => {
      setAmount('')
      setMethod('')
      refresh()
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const voidPaymentMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      voidInvoicePayment(invoiceId, paymentId, reason || undefined),
    onSuccess: refresh,
    onError: (err) => setError(extractErrorMessage(err)),
  })

  if (!invoice) return null

  const baseCurrency = user?.organizationCurrency ?? 'USD'
  const isForeign = invoice.currency !== baseCurrency
  const statusMeta = INVOICE_STATUSES[invoice.status]
  const canRecordPayment = invoice.status === 'SENT' || invoice.status === 'PARTIALLY_PAID'
  const canVoid = (invoice.status === 'DRAFT' || invoice.status === 'SENT') && invoice.amountPaid === 0

  function handleVoidPayment(paymentId: string) {
    const reason = window.prompt(
      'Void this payment? It stays on record but no longer counts toward the balance.\n\nOptional reason:',
    )
    if (reason === null) return // cancelled
    setError(null)
    voidPaymentMutation.mutate({ paymentId, reason: reason.trim() })
  }

  function handlePayment(e: FormEvent) {
    e.preventDefault()
    setError(null)
    paymentMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="w-full max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2 print:hidden">
          {invoice.status === 'DRAFT' && (
            <Button
              onClick={() => statusMutation.mutate('SENT')}
              className="rounded-lg bg-sky-600 text-white hover:bg-sky-500"
            >
              Mark as sent
            </Button>
          )}
          {canVoid && (
            <Button
              onClick={() => window.confirm('Void this invoice? This cannot be undone.') && statusMutation.mutate('VOID')}
              variant="outline"
              className="rounded-lg border-red-500/30 bg-transparent text-red-300 hover:bg-red-500/10"
            >
              Void
            </Button>
          )}
          {invoice.status !== 'VOID' && <EmailDocumentButton kind="INVOICE" documentId={invoice.id} />}
          <Button onClick={() => window.print()} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            <Printer size={15} />
            Print / Save as PDF
          </Button>
          <Button
            onClick={onClose}
            variant="outline"
            className="gap-2 rounded-lg border-white/15 bg-transparent text-white hover:bg-white/5"
          >
            <X size={15} />
            Close
          </Button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 print:hidden">{error}</p>}

        <div className="print-area rounded-lg bg-white p-10 text-neutral-900 shadow-2xl">
          <div className="flex items-start justify-between border-b border-neutral-200 pb-6">
            <div>
              <Logo variant="light" className="h-14" />
              <p className="mt-2 text-sm font-semibold text-neutral-800">{user?.organizationName}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tracking-wide text-neutral-900">INVOICE</p>
              <p className="mt-1 text-sm font-semibold text-brand-orange">{formatInvoiceNumber(invoice.number)}</p>
              <p className="mt-2 text-xs text-neutral-500">Issued {new Date(invoice.issueDate).toLocaleDateString()}</p>
              {invoice.dueDate && <p className="text-xs text-neutral-500">Due {new Date(invoice.dueDate).toLocaleDateString()}</p>}
              {invoice.status === 'PAID' && (
                <p className="mt-2 inline-block rounded border-2 border-emerald-600 px-2 py-0.5 text-sm font-bold text-emerald-700">PAID</p>
              )}
              {invoice.status === 'VOID' && (
                <p className="mt-2 inline-block rounded border-2 border-red-600 px-2 py-0.5 text-sm font-bold text-red-700">VOID</p>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Billed to</p>
              <p className="mt-1 font-semibold text-neutral-900">{invoice.clientName}</p>
              {invoice.clientEmail && <p className="text-sm text-neutral-500">{invoice.clientEmail}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Project</p>
              <p className="mt-1 font-semibold text-neutral-900">{invoice.title}</p>
              <p className="text-xs text-neutral-500">Amounts in {invoice.currency}</p>
            </div>
          </div>

          <table className="mt-8 w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="pb-2 font-semibold">Description</th>
                <th className="pb-2 text-right font-semibold">Qty</th>
                <th className="pb-2 text-right font-semibold">Unit price</th>
                <th className="pb-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b border-neutral-100">
                  <td className="py-3 pr-4">{item.description}</td>
                  <td className="py-3 text-right">{item.quantity}</td>
                  <td className="py-3 text-right">{formatMoney(item.unitPrice, invoice.currency)}</td>
                  <td className="py-3 text-right">{formatMoney(item.quantity * item.unitPrice, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <div className="w-64 text-sm">
              <div className="flex items-center justify-between py-1">
                <span>Total</span>
                <span className="font-semibold">{formatMoney(invoice.total, invoice.currency)}</span>
              </div>
              {invoice.amountPaid > 0 && (
                <div className="flex items-center justify-between py-1 text-neutral-600">
                  <span>Paid</span>
                  <span>− {formatMoney(invoice.amountPaid, invoice.currency)}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between border-t-2 border-neutral-900 pt-3">
                <span className="font-semibold">Balance due</span>
                <span className="text-xl font-bold">{formatMoney(invoice.balance, invoice.currency)}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-8 rounded-lg bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Notes &amp; payment details</p>
              <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{invoice.notes}</p>
            </div>
          )}

          <p className="mt-10 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
            Thank you for your business. Prepared with ArtBH.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-brand-ink p-5 text-sm print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>{statusMeta.label}</span>
            {invoice.overdue && (
              <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-300">Overdue</span>
            )}
          </div>

          {isForeign && (
            <p className="mt-3 text-neutral-400" data-testid="internal-rate">
              Internal record: 1 {invoice.currency} = {formatRate(invoice.exchangeRate)} {baseCurrency} (rate fixed when the
              invoice was created) · total ≈ {formatMoney(invoice.totalInBaseCurrency, baseCurrency)}
            </p>
          )}

          {invoice.payments.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Payments received</p>
              <ul className="mt-2 flex flex-col gap-1" data-testid="payments-list">
                {invoice.payments.map((p) => (
                  <li
                    key={p.id}
                    data-testid={p.voided ? 'voided-payment' : 'active-payment'}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className={p.voided ? 'text-neutral-600 line-through' : 'text-neutral-300'}>
                      {new Date(p.paidAt).toLocaleDateString()}
                      {p.method ? ` · ${p.method}` : ''}
                    </span>
                    {p.voided && (
                      <span className="flex-1 text-xs text-red-300/80">
                        Voided{p.voidReason ? ` — ${p.voidReason}` : ''}
                      </span>
                    )}
                    <span className={p.voided ? 'text-neutral-600 line-through' : 'font-medium text-white'}>
                      {formatMoney(p.amount, invoice.currency)}
                    </span>
                    {!p.voided && invoice.status !== 'VOID' && (
                      <button
                        type="button"
                        onClick={() => handleVoidPayment(p.id)}
                        disabled={voidPaymentMutation.isPending}
                        className="text-xs text-neutral-500 hover:text-red-300"
                        aria-label="Void payment"
                      >
                        Void
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canRecordPayment && (
            <form onSubmit={handlePayment} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                max={invoice.balance}
                aria-label="Payment amount"
                placeholder={`Amount (${invoice.currency}) — balance ${formatMoney(invoice.balance, invoice.currency)}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
              />
              <input
                placeholder="Method (e.g. EcoCash, bank transfer)"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={inputClass}
              />
              <Button
                type="submit"
                disabled={paymentMutation.isPending}
                className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {paymentMutation.isPending ? 'Saving…' : 'Record payment'}
              </Button>
            </form>
          )}

          <OnlinePaymentPanel
            invoiceId={invoice.id}
            invoiceStatus={invoice.status}
            shareMessage={(link) =>
              `Hi ${invoice.clientName}, here is invoice ${formatInvoiceNumber(invoice.number)} from ${user?.organizationName ?? 'us'} for ${formatMoney(invoice.balance, invoice.currency)}. You can view and pay it here: ${link}`
            }
          />
        </div>
      </div>
    </div>
  )
}
