import { useMutation, useQuery } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { formatMoney } from '../lib/money'
import { completeTestCheckout, getTestCheckout } from '../lib/paymentsApi'

/** Stands in for a provider's hosted checkout when the server's test provider is enabled. No money moves. */
export function TestCheckoutPage() {
  const { attemptId = '' } = useParams()
  const { data, isLoading } = useQuery({ queryKey: ['test-checkout', attemptId], queryFn: () => getTestCheckout(attemptId), retry: false })
  const complete = useMutation({
    mutationFn: (outcome: 'paid' | 'cancelled') => completeTestCheckout(attemptId, outcome),
    onSuccess: ({ returnUrl }) => {
      if (returnUrl) window.location.assign(returnUrl)
    },
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-neutral-900">
        <p className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
          <FlaskConical size={14} />
          Test checkout: no real money
        </p>
        {isLoading ? (
          <p className="mt-6 text-sm text-neutral-500">Loading…</p>
        ) : !data ? (
          <p className="mt-6 text-sm text-neutral-600">This test payment doesn't exist.</p>
        ) : (
          <>
            <p className="mt-5 text-sm text-neutral-500">
              {data.businessName} · {data.invoiceNumber}
            </p>
            <p className="mt-1 text-3xl font-bold">{formatMoney(data.amount, data.currency)}</p>
            {data.status === 'PENDING' ? (
              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={() => complete.mutate('paid')}
                  disabled={complete.isPending}
                  className="h-11 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  Approve payment
                </button>
                <button
                  onClick={() => complete.mutate('cancelled')}
                  disabled={complete.isPending}
                  className="h-11 rounded-lg border border-neutral-300 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <p className="mt-6 text-sm text-neutral-600">
                This test payment is already {data.status.toLowerCase()}.{' '}
                {data.returnUrl && (
                  <a href={data.returnUrl} className="font-medium text-[#fa5813] underline">
                    Back to the invoice
                  </a>
                )}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
