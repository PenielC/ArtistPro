import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Mic2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArtistFormModal } from '../components/ArtistFormModal'
import { DashboardLayout } from '../components/DashboardLayout'
import { Button } from '../components/ui/button'
import { extractErrorMessage } from '../lib/AuthContext'
import { listArtists } from '../lib/artistsApi'
import {
  DISCOGRAPHY_KINDS,
  getEpk,
  publicEpkUrl,
  saveEpk,
  type EpkContent,
  type EpkEditorData,
} from '../lib/epkApi'
import { toEmbed } from '../lib/mediaEmbed'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

// ───────────────────────────── Form model ─────────────────────────────
// Rows are kept as strings while editing (years included) and carry a local
// key so React doesn't confuse rows when they're reordered or removed.

type Row<T> = T & { key: string }
type AchievementRow = Row<{ text: string }>
type DiscographyRow = Row<{ title: string; kind: string; year: string; url: string }>
type PerformanceRow = Row<{ name: string; location: string; year: string }>
type QuoteRow = Row<{ quote: string; source: string; url: string }>
type GalleryRow = Row<{ url: string; caption: string }>
type MediaRow = Row<{ title: string; url: string }>

interface FormState {
  achievements: AchievementRow[]
  discography: DiscographyRow[]
  performances: PerformanceRow[]
  pressQuotes: QuoteRow[]
  gallery: GalleryRow[]
  media: MediaRow[]
}

let keySeq = 0
const newKey = () => `row-${++keySeq}`
const yearText = (y?: number) => (y === undefined ? '' : String(y))

function toForm(epk: EpkContent): FormState {
  return {
    achievements: epk.achievements.map((text) => ({ key: newKey(), text })),
    discography: epk.discography.map((d) => ({ key: newKey(), title: d.title, kind: d.kind ?? '', year: yearText(d.year), url: d.url ?? '' })),
    performances: epk.performances.map((p) => ({ key: newKey(), name: p.name, location: p.location ?? '', year: yearText(p.year) })),
    pressQuotes: epk.pressQuotes.map((q) => ({ key: newKey(), quote: q.quote, source: q.source, url: q.url ?? '' })),
    gallery: epk.gallery.map((g) => ({ key: newKey(), url: g.url, caption: g.caption ?? '' })),
    media: epk.media.map((m) => ({ key: newKey(), title: m.title ?? '', url: m.url })),
  }
}

const isBlank = (row: object) =>
  Object.entries(row).every(([k, v]) => k === 'key' || String(v).trim() === '')

/** Builds the save payload, or the first human-readable problem. Entirely blank rows are dropped silently. */
function toPayload(form: FormState): { payload: EpkContent } | { error: string } {
  const problems: string[] = []
  const opt = (v: string) => v.trim() || undefined
  const link = (section: string, i: number, v: string, what = 'link') => {
    const t = v.trim()
    if (t && !/^https?:\/\/\S+$/i.test(t)) problems.push(`${section} item ${i + 1}: the ${what} must start with https://`)
    return t || undefined
  }
  const year = (section: string, i: number, v: string) => {
    const t = v.trim()
    if (!t) return undefined
    const n = Number(t)
    if (!Number.isInteger(n) || n < 1900 || n > 2100) problems.push(`${section} item ${i + 1}: the year must be between 1900 and 2100`)
    return n
  }
  const need = (section: string, i: number, v: string, what: string) => {
    if (!v.trim()) problems.push(`${section} item ${i + 1} needs ${what}`)
    return v.trim()
  }

  const payload: EpkContent = {
    achievements: form.achievements.map((a) => a.text.trim()).filter(Boolean),
    discography: form.discography.filter((r) => !isBlank(r)).map((r, i) => ({
      title: need('Discography', i, r.title, 'a title'),
      kind: opt(r.kind),
      year: year('Discography', i, r.year),
      url: link('Discography', i, r.url),
    })),
    performances: form.performances.filter((r) => !isBlank(r)).map((r, i) => ({
      name: need('Performances', i, r.name, 'an event or venue name'),
      location: opt(r.location),
      year: year('Performances', i, r.year),
    })),
    pressQuotes: form.pressQuotes.filter((r) => !isBlank(r)).map((r, i) => ({
      quote: need('Press', i, r.quote, 'the quote'),
      source: need('Press', i, r.source, 'a source (publication or person)'),
      url: link('Press', i, r.url),
    })),
    gallery: form.gallery.filter((r) => !isBlank(r)).map((r, i) => ({
      url: link('Gallery', i, need('Gallery', i, r.url, 'a photo link'), 'photo link')!,
      caption: opt(r.caption),
    })),
    media: form.media.filter((r) => !isBlank(r)).map((r, i) => ({
      title: opt(r.title),
      url: link('Videos & music', i, need('Videos & music', i, r.url, 'a link'))!,
    })),
  }
  return problems.length ? { error: problems[0] } : { payload }
}

// ───────────────────────────── List editor ─────────────────────────────

function ListSection<T extends { key: string }>({
  title,
  hint,
  rows,
  onChange,
  makeRow,
  max,
  addLabel,
  renderRow,
}: {
  title: string
  hint: string
  rows: T[]
  onChange: (rows: T[]) => void
  makeRow: () => T
  max: number
  addLabel: string
  renderRow: (row: T, update: (patch: Partial<T>) => void, index: number) => ReactNode
}) {
  const move = (from: number, to: number) => {
    const next = [...rows]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    onChange(next)
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
        </div>
        <span className="shrink-0 text-xs text-neutral-600">
          {rows.length}/{max}
        </span>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((row, index) => (
            <div key={row.key} className="flex gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="min-w-0 flex-1">
                {renderRow(row, (patch) => onChange(rows.map((r) => (r.key === row.key ? { ...r, ...patch } : r))), index)}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  className="rounded p-1 text-neutral-500 hover:bg-white/5 hover:text-white disabled:opacity-30"
                  aria-label={`Move ${title} item ${index + 1} up`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, index + 1)}
                  className="rounded p-1 text-neutral-500 hover:bg-white/5 hover:text-white disabled:opacity-30"
                  aria-label={`Move ${title} item ${index + 1} down`}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                  className="rounded p-1 text-neutral-500 hover:bg-white/5 hover:text-red-400"
                  aria-label={`Remove ${title} item ${index + 1}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={rows.length >= max}
        onClick={() => onChange([...rows, makeRow()])}
        className="mt-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-orange-light hover:bg-white/5 disabled:opacity-40"
      >
        <Plus size={14} />
        {addLabel}
      </button>
    </section>
  )
}

// ───────────────────────────── Editor ─────────────────────────────

function EpkEditor({ artistId, initial }: { artistId: string; initial: EpkEditorData }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toForm(initial.epk))
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)

  const { data: artists } = useQuery({ queryKey: ['artists'], queryFn: listArtists })
  const { data: current = initial } = useQuery({ queryKey: ['epk', artistId], queryFn: () => getEpk(artistId) })
  const { artist, epk } = current
  const fullArtist = artists?.find((a) => a.id === artistId)

  // Closing the tab with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function set<K extends keyof FormState>(section: K) {
    return (rows: FormState[K]) => {
      setForm((prev) => ({ ...prev, [section]: rows }))
      setDirty(true)
      setSavedAt(null)
    }
  }

  function afterSave(data: EpkEditorData) {
    queryClient.setQueryData(['epk', artistId], data)
    queryClient.invalidateQueries({ queryKey: ['artists'] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: EpkContent) => saveEpk(artistId, payload),
    onSuccess: (data) => {
      afterSave(data)
      setDirty(false)
      setSavedAt(Date.now())
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  const publishMutation = useMutation({
    mutationFn: (isPublished: boolean) => saveEpk(artistId, { isPublished }),
    onSuccess: afterSave,
    onError: (err) => setError(extractErrorMessage(err)),
  })

  function handleSave() {
    setError(null)
    const result = toPayload(form)
    if ('error' in result) {
      setError(result.error)
      return
    }
    saveMutation.mutate(result.payload)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(publicEpkUrl(artist.slug))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link:', publicEpkUrl(artist.slug))
    }
  }

  const profileGaps = [
    !artist.bio && 'a bio',
    !artist.photoUrl && 'a photo',
    !artist.bookingEmail && !artist.bookingPhone && 'booking contact details',
  ].filter(Boolean)

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link to="/epk" className="flex items-center gap-1 text-sm text-neutral-500 hover:text-white">
        <ArrowLeft size={14} />
        Press kits
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">{artist.name}: Press Kit</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                epk.isPublished ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-neutral-500'
              }`}
            >
              {epk.isPublished ? 'Published' : 'Not public'}
            </span>
          </div>
          {epk.isPublished && <p className="mt-1 text-sm text-neutral-500">/a/{artist.slug}/epk</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {epk.isPublished && (
            <>
              <Button onClick={handleCopy} variant="outline" className="gap-2 rounded-lg border-white/10 bg-transparent text-white hover:bg-white/5">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
              <Button asChild variant="outline" className="gap-2 rounded-lg border-white/10 bg-transparent text-white hover:bg-white/5">
                <a href={`/a/${artist.slug}/epk`} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} />
                  View
                </a>
              </Button>
            </>
          )}
          <Button asChild variant="outline" className="gap-2 rounded-lg border-white/10 bg-transparent text-white hover:bg-white/5">
            <Link to={`/epk/${artistId}/preview`}>
              <Eye size={14} />
              Preview &amp; PDF
            </Link>
          </Button>
          <Button
            onClick={() => publishMutation.mutate(!epk.isPublished)}
            disabled={dirty || publishMutation.isPending}
            title={dirty ? 'Save your changes first' : undefined}
            className={`rounded-lg text-white ${epk.isPublished ? 'bg-white/10 hover:bg-white/15' : 'bg-emerald-600 hover:bg-emerald-600/90'}`}
          >
            {epk.isPublished ? 'Unpublish' : 'Publish'}
          </Button>
        </div>
      </div>

      {/* Profile-sourced content: edited on the artist, shown here so the kit's full picture is visible. */}
      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-start gap-4">
          {artist.photoUrl ? (
            <img src={artist.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/5">
              <Mic2 size={20} className="text-neutral-600" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">From the artist profile</h2>
              <Button
                onClick={() => setEditingProfile(true)}
                disabled={!fullArtist}
                variant="outline"
                className="h-8 gap-1.5 rounded-lg border-white/10 bg-transparent text-xs text-white hover:bg-white/5"
              >
                <Pencil size={12} />
                Edit profile
              </Button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Name, photo, category, genres, location, tagline, bio, booking contact and links appear in the kit exactly as on the profile.
            </p>
            <p className="mt-2 line-clamp-2 text-sm text-neutral-300">{artist.bio || <span className="text-neutral-600">No bio yet.</span>}</p>
            {profileGaps.length > 0 && (
              <p className="mt-2 text-xs text-amber-400">Press kits land better with {profileGaps.join(', ')}. Add them via Edit profile.</p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-6 flex flex-col gap-5">
        <ListSection
          title="Highlights"
          hint="Awards, nominations, milestones, streams, notable collaborations."
          rows={form.achievements}
          onChange={set('achievements')}
          makeRow={() => ({ key: newKey(), text: '' })}
          max={20}
          addLabel="Add highlight"
          renderRow={(row, update) => (
            <input
              aria-label="Highlight"
              maxLength={300}
              placeholder="e.g. Nominated, Best Female Artist, ZIMA 2024"
              value={row.text}
              onChange={(e) => update({ text: e.target.value })}
              className={inputClass}
            />
          )}
        />

        <ListSection
          title="Videos & music"
          hint="YouTube, Vimeo, Spotify and SoundCloud links play inline on the web kit. Any other link shows as a link card."
          rows={form.media}
          onChange={set('media')}
          makeRow={() => ({ key: newKey(), title: '', url: '' })}
          max={20}
          addLabel="Add video or track"
          renderRow={(row, update) => {
            const embed = row.url.trim() ? toEmbed(row.url.trim()) : null
            return (
              <div className="flex flex-col gap-2">
                <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                  <input aria-label="Media title" maxLength={150} placeholder="Title (optional)" value={row.title} onChange={(e) => update({ title: e.target.value })} className={inputClass} />
                  <input aria-label="Media link" placeholder="https://youtube.com/watch?v=…" value={row.url} onChange={(e) => update({ url: e.target.value })} className={inputClass} />
                </div>
                {row.url.trim() && (
                  <p className="text-xs text-neutral-500">{embed ? `✓ Plays inline (${embed.provider})` : 'Shows as a link card'}</p>
                )}
              </div>
            )
          }}
        />

        <ListSection
          title="Press"
          hint="Quotes from reviews, articles, promoters or notable clients."
          rows={form.pressQuotes}
          onChange={set('pressQuotes')}
          makeRow={() => ({ key: newKey(), quote: '', source: '', url: '' })}
          max={20}
          addLabel="Add press quote"
          renderRow={(row, update) => (
            <div className="flex flex-col gap-2">
              <textarea aria-label="Quote" rows={2} maxLength={1000} placeholder="The quote" value={row.quote} onChange={(e) => update({ quote: e.target.value })} className={inputClass} />
              <div className="grid gap-2 sm:grid-cols-2">
                <input aria-label="Quote source" maxLength={150} placeholder="Source (e.g. The Herald)" value={row.source} onChange={(e) => update({ source: e.target.value })} className={inputClass} />
                <input aria-label="Quote link" placeholder="Article link (optional)" value={row.url} onChange={(e) => update({ url: e.target.value })} className={inputClass} />
              </div>
            </div>
          )}
        />

        <ListSection
          title="Discography"
          hint="Releases, newest first is usual."
          rows={form.discography}
          onChange={set('discography')}
          makeRow={() => ({ key: newKey(), title: '', kind: '', year: '', url: '' })}
          max={50}
          addLabel="Add release"
          renderRow={(row, update) => (
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_5rem]">
              <input aria-label="Release title" maxLength={150} placeholder="Title" value={row.title} onChange={(e) => update({ title: e.target.value })} className={inputClass} />
              <input aria-label="Release type" list="discography-kinds" maxLength={40} placeholder="Type (e.g. Album)" value={row.kind} onChange={(e) => update({ kind: e.target.value })} className={inputClass} />
              <input aria-label="Release year" inputMode="numeric" placeholder="Year" value={row.year} onChange={(e) => update({ year: e.target.value })} className={inputClass} />
              <input aria-label="Release link" placeholder="Listen link (optional)" value={row.url} onChange={(e) => update({ url: e.target.value })} className={`${inputClass} sm:col-span-3`} />
            </div>
          )}
        />
        <datalist id="discography-kinds">
          {DISCOGRAPHY_KINDS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>

        <ListSection
          title="Notable performances"
          hint="Festivals, venues, corporate and private events worth naming."
          rows={form.performances}
          onChange={set('performances')}
          makeRow={() => ({ key: newKey(), name: '', location: '', year: '' })}
          max={50}
          addLabel="Add performance"
          renderRow={(row, update) => (
            <div className="grid gap-2 sm:grid-cols-[2fr_1.5fr_5rem]">
              <input aria-label="Performance name" maxLength={150} placeholder="Event or venue (e.g. HIFA)" value={row.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} />
              <input aria-label="Performance location" maxLength={120} placeholder="Location (optional)" value={row.location} onChange={(e) => update({ location: e.target.value })} className={inputClass} />
              <input aria-label="Performance year" inputMode="numeric" placeholder="Year" value={row.year} onChange={(e) => update({ year: e.target.value })} className={inputClass} />
            </div>
          )}
        />

        <ListSection
          title="Gallery"
          hint="Press photos promoters can use. Paste image links (https://…) for now; uploads are coming."
          rows={form.gallery}
          onChange={set('gallery')}
          makeRow={() => ({ key: newKey(), url: '', caption: '' })}
          max={24}
          addLabel="Add photo"
          renderRow={(row, update) => (
            <div className="flex gap-3">
              {/^https?:\/\//i.test(row.url.trim()) ? (
                <img src={row.url.trim()} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-white/5 object-cover" />
              ) : (
                <span className="h-16 w-16 shrink-0 rounded-lg bg-white/5" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input aria-label="Photo link" placeholder="Image link (https://…)" value={row.url} onChange={(e) => update({ url: e.target.value })} className={inputClass} />
                <input aria-label="Photo caption" maxLength={150} placeholder="Caption / photo credit (optional)" value={row.caption} onChange={(e) => update({ caption: e.target.value })} className={inputClass} />
              </div>
            </div>
          )}
        />
      </div>

      <div className="sticky bottom-0 mt-6 flex items-center justify-end gap-4 border-t border-white/10 bg-brand-ink/95 py-4 backdrop-blur">
        {error && <p className="mr-auto text-sm text-red-400">{error}</p>}
        {!error && dirty && <p className="mr-auto text-sm text-amber-400">Unsaved changes</p>}
        {!error && !dirty && savedAt && <p className="mr-auto text-sm text-emerald-400">Saved</p>}
        <Button
          onClick={handleSave}
          disabled={!dirty || saveMutation.isPending}
          className="h-10 rounded-lg bg-brand-orange px-6 text-sm font-semibold text-white hover:bg-brand-orange/90"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save press kit'}
        </Button>
      </div>

      {editingProfile && fullArtist && (
        <ArtistFormModal
          artist={fullArtist}
          onClose={() => {
            setEditingProfile(false)
            queryClient.invalidateQueries({ queryKey: ['epk', artistId] })
          }}
        />
      )}
    </div>
  )
}

export function EpkEditorPage() {
  const { artistId = '' } = useParams()
  const { data, isLoading, isError } = useQuery({ queryKey: ['epk', artistId], queryFn: () => getEpk(artistId) })

  return (
    <DashboardLayout>
      {data ? (
        // Mounted once the kit has loaded, so the form initialises straight from it.
        <EpkEditor artistId={artistId} initial={data} />
      ) : (
        <p className="px-8 py-10 text-sm text-neutral-500">{isLoading ? 'Loading…' : isError ? 'Could not load this press kit.' : null}</p>
      )}
    </DashboardLayout>
  )
}
