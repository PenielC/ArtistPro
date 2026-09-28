import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { extractErrorMessage } from '../lib/AuthContext'
import {
  LEGAL_NOTE,
  createContractTemplate,
  deleteContractTemplate,
  getDefaultTemplate,
  listContractTemplates,
  updateContractTemplate,
  type ContractTemplate,
} from '../lib/contractsApi'
import { Button } from './ui/button'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

type Editing = { id: string | null; name: string; body: string } | null

export function ContractTemplatesModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: templates } = useQuery({ queryKey: ['contract-templates'], queryFn: listContractTemplates })
  const { data: defaults } = useQuery({ queryKey: ['contract-template-default'], queryFn: getDefaultTemplate })

  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const saveMutation = useMutation({
    mutationFn: (draft: NonNullable<Editing>) =>
      draft.id
        ? updateContractTemplate(draft.id, { name: draft.name, body: draft.body })
        : createContractTemplate({ name: draft.name, body: draft.body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-templates'] })
      setEditing(null)
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContractTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contract-templates'] }),
  })

  function startNew() {
    setError(null)
    // A new template starts from the built-in wording so nobody faces a blank page.
    setEditing({ id: null, name: '', body: defaults?.body ?? '' })
  }

  function startEdit(template: ContractTemplate) {
    setError(null)
    setEditing({ id: template.id, name: template.name, body: template.body })
  }

  function insertPlaceholder(key: string) {
    if (!editing) return
    const el = bodyRef.current
    const token = `{{${key}}}`
    const start = el?.selectionStart ?? editing.body.length
    const end = el?.selectionEnd ?? editing.body.length
    const next = editing.body.slice(0, start) + token + editing.body.slice(end)
    setEditing({ ...editing, body: next })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  function handleDelete(template: ContractTemplate) {
    if (window.confirm(`Delete the template "${template.name}"? Contracts already created from it are not affected.`)) {
      deleteMutation.mutate(template.id)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{editing ? (editing.id ? 'Edit template' : 'New template') : 'Contract templates'}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!editing ? (
          <div className="mt-4">
            <p className="text-sm text-neutral-400">
              Reusable wording with placeholders like <code className="text-brand-orange-light">{'{{fee}}'}</code> that are
              filled in for each contract. The built-in <em>Standard performance agreement</em> is always available.
            </p>
            <p className="mt-2 text-xs text-amber-300/80">{LEGAL_NOTE}</p>

            <div className="mt-4 flex flex-col gap-2" data-testid="template-list">
              {templates?.length === 0 && <p className="text-sm text-neutral-500">You haven&apos;t saved any templates yet.</p>}
              {templates?.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="font-medium text-white">{t.name}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(t)} className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label={`Edit ${t.name}`}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(t)} className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-red-400" aria-label={`Delete ${t.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={startNew} className="mt-4 gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
              <Plus size={16} />
              New template
            </Button>
          </div>
        ) : (
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              setError(null)
              saveMutation.mutate(editing)
            }}
          >
            <input
              required
              placeholder="Template name (e.g. Corporate events)"
              aria-label="Template name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className={inputClass}
            />

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Insert a placeholder</p>
              <div className="flex flex-wrap gap-1.5">
                {defaults?.placeholders.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={p.description}
                    onClick={() => insertPlaceholder(p.key)}
                    className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:border-brand-orange/50 hover:text-brand-orange-light"
                  >
                    {`{{${p.key}}}`}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              required
              ref={bodyRef}
              aria-label="Template body"
              rows={16}
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              className={`${inputClass} font-mono text-xs leading-relaxed`}
            />

            {error && <p className="text-sm text-red-400" role="alert">{error}</p>}

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                className="rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save template'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
                className="rounded-lg border-white/15 bg-transparent text-white hover:bg-white/5"
              >
                Back
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
