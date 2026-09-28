import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { extractErrorMessage, useAuth } from '../lib/AuthContext'
import { getReminderSettings, runRemindersNow, saveReminderSettings, type ReminderSettings } from '../lib/notificationsApi'
import { Button } from './ui/button'

function parseDays(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean)
  const days = parts.map(Number)
  if (!days.length || days.length > 5 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) return null
  return [...new Set(days)].sort((a, b) => a - b)
}

function Form({ initial }: { initial: ReminderSettings }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canEdit = user?.role === 'OWNER' || user?.role === 'FINANCE'
  const [enabled, setEnabled] = useState(initial.reminderEnabled)
  const [daysText, setDaysText] = useState(initial.reminderDays.join(', '))
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const days = parseDays(daysText)
  const dirty = enabled !== initial.reminderEnabled || (days && days.join() !== initial.reminderDays.join())

  const save = useMutation({
    mutationFn: () => saveReminderSettings({ reminderEnabled: enabled, reminderDays: days! }),
    onSuccess: (data) => {
      queryClient.setQueryData(['reminder-settings'], data)
      setDaysText(data.reminderDays.join(', '))
      setMessage({ kind: 'ok', text: 'Reminder settings saved.' })
    },
    onError: (err) => setMessage({ kind: 'error', text: extractErrorMessage(err) }),
  })
  const run = useMutation({
    mutationFn: runRemindersNow,
    onSuccess: (r) =>
      setMessage({
        kind: 'ok',
        text:
          (r.sent ? `Sent ${r.sent} reminder${r.sent === 1 ? '' : 's'}.` : 'No reminders were due.') +
          (r.skippedNoEmail ? ` ${r.skippedNoEmail} overdue invoice(s) have no client email.` : ''),
      }),
    onError: (err) => setMessage({ kind: 'error', text: extractErrorMessage(err) }),
  })

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6" data-testid="reminder-settings">
      <h2 className="font-semibold text-white">Overdue invoice reminders</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Automatically email clients a friendly reminder, with the view &amp; pay link, when an invoice is past its due date. Checked every
        morning. Each reminder is sent once, and never after the invoice is paid.
      </p>

      <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm text-neutral-200">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit}
          onChange={(e) => {
            setEnabled(e.target.checked)
            setMessage(null)
          }}
          className="h-4 w-4 accent-brand-orange"
        />
        Send overdue reminders
      </label>

      <div className="mt-3">
        <label htmlFor="reminder-days" className="text-xs text-neutral-500">
          Days after the due date (up to 5, e.g. 1, 7, 14)
        </label>
        <input
          id="reminder-days"
          value={daysText}
          disabled={!canEdit || !enabled}
          onChange={(e) => {
            setDaysText(e.target.value)
            setMessage(null)
          }}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-brand-orange focus:outline-none disabled:opacity-60"
        />
        {!days && <p className="mt-1 text-xs text-red-400">Enter 1–5 whole numbers between 1 and 365.</p>}
      </div>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || !days || save.isPending} className="rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            onClick={() => run.mutate()}
            disabled={!initial.reminderEnabled || !!dirty || run.isPending}
            variant="outline"
            className="rounded-lg border-white/10 bg-transparent text-white hover:bg-white/5"
          >
            {run.isPending ? 'Checking…' : 'Send due reminders now'}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-neutral-500">Only owners and finance users can change this.</p>
      )}
      {message && (
        <p className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role="status">
          {message.text}
        </p>
      )}
    </div>
  )
}

export function ReminderSettingsCard() {
  const { data } = useQuery({ queryKey: ['reminder-settings'], queryFn: getReminderSettings })
  return data ? <Form initial={data} /> : null
}
