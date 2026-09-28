import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Plus, Receipt, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { DashboardLayout } from '../components/DashboardLayout'
import { InvoiceDocumentModal } from '../components/InvoiceDocumentModal'
import { NewInvoiceModal } from '../components/NewInvoiceModal'
import { Button } from '../components/ui/button'
import {
  INVOICE_STATUSES,
  deleteInvoice,
  formatInvoiceNumber,
  getInvoiceSummary,
  listInvoices,
  type Invoice,
} from '../lib/invoicesApi'
import { useArtistNames } from '../lib/useArtistNames'
import { formatMoney } from '../lib/money'

export function InvoicesPage() {
  const artistNames = useArtistNames()
  const [showNew, setShowNew] = useState(false)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: invoices, isLoading } = useQuery({ queryKey: ['invoices'], queryFn: listInvoices })
  const { data: summary } = useQuery({ queryKey: ['invoice-summary'], queryFn: getInvoiceSummary })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-summary'] })
    },
  })

  function handleDelete(invoice: Invoice) {
    if (window.confirm(`Delete draft ${formatInvoiceNumber(invoice.number)}?`)) {
      deleteMutation.mutate(invoice.id)
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Invoices</h1>
            <p className="mt-1 text-sm text-neutral-400">Bill in any currency and track what&apos;s been paid.</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            <Plus size={16} />
            New Invoice
          </Button>
        </div>

        {summary && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="invoice-summary">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs text-neutral-500">Received this month</p>
              <p className="mt-1 text-xl font-bold text-white">{formatMoney(summary.receivedThisMonth, summary.baseCurrency)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs text-neutral-500">Outstanding ({summary.openCount})</p>
              <p className="mt-1 text-xl font-bold text-white">{formatMoney(summary.outstanding, summary.baseCurrency)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs text-neutral-500">Overdue</p>
              <p className={`mt-1 text-xl font-bold ${summary.overdueCount > 0 ? 'text-red-300' : 'text-white'}`}>{summary.overdueCount}</p>
            </div>
          </div>
        )}
        {summary && <p className="mt-2 text-xs text-neutral-600">All totals shown in your base currency ({summary.baseCurrency}).</p>}

        <div className="mt-6">
          {isLoading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : !invoices || invoices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <Receipt size={28} className="mx-auto text-neutral-600" />
              <p className="mt-4 text-sm font-medium text-white">No invoices yet</p>
              <p className="mt-1 text-sm text-neutral-500">Create one here, or convert an accepted quote from the Quotes page.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {invoices.map((invoice) => {
                const meta = INVOICE_STATUSES[invoice.status]
                const foreign = invoice.exchangeRate !== 1
                return (
                  <div
                    key={invoice.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-brand-orange-light">{formatInvoiceNumber(invoice.number)}</span>
                        <p className="font-semibold text-white">{invoice.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        {invoice.clientName}
                        {invoice.artistId && artistNames.has(invoice.artistId) && ` · for ${artistNames.get(invoice.artistId)}`}
                        {invoice.dueDate && ` · due ${new Date(invoice.dueDate).toLocaleDateString()}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-semibold text-white">{formatMoney(invoice.total, invoice.currency)}</p>
                        {foreign && (
                          <p className="text-xs text-neutral-500">≈ {formatMoney(invoice.totalInBaseCurrency, summary?.baseCurrency ?? 'USD')}</p>
                        )}
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                      {invoice.overdue && (
                        <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-300">Overdue</span>
                      )}
                      <button
                        onClick={() => setViewingId(invoice.id)}
                        className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white"
                        aria-label="View invoice"
                      >
                        <Eye size={15} />
                      </button>
                      {invoice.status === 'DRAFT' && (
                        <button
                          onClick={() => handleDelete(invoice)}
                          className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-red-400"
                          aria-label="Delete invoice"
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

      {showNew && <NewInvoiceModal onClose={() => setShowNew(false)} />}
      {viewingId && <InvoiceDocumentModal invoiceId={viewingId} onClose={() => setViewingId(null)} />}
    </DashboardLayout>
  )
}
