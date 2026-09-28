import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { DashboardLayout } from '../components/DashboardLayout'
import { ReminderSettingsCard } from '../components/ReminderSettingsCard'
import { Button } from '../components/ui/button'
import { updateOrganizationCurrency } from '../lib/authApi'
import { extractErrorMessage, useAuth } from '../lib/AuthContext'
import { CURRENCIES } from '../lib/currencies'

export function SettingsPage() {
  const { user, setOrganizationCurrency } = useAuth()
  const [currency, setCurrency] = useState(user?.organizationCurrency ?? 'USD')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const isOwner = user?.role === 'OWNER'

  const mutation = useMutation({
    mutationFn: () => updateOrganizationCurrency(currency),
    onSuccess: (result) => {
      setOrganizationCurrency(result.currency)
      setMessage({ kind: 'ok', text: 'Base currency saved.' })
    },
    onError: (err) => setMessage({ kind: 'error', text: extractErrorMessage(err) }),
  })

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl px-8 py-10">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-neutral-400">{user?.organizationName}</p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-semibold text-white">Base currency</h2>
          <p className="mt-1 text-sm text-neutral-400">
            The currency you report in. Invoices can be issued in any currency; each one records its exchange rate to
            this currency so your revenue and outstanding totals add up.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select
              aria-label="Base currency"
              value={currency}
              disabled={!isOwner}
              onChange={(e) => {
                setCurrency(e.target.value)
                setMessage(null)
              }}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-brand-orange focus:outline-none disabled:opacity-60"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code} className="bg-brand-ink">
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            {isOwner && (
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || currency === user?.organizationCurrency}
                className="rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90"
              >
                {mutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            )}
          </div>

          {!isOwner && <p className="mt-3 text-xs text-neutral-500">Only the account owner can change this.</p>}
          {message && (
            <p className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role="status">
              {message.text}
            </p>
          )}
          <p className="mt-4 text-xs text-neutral-600">
            Once you&apos;ve created an invoice the base currency is locked, because every invoice&apos;s exchange rate is
            recorded against it.
          </p>
        </div>

        <ReminderSettingsCard />
      </div>
    </DashboardLayout>
  )
}
