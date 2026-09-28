import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer, X } from 'lucide-react'
import { useState } from 'react'
import { extractErrorMessage, useAuth } from '../lib/AuthContext'
import {
  CONTRACT_STATUSES,
  formatContractNumber,
  listContracts,
  updateContractStatus,
  type ContractStatus,
} from '../lib/contractsApi'
import { Logo } from './Logo'
import { EmailDocumentButton } from './EmailDocumentButton'
import { Button } from './ui/button'

// Mirrors the API's rules so we only offer moves it will accept.
const NEXT_ACTIONS: Record<ContractStatus, { status: ContractStatus; label: string; tone: 'primary' | 'plain' | 'danger' }[]> = {
  DRAFT: [
    { status: 'SENT', label: 'Mark as sent', tone: 'primary' },
    { status: 'CANCELLED', label: 'Cancel contract', tone: 'danger' },
  ],
  SENT: [
    { status: 'SIGNED', label: 'Mark as signed', tone: 'primary' },
    { status: 'DRAFT', label: 'Back to draft', tone: 'plain' },
    { status: 'CANCELLED', label: 'Cancel contract', tone: 'danger' },
  ],
  SIGNED: [{ status: 'CANCELLED', label: 'Cancel contract', tone: 'danger' }],
  CANCELLED: [],
}

const todayIso = () => new Date().toISOString().slice(0, 10)

export function ContractDocumentModal({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: contracts } = useQuery({ queryKey: ['contracts'], queryFn: listContracts })
  const contract = contracts?.find((c) => c.id === contractId)
  const [error, setError] = useState<string | null>(null)

  const statusMutation = useMutation({
    mutationFn: ({ status, signedAt }: { status: ContractStatus; signedAt?: string }) =>
      updateContractStatus(contractId, status, signedAt),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
    onError: (err) => setError(extractErrorMessage(err)),
  })

  if (!contract) return null

  const statusMeta = CONTRACT_STATUSES[contract.status]

  function handleAction(status: ContractStatus) {
    setError(null)
    if (status === 'SIGNED') {
      const entered = window.prompt('Date the contract was signed (YYYY-MM-DD):', todayIso())
      if (entered === null) return
      const value = entered.trim() || todayIso()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        setError('Please enter the date as YYYY-MM-DD.')
        return
      }
      statusMutation.mutate({ status, signedAt: value })
      return
    }
    if (status === 'CANCELLED' && !window.confirm('Cancel this contract? This cannot be undone.')) return
    statusMutation.mutate({ status })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="w-full max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2 print:hidden">
          {NEXT_ACTIONS[contract.status].map((action) => (
            <Button
              key={action.status}
              onClick={() => handleAction(action.status)}
              disabled={statusMutation.isPending}
              variant={action.tone === 'primary' ? 'default' : 'outline'}
              className={
                action.tone === 'primary'
                  ? 'rounded-lg bg-sky-600 text-white hover:bg-sky-500'
                  : action.tone === 'danger'
                    ? 'rounded-lg border-red-500/30 bg-transparent text-red-300 hover:bg-red-500/10'
                    : 'rounded-lg border-white/15 bg-transparent text-white hover:bg-white/5'
              }
            >
              {action.label}
            </Button>
          ))}
          {contract.status !== 'CANCELLED' && <EmailDocumentButton kind="CONTRACT" documentId={contract.id} />}
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
              <p className="text-2xl font-bold tracking-wide text-neutral-900">CONTRACT</p>
              <p className="mt-1 text-sm font-semibold text-brand-orange">{formatContractNumber(contract.number)}</p>
              <p className="mt-2 text-xs text-neutral-500">Created {new Date(contract.createdAt).toLocaleDateString()}</p>
              {contract.status === 'SIGNED' && contract.signedAt && (
                <p className="mt-2 inline-block rounded border-2 border-emerald-600 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  SIGNED {new Date(contract.signedAt).toLocaleDateString()}
                </p>
              )}
              {contract.status === 'CANCELLED' && (
                <p className="mt-2 inline-block rounded border-2 border-red-600 px-2 py-0.5 text-xs font-bold text-red-700">CANCELLED</p>
              )}
            </div>
          </div>

          <div data-testid="contract-body" className="mt-6 whitespace-pre-line text-sm leading-relaxed text-neutral-800">
            {contract.body}
          </div>

          <div className="mt-12 grid grid-cols-2 gap-10">
            {[
              { role: 'For the Artist', name: contract.artistName },
              { role: 'For the Client', name: contract.clientName },
            ].map((party) => (
              <div key={party.role}>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{party.role}</p>
                <p className="mt-1 text-sm font-semibold text-neutral-900">{party.name}</p>
                <div className="mt-10 border-b border-neutral-400" />
                <p className="mt-1 text-xs text-neutral-500">Signature</p>
                <div className="mt-6 border-b border-neutral-400" />
                <p className="mt-1 text-xs text-neutral-500">Date</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-brand-ink p-5 text-sm print:hidden">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>{statusMeta.label}</span>
          <p className="mt-3 text-neutral-400">
            The wording above was fixed when this contract was created — editing a template later won&apos;t change it.
          </p>
          <p className="mt-2 text-neutral-500">
            Signing is recorded by hand for now: print or save as PDF, have both parties sign, then mark it signed here.
            Electronic signatures aren&apos;t available yet.
          </p>
        </div>
      </div>
    </div>
  )
}
