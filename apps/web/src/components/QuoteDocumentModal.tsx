import { Printer, X } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { formatMoney } from '../lib/money'
import { formatQuoteNumber, type Quote } from '../lib/quotesApi'
import { Logo } from './Logo'
import { EmailDocumentButton } from './EmailDocumentButton'
import { Button } from './ui/button'

export function QuoteDocumentModal({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const { user } = useAuth()

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="w-full max-w-3xl">
        <div className="mb-3 flex flex-wrap justify-end gap-2 print:hidden">
          <EmailDocumentButton kind="QUOTE" documentId={quote.id} />
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

        <div className="print-area rounded-lg bg-white p-10 text-neutral-900 shadow-2xl">
          <div className="flex items-start justify-between border-b border-neutral-200 pb-6">
            <div>
              <Logo variant="light" className="h-14" />
              <p className="mt-2 text-sm font-semibold text-neutral-800">{user?.organizationName}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tracking-wide text-neutral-900">QUOTE</p>
              <p className="mt-1 text-sm font-semibold text-brand-orange">{formatQuoteNumber(quote.number)}</p>
              <p className="mt-2 text-xs text-neutral-500">Issued {new Date(quote.createdAt).toLocaleDateString()}</p>
              {quote.validUntil && (
                <p className="text-xs text-neutral-500">Valid until {new Date(quote.validUntil).toLocaleDateString()}</p>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Prepared for</p>
              <p className="mt-1 font-semibold text-neutral-900">{quote.clientName}</p>
              {quote.clientEmail && <p className="text-sm text-neutral-500">{quote.clientEmail}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Project</p>
              <p className="mt-1 font-semibold text-neutral-900">{quote.title}</p>
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
              {quote.items.map((item) => (
                <tr key={item.id} className="border-b border-neutral-100">
                  <td className="py-3 pr-4">{item.description}</td>
                  <td className="py-3 text-right">{item.quantity}</td>
                  <td className="py-3 text-right">{formatMoney(item.unitPrice, quote.currency)}</td>
                  <td className="py-3 text-right">{formatMoney(item.quantity * item.unitPrice, quote.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <div className="w-56 border-t-2 border-neutral-900 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-xl font-bold">{formatMoney(quote.total, quote.currency)}</span>
              </div>
            </div>
          </div>

          {quote.notes && (
            <div className="mt-8 rounded-lg bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Notes &amp; terms</p>
              <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{quote.notes}</p>
            </div>
          )}

          <p className="mt-10 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
            Thank you for considering {user?.organizationName}. Prepared with ArtBH.
          </p>
        </div>
      </div>
    </div>
  )
}
