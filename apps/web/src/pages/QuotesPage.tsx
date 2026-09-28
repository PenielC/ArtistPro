import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, FileSignature, Plus, Receipt, ScrollText, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { NewQuoteModal } from '../components/NewQuoteModal'
import { QuoteDocumentModal } from '../components/QuoteDocumentModal'
import { Button } from '../components/ui/button'
import { extractErrorMessage } from '../lib/AuthContext'
import { createInvoiceFromQuote } from '../lib/invoicesApi'
import { formatMoney } from '../lib/money'
import { useArtistNames } from '../lib/useArtistNames'
import {
  QUOTE_STATUSES,
  deleteQuote,
  formatQuoteNumber,
  listQuotes,
  quoteStatusMeta,
  updateQuoteStatus,
  type Quote,
  type QuoteStatus,
} from '../lib/quotesApi'

export function QuotesPage() {
  const artistNames = useArtistNames()
  const [showNew, setShowNew] = useState(false)
  const [viewing, setViewing] = useState<Quote | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: quotes, isLoading } = useQuery({ queryKey: ['quotes'], queryFn: listQuotes })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStatus }) => updateQuoteStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotes'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteQuote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotes'] }),
  })

  async function handleCreateInvoice(quote: Quote) {
    setNotice(null)
    const done = () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-summary'] })
      navigate('/invoices')
    }
    try {
      await createInvoiceFromQuote(quote.id)
      done()
    } catch (err) {
      const message = extractErrorMessage(err)
      if (!message.includes('enter the rate manually')) {
        setNotice(message)
        return
      }
      // No live rate for this currency pair — let the user supply one.
      const entered = window.prompt(`${message}

Exchange rate (1 ${quote.currency} = ? in your base currency):`)
      const rate = Number(entered)
      if (!entered || !(rate > 0)) return
      try {
        await createInvoiceFromQuote(quote.id, { exchangeRate: rate })
        done()
      } catch (retryErr) {
        setNotice(extractErrorMessage(retryErr))
      }
    }
  }

  function handleDelete(quote: Quote) {
    if (window.confirm(`Delete quote ${formatQuoteNumber(quote.number)}?`)) {
      deleteMutation.mutate(quote.id)
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Quotes</h1>
            <p className="mt-1 text-sm text-neutral-400">Send professional, branded quotes in minutes.</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            <Plus size={16} />
            New Quote
          </Button>
        </div>

        {notice && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
            {notice}
          </p>
        )}

        <div className="mt-8">
          {isLoading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : !quotes || quotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <FileSignature size={28} className="mx-auto text-neutral-600" />
              <p className="mt-4 text-sm font-medium text-white">No quotes yet</p>
              <p className="mt-1 text-sm text-neutral-500">Create your first quote to send to a client.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {quotes.map((quote) => {
                const meta = quoteStatusMeta(quote.status)
                return (
                  <div
                    key={quote.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-brand-orange-light">{formatQuoteNumber(quote.number)}</span>
                        <p className="font-semibold text-white">{quote.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        {quote.clientName}
                        {quote.artistId && artistNames.has(quote.artistId) && ` · for ${artistNames.get(quote.artistId)}`}
                        {quote.validUntil && ` · valid until ${new Date(quote.validUntil).toLocaleDateString()}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="mr-2 font-semibold text-white">{formatMoney(quote.total, quote.currency)}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                      <select
                        aria-label="Quote status"
                        value={quote.status}
                        onChange={(e) => statusMutation.mutate({ id: quote.id, status: e.target.value as QuoteStatus })}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-brand-orange focus:outline-none"
                      >
                        {QUOTE_STATUSES.map((s) => (
                          <option key={s.value} value={s.value} className="bg-brand-ink">
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {quote.status !== 'DECLINED' && (
                        <button
                          onClick={() => handleCreateInvoice(quote)}
                          className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-brand-orange-light"
                          aria-label="Create invoice from quote"
                          title="Create invoice from this quote"
                        >
                          <Receipt size={15} />
                        </button>
                      )}
                      {quote.status !== 'DECLINED' && (
                        <button
                          onClick={() => navigate('/contracts', { state: { quote } })}
                          className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-brand-orange-light"
                          aria-label="Create contract from quote"
                          title="Create a contract from this quote"
                        >
                          <ScrollText size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => setViewing(quote)}
                        className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white"
                        aria-label="View quote"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(quote)}
                        className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-red-400"
                        aria-label="Delete quote"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showNew && <NewQuoteModal onClose={() => setShowNew(false)} />}
      {viewing && <QuoteDocumentModal quote={viewing} onClose={() => setViewing(null)} />}
    </DashboardLayout>
  )
}
