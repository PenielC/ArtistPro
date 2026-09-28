import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, FileText, Plus, ScrollText, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ContractDocumentModal } from '../components/ContractDocumentModal'
import { ContractTemplatesModal } from '../components/ContractTemplatesModal'
import { DashboardLayout } from '../components/DashboardLayout'
import { NewContractModal } from '../components/NewContractModal'
import { Button } from '../components/ui/button'
import {
  CONTRACT_STATUSES,
  deleteContract,
  formatContractNumber,
  listContracts,
  type Contract,
} from '../lib/contractsApi'
import { formatMoney } from '../lib/money'
import { useArtistNames } from '../lib/useArtistNames'
import type { Quote } from '../lib/quotesApi'

export function ContractsPage() {
  const artistNames = useArtistNames()
  // Arriving from a quote's "Create contract" button carries that quote along in router state.
  const location = useLocation()
  const quoteFromNav = (location.state as { quote?: Quote } | null)?.quote

  const [showNew, setShowNew] = useState(!!quoteFromNav)
  const [initialQuote, setInitialQuote] = useState<Quote | undefined>(quoteFromNav)
  const [showTemplates, setShowTemplates] = useState(false)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: contracts, isLoading } = useQuery({ queryKey: ['contracts'], queryFn: listContracts })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContract(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  })

  function handleDelete(contract: Contract) {
    if (window.confirm(`Delete draft ${formatContractNumber(contract.number)}?`)) {
      deleteMutation.mutate(contract.id)
    }
  }

  function closeNew() {
    setShowNew(false)
    setInitialQuote(undefined)
    // Drop the router state so a refresh doesn't reopen the form.
    window.history.replaceState({}, '')
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Contracts</h1>
            <p className="mt-1 text-sm text-neutral-400">Put every booking in writing, from reusable templates.</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowTemplates(true)}
              variant="outline"
              className="gap-2 rounded-lg border-white/15 bg-transparent text-white hover:bg-white/5"
            >
              <FileText size={16} />
              Templates
            </Button>
            <Button onClick={() => setShowNew(true)} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
              <Plus size={16} />
              New Contract
            </Button>
          </div>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : !contracts || contracts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <ScrollText size={28} className="mx-auto text-neutral-600" />
              <p className="mt-4 text-sm font-medium text-white">No contracts yet</p>
              <p className="mt-1 text-sm text-neutral-500">Create one from a booking or quote, or start from scratch.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {contracts.map((contract) => {
                const meta = CONTRACT_STATUSES[contract.status]
                return (
                  <div
                    key={contract.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-brand-orange-light">{formatContractNumber(contract.number)}</span>
                        <p className="font-semibold text-white">{contract.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        {contract.clientName}
                        {contract.artistId && artistNames.has(contract.artistId) && ` · for ${artistNames.get(contract.artistId)}`}
                        {contract.eventDate && ` · ${new Date(contract.eventDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}`}
                        {contract.venue && ` · ${contract.venue}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-semibold text-white">{formatMoney(contract.fee, contract.currency)}</p>
                        {contract.depositAmount > 0 && (
                          <p className="text-xs text-neutral-500">{formatMoney(contract.depositAmount, contract.currency)} deposit</p>
                        )}
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                      <button
                        onClick={() => setViewingId(contract.id)}
                        className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white"
                        aria-label="View contract"
                      >
                        <Eye size={15} />
                      </button>
                      {contract.status === 'DRAFT' && (
                        <button
                          onClick={() => handleDelete(contract)}
                          className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-red-400"
                          aria-label="Delete contract"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showNew && <NewContractModal initialQuote={initialQuote} onClose={closeNew} />}
      {showTemplates && <ContractTemplatesModal onClose={() => setShowTemplates(false)} />}
      {viewingId && <ContractDocumentModal contractId={viewingId} onClose={() => setViewingId(null)} />}
    </DashboardLayout>
  )
}
