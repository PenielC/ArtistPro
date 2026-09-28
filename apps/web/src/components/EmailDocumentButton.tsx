import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, RotateCw, Sparkles, Square, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { extractErrorMessage } from '../lib/AuthContext'
import {
  EMAIL_KIND_LABELS,
  EMAIL_STATUSES,
  getComposeDefaults,
  listDocumentEmails,
  retryEmail,
  sendDocumentEmail,
  type ComposeDefaults,
  type DocumentKind,
} from '../lib/notificationsApi'
import { getAiStatus } from '../lib/aiApi'
import { useAiStream } from '../lib/useAiStream'
import { Button } from './ui/button'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

const DOCUMENT_QUERY: Record<DocumentKind, string[]> = {
  INVOICE: ['invoices', 'invoice-summary', 'invoice-payment'],
  QUOTE: ['quotes'],
  CONTRACT: ['contracts'],
}

const WHAT: Record<DocumentKind, string> = {
  INVOICE: 'The invoice details and its view & pay link',
  QUOTE: 'The quotation items and total',
  CONTRACT: 'The full agreement text',
}

/** Sent-email history for one document, with retry for failures. Polls while anything is still queued. */
function EmailHistory({ kind, documentId }: { kind: DocumentKind; documentId: string }) {
  const queryClient = useQueryClient()
  const { data: emails } = useQuery({
    queryKey: ['document-emails', kind, documentId],
    queryFn: () => listDocumentEmails(kind, documentId),
    refetchInterval: (q) => (q.state.data?.some((e) => e.status === 'PENDING' || e.status === 'SENDING') ? 2000 : false),
  })
  const retry = useMutation({
    mutationFn: retryEmail,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-emails', kind, documentId] }),
  })

  if (!emails || emails.length === 0) return null
  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Email history</p>
      <ul className="mt-2 flex flex-col gap-2" data-testid="email-history">
        {emails.map((e) => (
          <li key={e.id} className="text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 font-medium ${EMAIL_STATUSES[e.status].className}`}>{EMAIL_STATUSES[e.status].label}</span>
              <span className="text-neutral-300">{EMAIL_KIND_LABELS[e.kind]}</span>
              <span className="text-neutral-500">
                to {e.toEmail} · {new Date(e.sentAt ?? e.createdAt).toLocaleString()}
                {e.createdBy ? ` · by ${e.createdBy.firstName}` : ' · automatic'}
              </span>
              {e.status === 'FAILED' && (
                <button
                  onClick={() => retry.mutate(e.id)}
                  disabled={retry.isPending}
                  className="flex items-center gap-1 text-brand-orange-light hover:text-white"
                >
                  <RotateCw size={11} />
                  Retry
                </button>
              )}
            </div>
            {e.status === 'FAILED' && e.lastError && <p className="mt-1 text-red-300/80">{e.lastError}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ComposeForm({ kind, documentId, defaults, onClose }: { kind: DocumentKind; documentId: string; defaults: ComposeDefaults; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [to, setTo] = useState(defaults.to)
  const [subject, setSubject] = useState(defaults.subject)
  const [message, setMessage] = useState(defaults.message)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [aiNote, setAiNote] = useState('')
  const ai = useAiStream()
  const { data: aiStatus } = useQuery({ queryKey: ['ai-status'], queryFn: getAiStatus })
  const aiReady = !!aiStatus?.available && aiStatus.used < aiStatus.limit

  const send = useMutation({
    mutationFn: () => sendDocumentEmail({ kind, documentId, to: to.trim(), subject: subject.trim(), message: message.trim() }),
    onSuccess: () => {
      setSentTo(to.trim())
      queryClient.invalidateQueries({ queryKey: ['document-emails', kind, documentId] })
      for (const key of DOCUMENT_QUERY[kind]) queryClient.invalidateQueries({ queryKey: [key] })
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    send.mutate()
  }

  if (sentTo) {
    return (
      <div>
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300" role="status">
          On its way to {sentTo}. You can close this; delivery status updates below.
        </p>
        <Button onClick={onClose} className="mt-4 h-10 w-full rounded-lg bg-white/10 text-white hover:bg-white/15">
          Done
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input required type="email" aria-label="To" placeholder="Client email" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
      <input required aria-label="Subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
      <textarea
        aria-label="Message"
        rows={5}
        maxLength={3000}
        value={message}
        readOnly={ai.state === 'streaming'}
        onChange={(e) => setMessage(e.target.value)}
        className={inputClass}
      />
      {aiStatus?.available && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3" data-testid="ai-draft">
          <div className="flex gap-2">
            <input
              aria-label="AI instructions"
              maxLength={500}
              placeholder="Optional: tone or points to include"
              value={aiNote}
              onChange={(e) => setAiNote(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:border-brand-orange focus:outline-none"
            />
            {ai.state === 'streaming' ? (
              <Button type="button" onClick={ai.cancel} variant="outline" className="h-8 gap-1.5 rounded-lg border-white/10 bg-transparent text-xs text-white hover:bg-white/5">
                <Square size={12} />
                Stop
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!aiReady}
                title={aiReady ? undefined : 'Monthly AI allowance used up'}
                onClick={() => ai.start('draft', { document: kind, documentId, instructions: aiNote.trim() || undefined }, setMessage)}
                className="h-8 gap-1.5 rounded-lg bg-brand-purple/80 text-xs text-white hover:bg-brand-purple"
              >
                <Sparkles size={12} />
                {message && ai.state !== 'idle' ? 'Redraft with AI' : 'Draft with AI'}
              </Button>
            )}
          </div>
          {ai.error && <p className="text-xs text-red-400">{ai.error}</p>}
          {ai.state === 'done' && <p className="text-xs text-neutral-500">AI draft added above. Read it and edit anything before sending.{ai.demo && ' (Demo text.)'}</p>}
        </div>
      )}
      <p className="text-xs text-neutral-500">
        {WHAT[kind]} are added below your message. Replies come to your email address.
        {defaults.marksSent && ' Sending marks this draft as sent.'}
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={send.isPending || ai.state === 'streaming'} className="h-11 rounded-lg bg-brand-orange text-sm font-semibold text-white hover:bg-brand-orange/90">
        {send.isPending ? 'Sending…' : 'Send email'}
      </Button>
    </form>
  )
}

function EmailModal({ kind, documentId, onClose }: { kind: DocumentKind; documentId: string; onClose: () => void }) {
  const { data: defaults, error } = useQuery({
    queryKey: ['compose', kind, documentId],
    queryFn: () => getComposeDefaults(kind, documentId),
    staleTime: 0,
    gcTime: 0,
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 print:hidden">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Email to client</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close email">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5">
          {error ? (
            <p className="text-sm text-red-400">{extractErrorMessage(error)}</p>
          ) : defaults ? (
            <ComposeForm kind={kind} documentId={documentId} defaults={defaults} onClose={onClose} />
          ) : (
            <p className="text-sm text-neutral-500">Loading…</p>
          )}
        </div>
        <EmailHistory kind={kind} documentId={documentId} />
      </div>
    </div>
  )
}

export function EmailDocumentButton({ kind, documentId }: { kind: DocumentKind; documentId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" className="gap-2 rounded-lg border-white/15 bg-transparent text-white hover:bg-white/5">
        <Mail size={15} />
        Email to client
      </Button>
      {open && <EmailModal kind={kind} documentId={documentId} onClose={() => setOpen(false)} />}
    </>
  )
}
