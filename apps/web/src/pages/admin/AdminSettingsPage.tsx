import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Megaphone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/button'
import { extractErrorMessage } from '../../lib/AuthContext'
import {
  getPlatformConfig,
  updatePlatformConfig,
  type PlatformConfig,
  adminInputClass as inputClass,
} from '../../lib/adminApi'
import type { AnnouncementTone } from '../../lib/platformApi'
import { AdminLayout, Panel } from './AdminLayout'

const MAX_ANNOUNCEMENT = 280

function SettingsForm({ config, saved, onSaved }: { config: PlatformConfig; saved: boolean; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const [signupsEnabled, setSignupsEnabled] = useState(config.signupsEnabled)
  const [limit, setLimit] = useState(String(config.defaultAiMonthlyLimit))
  const [announcement, setAnnouncement] = useState(config.announcement ?? '')
  const [tone, setTone] = useState<AnnouncementTone>(config.announcementTone)

  const limitValid = /^\d+$/.test(limit) && Number(limit) <= 100_000
  // Only what changed is sent, so the audit log shows exactly what was touched.
  const changes = {
    ...(signupsEnabled !== config.signupsEnabled ? { signupsEnabled } : {}),
    ...(limitValid && Number(limit) !== config.defaultAiMonthlyLimit ? { defaultAiMonthlyLimit: Number(limit) } : {}),
    ...(announcement.trim() !== (config.announcement ?? '') ? { announcement: announcement.trim() || null } : {}),
    ...(tone !== config.announcementTone ? { announcementTone: tone } : {}),
  }
  const dirty = Object.keys(changes).length > 0

  const save = useMutation({
    mutationFn: () => updatePlatformConfig(changes),
    onSuccess: (data) => {
      onSaved()
      queryClient.setQueryData(['admin-config'], data)
      queryClient.invalidateQueries({ queryKey: ['public-platform'] })
      queryClient.invalidateQueries({ queryKey: ['admin-audit'] })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (dirty && limitValid) save.mutate()
  }

  const warning = tone === 'WARNING'
  const PreviewIcon = warning ? AlertTriangle : Megaphone

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-4">
      <Panel title="Sign-ups">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={signupsEnabled}
            onChange={(e) => setSignupsEnabled(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[var(--color-brand-orange)]"
            data-testid="signups-toggle"
          />
          <span>
            <span className="block text-sm font-medium text-white">Allow new businesses to sign up</span>
            <span className="block text-sm text-neutral-400">
              When off, the sign-up page says sign-ups are paused and the API refuses new accounts. Existing businesses are unaffected.
            </span>
          </span>
        </label>
      </Panel>

      <Panel title="AI Manager">
        <label htmlFor="default-ai-limit" className="block text-sm font-medium text-white">
          Default monthly AI limit for new businesses
        </label>
        <p className="text-sm text-neutral-400">Existing businesses keep their current limit; change those on the business's page.</p>
        <input
          id="default-ai-limit"
          inputMode="numeric"
          value={limit}
          onChange={(e) => setLimit(e.target.value.trim())}
          className={`${inputClass} mt-2 max-w-40`}
        />
        {!limitValid && <p className="mt-1 text-xs text-red-400">Enter a whole number from 0 to 100,000.</p>}
      </Panel>

      <Panel title="Announcement">
        <p className="text-sm text-neutral-400">Shown at the top of the app for every signed-in user until you clear it. Users can dismiss it; a new message shows again.</p>
        <textarea
          id="announcement"
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value)}
          maxLength={MAX_ANNOUNCEMENT}
          rows={3}
          placeholder="e.g. Scheduled maintenance on Sunday from 02:00 to 03:00 CAT."
          className={`${inputClass} mt-3`}
          aria-label="Announcement"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2" role="radiogroup" aria-label="Announcement style">
            {(['INFO', 'WARNING'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tone === t}
                onClick={() => setTone(t)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  tone === t ? 'border-brand-orange bg-brand-orange/15 text-white' : 'border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                {t === 'INFO' ? 'Information' : 'Warning'}
              </button>
            ))}
          </div>
          <span className="text-xs text-neutral-500">
            {announcement.length}/{MAX_ANNOUNCEMENT}
          </span>
        </div>
        {announcement.trim() && (
          <div
            className={`mt-3 flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm ${
              warning ? 'border-amber-500/20 bg-amber-500/10 text-amber-100' : 'border-brand-purple/20 bg-brand-purple/10 text-violet-100'
            }`}
          >
            <PreviewIcon size={16} className="mt-0.5 shrink-0" />
            <p className="whitespace-pre-line">{announcement.trim()}</p>
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={!dirty || !limitValid || save.isPending} className="bg-brand-orange text-white hover:bg-brand-orange/90">
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
        {save.error && <p className="text-sm text-red-400">{extractErrorMessage(save.error)}</p>}
        {saved && !dirty && <p className="text-sm text-emerald-400">Saved.</p>}
        <p className="text-xs text-neutral-500">
          Last changed {new Date(config.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          {config.updatedByEmail ? ` by ${config.updatedByEmail}` : ''}
        </p>
      </div>
    </form>
  )
}

export function AdminSettingsPage() {
  const { data, error } = useQuery({ queryKey: ['admin-config'], queryFn: getPlatformConfig })
  // Kept here: the form re-mounts after a save, which would reset its own mutation state.
  const [saved, setSaved] = useState(false)
  return (
    <AdminLayout>
      {error && <p className="text-sm text-red-400">{extractErrorMessage(error)}</p>}
      {!data && !error && <p className="text-sm text-neutral-500">Loading…</p>}
      {/* Re-mount on save so the form starts from what the server now holds. */}
      {data && <SettingsForm key={data.updatedAt} config={data} saved={saved} onSaved={() => setSaved(true)} />}
    </AdminLayout>
  )
}
