import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { extractErrorMessage } from '../lib/AuthContext'
import { createClient, updateClient, type Client } from '../lib/clientsApi'
import { Button } from './ui/button'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

export function ClientFormModal({ client, onClose }: { client?: Client; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(client?.name ?? '')
  const [company, setCompany] = useState(client?.company ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [notes, setNotes] = useState(client?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        name,
        company: company || undefined,
        email: email || undefined,
        phone: phone || undefined,
        notes: notes || undefined,
      }
      return client ? updateClient(client.id, input) : createClient(input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      onClose()
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{client ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
          <input required placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          <input placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
          <div className="grid grid-cols-2 gap-3">
            <input type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={inputClass}
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button
            type="submit"
            disabled={mutation.isPending}
            className="mt-2 h-11 rounded-lg bg-brand-orange text-sm font-semibold text-white hover:bg-brand-orange/90"
          >
            {mutation.isPending ? 'Saving…' : client ? 'Save Changes' : 'Create Client'}
          </Button>
        </form>
      </div>
    </div>
  )
}
