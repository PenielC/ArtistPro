import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FlaskConical, Wallet } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { DashboardLayout } from '../components/DashboardLayout'
import { PasswordField } from '../components/PasswordField'
import { Button } from '../components/ui/button'
import { extractErrorMessage } from '../lib/AuthContext'
import { formatInvoiceNumber } from '../lib/invoicesApi'
import { formatMoney } from '../lib/money'
import {
  ATTEMPT_STATUSES,
  PAYNOW_CURRENCIES,
  PROVIDER_LABELS,
  getPaymentAccounts,
  listPaymentAttempts,
  removePaymentAccount,
  savePaymentAccount,
  type PaymentAccount,
  type PaymentAccounts,
} from '../lib/paymentsApi'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

function PaynowCurrencyCard({ currency, account }: { currency: string; account?: PaymentAccount }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(!account)
  const [integrationId, setIntegrationId] = useState(account?.integrationId ?? '')
  const [integrationKey, setIntegrationKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSaved = (data: PaymentAccounts) => {
    queryClient.setQueryData(['payment-accounts'], data)
    queryClient.invalidateQueries({ queryKey: ['invoice-payment'] })
  }

  const save = useMutation({
    mutationFn: () => savePaymentAccount({ provider: 'PAYNOW', currency, integrationId: integrationId.trim(), integrationKey: integrationKey.trim() }),
    onSuccess: (data) => {
      onSaved(data)
      setIntegrationKey('')
      setEditing(false)
      setError(null)
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: () => removePaymentAccount(account!.id),
    onSuccess: (data) => {
      onSaved(data)
      setIntegrationId('')
      setEditing(true)
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    save.mutate()
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5" data-testid={`paynow-${currency}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-white">Paynow · {currency}</p>
        {account ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 size={14} />
            Connected
          </span>
        ) : (
          <span className="text-xs text-neutral-500">Not connected</span>
        )}
      </div>

      {account && !editing ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-400">
            Integration ID <span className="font-medium text-white">{account.integrationId}</span> · key saved (hidden)
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setEditing(true)} variant="outline" className="h-8 rounded-lg border-white/10 bg-transparent text-xs text-white hover:bg-white/5">
              Replace keys
            </Button>
            <Button
              onClick={() => window.confirm(`Disconnect Paynow ${currency}? Clients won't be able to pay ${currency} invoices online until you reconnect.`) && remove.mutate()}
              variant="outline"
              className="h-8 rounded-lg border-white/10 bg-transparent text-xs text-neutral-400 hover:bg-white/5 hover:text-red-300"
            >
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
          <input
            required
            inputMode="numeric"
            aria-label={`${currency} Integration ID`}
            placeholder="Integration ID"
            value={integrationId}
            onChange={(e) => setIntegrationId(e.target.value)}
            className={inputClass}
          />
          <PasswordField
            id={`paynow-key-${currency}`}
            required
            aria-label={`${currency} Integration Key`}
            placeholder="Integration Key"
            autoComplete="off"
            value={integrationKey}
            onChange={(e) => setIntegrationKey(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending} className="h-10 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
              {save.isPending ? 'Saving…' : 'Connect'}
            </Button>
            {account && (
              <Button type="button" onClick={() => setEditing(false)} variant="outline" className="h-10 rounded-lg border-white/10 bg-transparent text-white hover:bg-white/5">
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  )
}

function TestProviderCard({ accounts }: { accounts: PaymentAccount[] }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const toggle = useMutation({
    mutationFn: ({ currency, account }: { currency: string; account?: PaymentAccount }) =>
      account ? removePaymentAccount(account.id) : savePaymentAccount({ provider: 'TEST', currency }),
    onSuccess: (data) => {
      queryClient.setQueryData(['payment-accounts'], data)
      queryClient.invalidateQueries({ queryKey: ['invoice-payment'] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  return (
    <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/[0.04] p-5" data-testid="test-provider">
      <p className="flex items-center gap-2 font-semibold text-amber-300">
        <FlaskConical size={16} />
        Test provider (development only)
      </p>
      <p className="mt-1 text-xs text-neutral-400">
        Simulates a checkout with Approve / Cancel buttons, so no real money moves. This server has it switched on; production servers don't. A connected Paynow account always takes priority.
      </p>
      <div className="mt-3 flex flex-wrap gap-4">
        {PAYNOW_CURRENCIES.map((currency) => {
          const account = accounts.find((a) => a.provider === 'TEST' && a.currency === currency)
          return (
            <label key={currency} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={!!account}
                disabled={toggle.isPending}
                onChange={() => toggle.mutate({ currency, account })}
                className="h-4 w-4 accent-brand-orange"
              />
              {currency}
            </label>
          )
        })}
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  )
}

export function PaymentsPage() {
  const { data: setup } = useQuery({ queryKey: ['payment-accounts'], queryFn: getPaymentAccounts })
  const { data: attempts, isLoading } = useQuery({ queryKey: ['payment-attempts'], queryFn: listPaymentAttempts })

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl px-8 py-10">
        <h1 className="text-2xl font-bold text-white">Payments</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Let clients pay invoices online. Money goes straight to your own Paynow merchant account.
        </p>

        {setup && !setup.configured && (
          <p className="mt-6 flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertTriangle size={16} />
            Online payments aren't configured on this server yet (missing encryption key). Contact support.
          </p>
        )}

        <section className="mt-8">
          <h2 className="font-semibold text-white">Payment providers</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Paynow takes EcoCash, OneMoney, Visa/Mastercard and ZIPIT. It issues a separate integration for each currency: copy the Integration ID and
            Key from your Paynow merchant dashboard. Your key is encrypted and never shown again. Only owners and finance users can change these.
          </p>
          {setup && (
            <div className="mt-4 flex flex-col gap-3">
              {PAYNOW_CURRENCIES.map((currency) => (
                <PaynowCurrencyCard
                  key={`${currency}-${setup.accounts.find((a) => a.provider === 'PAYNOW' && a.currency === currency)?.id ?? 'none'}`}
                  currency={currency}
                  account={setup.accounts.find((a) => a.provider === 'PAYNOW' && a.currency === currency)}
                />
              ))}
              {setup.testProviderAvailable && <TestProviderCard accounts={setup.accounts} />}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="font-semibold text-white">Online payments</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Every attempt a client makes through a payment link. Paid ones are already recorded on their invoice.
          </p>
          <div className="mt-4">
            {isLoading ? (
              <p className="text-sm text-neutral-500">Loading…</p>
            ) : !attempts || attempts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
                <Wallet size={28} className="mx-auto text-neutral-600" />
                <p className="mt-4 text-sm font-medium text-white">No online payments yet</p>
                <p className="mt-1 text-sm text-neutral-500">Open an invoice and create a payment link to send to your client.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-sm" data-testid="attempts-table">
                  <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Invoice</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {attempts.map((a) => (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-400">{new Date(a.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-white">
                          {formatInvoiceNumber(a.invoice.number)}
                          <span className="text-neutral-500"> · {a.invoice.clientName}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-white">{formatMoney(a.amount, a.currency)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ATTEMPT_STATUSES[a.status].className}`}>
                            {ATTEMPT_STATUSES[a.status].label}
                          </span>
                          {a.failureReason && <p className="mt-1 text-xs text-amber-400/90">{a.failureReason}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-500">
                          {a.reference}
                          <br />
                          {PROVIDER_LABELS[a.provider]}
                          {a.providerReference ? ` ${a.providerReference}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}
