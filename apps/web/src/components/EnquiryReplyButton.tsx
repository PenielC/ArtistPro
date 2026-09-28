import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getAiStatus } from '../lib/aiApi'
import { useAiStream } from '../lib/useAiStream'
import { whatsappShareUrl } from '../lib/whatsapp'
import { AiOutput } from './AiOutput'
import { Button } from './ui/button'

function ReplyModal({ bookingId, clientName, onClose }: { bookingId: string; clientName: string; onClose: () => void }) {
  const ai = useAiStream()
  const [note, setNote] = useState('')
  const { start } = ai

  // Draft straight away when opened; "Redraft" re-runs it with the optional note.
  useEffect(() => {
    void start('draft', { document: 'BOOKING', documentId: bookingId })
  }, [start, bookingId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Sparkles size={18} className="text-brand-orange" />
            Reply to {clientName}
          </h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close reply">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4">
          <AiOutput
            text={ai.text}
            state={ai.state}
            error={ai.error}
            truncated={ai.truncated}
            markdown={false}
            onCancel={ai.cancel}
            actions={
              <a
                href={whatsappShareUrl(ai.text)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10"
                data-testid="reply-whatsapp"
              >
                <MessageCircle size={12} />
                WhatsApp
              </a>
            }
          />
        </div>
        <div className="mt-4 flex gap-2">
          <input
            aria-label="Reply instructions"
            maxLength={500}
            placeholder="Optional: e.g. we're free that date, fee starts at $800"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-brand-orange focus:outline-none"
          />
          <Button
            onClick={() => ai.start('draft', { document: 'BOOKING', documentId: bookingId, instructions: note.trim() || undefined })}
            disabled={ai.state === 'streaming'}
            variant="outline"
            className="rounded-lg border-white/10 bg-transparent text-white hover:bg-white/5"
          >
            Redraft
          </Button>
        </div>
      </div>
    </div>
  )
}

/** "Draft reply" on a booking enquiry. Hidden when AI isn't available on this server. */
export function EnquiryReplyButton({ bookingId, clientName }: { bookingId: string; clientName: string }) {
  const [open, setOpen] = useState(false)
  const { data: status } = useQuery({ queryKey: ['ai-status'], queryFn: getAiStatus })
  if (!status?.available) return null
  const exhausted = status.used >= status.limit
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={exhausted}
        title={exhausted ? 'Monthly AI allowance used up' : 'Draft a reply with AI'}
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-violet-300 hover:bg-brand-purple/10 disabled:opacity-40"
        aria-label={`Draft reply to ${clientName}`}
      >
        <Sparkles size={13} />
        Draft reply
      </button>
      {open && <ReplyModal bookingId={bookingId} clientName={clientName} onClose={() => setOpen(false)} />}
    </>
  )
}
