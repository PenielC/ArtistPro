import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FlaskConical, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AiOutput } from '../components/AiOutput'
import { DashboardLayout } from '../components/DashboardLayout'
import { Button } from '../components/ui/button'
import { extractErrorMessage, useAuth } from '../lib/AuthContext'
import { CONTENT_TYPES, getAiHistory, getAiStatus, type ContentType } from '../lib/aiApi'
import { listArtists, updateArtist } from '../lib/artistsApi'
import { useAiStream } from '../lib/useAiStream'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

const TABS = [
  { id: 'briefing', label: 'Business briefing' },
  { id: 'pricing', label: 'Pricing help' },
  { id: 'content', label: 'Write content' },
] as const
type Tab = (typeof TABS)[number]['id']

function UsageBar() {
  const { data } = useQuery({ queryKey: ['ai-status'], queryFn: getAiStatus })
  if (!data) return null
  if (!data.available) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        <AlertTriangle size={16} />
        AI isn&apos;t switched on for this server yet.
      </p>
    )
  }
  const pct = Math.min(100, Math.round((data.used / data.limit) * 100))
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-400" data-testid="ai-usage">
      {data.provider === 'demo' && (
        <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-300">
          <FlaskConical size={12} />
          Demo mode: canned answers, no AI key
        </span>
      )}
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
          <span className={`block h-full ${pct >= 90 ? 'bg-red-400' : 'bg-brand-orange'}`} style={{ width: `${pct}%` }} />
        </span>
        {data.used} of {data.limit} AI generations used this month
      </span>
    </div>
  )
}

function BriefingTab() {
  const ai = useAiStream()
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-400">
        A read of your business right now: upcoming bookings, enquiries waiting on you, unpaid and overdue invoices, and what to do next.
      </p>
      <div>
        <Button onClick={() => ai.start('briefing', {})} disabled={ai.state === 'streaming'} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
          <Sparkles size={15} />
          {ai.text ? 'Refresh briefing' : 'Get my briefing'}
        </Button>
      </div>
      <AiOutput text={ai.text} state={ai.state} error={ai.error} truncated={ai.truncated} onCancel={ai.cancel} />
    </div>
  )
}

function PricingTab() {
  const ai = useAiStream()
  const { user } = useAuth()
  const { data: artists } = useQuery({ queryKey: ['artists'], queryFn: listArtists })
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [duration, setDuration] = useState('')
  const [artistId, setArtistId] = useState('')
  const [notes, setNotes] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    ai.start('pricing', {
      eventType: eventType.trim(),
      eventDate: eventDate || undefined,
      location: location.trim() || undefined,
      durationMinutes: duration ? Number(duration) : undefined,
      artistId: artistId || undefined,
      currency: user?.organizationCurrency,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-400">
        A suggested fee range based only on your own past quotes, invoices and bookings. It says so when there isn&apos;t enough history to go on.
      </p>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <input required minLength={2} aria-label="Event type" placeholder="Event type (e.g. Wedding reception)" value={eventType} onChange={(e) => setEventType(e.target.value)} className={inputClass} />
        {artists && artists.length > 0 ? (
          <select aria-label="Artist" value={artistId} onChange={(e) => setArtistId(e.target.value)} className={inputClass}>
            <option value="" className="bg-brand-ink">All artists</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id} className="bg-brand-ink">{a.name}</option>
            ))}
          </select>
        ) : (
          <span />
        )}
        <input type="date" aria-label="Event date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
        <input aria-label="Location" placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
        <input type="number" min="10" max="1440" aria-label="Duration" placeholder="Duration in minutes (optional)" value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass} />
        <input aria-label="Notes" maxLength={500} placeholder="Anything else (e.g. 300 guests, travel needed)" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        <div className="sm:col-span-2">
          <Button type="submit" disabled={ai.state === 'streaming'} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            <Sparkles size={15} />
            Suggest a price
          </Button>
        </div>
      </form>
      <AiOutput text={ai.text} state={ai.state} error={ai.error} truncated={ai.truncated} onCancel={ai.cancel} />
    </div>
  )
}

function ContentTab() {
  const ai = useAiStream()
  const queryClient = useQueryClient()
  const { data: artists, isLoading } = useQuery({ queryKey: ['artists'], queryFn: listArtists })
  const [artistId, setArtistId] = useState('')
  const [type, setType] = useState<ContentType>('ARTIST_BIO')
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState('Instagram')
  const [instructions, setInstructions] = useState('')
  const [applied, setApplied] = useState<string | null>(null)
  const selectedArtist = artists?.find((a) => a.id === (artistId || artists[0]?.id))

  const apply = useMutation({
    mutationFn: () => {
      const value = ai.text.trim()
      return updateArtist(selectedArtist!.id, type === 'ARTIST_BIO' ? { bio: value } : { tagline: value.replace(/^["“]|["”]$/g, '').slice(0, 160) })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artists'] })
      setApplied(type === 'ARTIST_BIO' ? 'Bio saved to the profile.' : 'Tagline saved to the profile.')
    },
    onError: (err) => setApplied(extractErrorMessage(err)),
  })

  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>
  if (!artists || artists.length === 0) return <p className="text-sm text-neutral-400">Add an artist first: content is written from an artist&apos;s profile and press kit.</p>

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setApplied(null)
    ai.start('content', {
      artistId: selectedArtist!.id,
      type,
      topic: topic.trim() || undefined,
      platform: type === 'SOCIAL_POSTS' ? platform : undefined,
      instructions: instructions.trim() || undefined,
    })
  }

  const applicable = type === 'ARTIST_BIO' || type === 'EPK_TAGLINE'
  const current = type === 'ARTIST_BIO' ? selectedArtist?.bio : selectedArtist?.tagline

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <select
          aria-label="Artist"
          value={selectedArtist?.id}
          onChange={(e) => {
            setArtistId(e.target.value)
            setApplied(null)
            ai.reset()
          }}
          className={inputClass}
        >
          {artists.map((a) => (
            <option key={a.id} value={a.id} className="bg-brand-ink">{a.name}</option>
          ))}
        </select>
        <select
          aria-label="Content type"
          value={type}
          onChange={(e) => {
            setType(e.target.value as ContentType)
            setApplied(null)
            ai.reset()
          }}
          className={inputClass}
        >
          {CONTENT_TYPES.map((t) => (
            <option key={t.value} value={t.value} className="bg-brand-ink">{t.label}</option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 sm:col-span-2">{CONTENT_TYPES.find((t) => t.value === type)?.hint}</p>
        {(type === 'PRESS_RELEASE' || type === 'SOCIAL_POSTS') && (
          <input
            required={type === 'PRESS_RELEASE'}
            aria-label="Topic"
            maxLength={500}
            placeholder={type === 'PRESS_RELEASE' ? 'What is the news? (e.g. New single "Moyo" out 1 November)' : 'Topic (optional; defaults to highlights)'}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className={`${inputClass} sm:col-span-2`}
          />
        )}
        {type === 'SOCIAL_POSTS' && (
          <select aria-label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputClass}>
            {['Instagram', 'Facebook', 'TikTok', 'X', 'LinkedIn', 'WhatsApp Status'].map((p) => (
              <option key={p} value={p} className="bg-brand-ink">{p}</option>
            ))}
          </select>
        )}
        <input aria-label="Instructions" maxLength={500} placeholder="Extra instructions (optional, e.g. more playful)" value={instructions} onChange={(e) => setInstructions(e.target.value)} className={`${inputClass} ${type === 'SOCIAL_POSTS' ? '' : 'sm:col-span-2'}`} />
        <div className="sm:col-span-2">
          <Button type="submit" disabled={ai.state === 'streaming'} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            <Sparkles size={15} />
            Write it
          </Button>
        </div>
      </form>
      <AiOutput
        text={ai.text}
        state={ai.state}
        error={ai.error}
        truncated={ai.truncated}
        markdown={!applicable}
        onCancel={ai.cancel}
        actions={
          applicable && (
            <button
              onClick={() =>
                window.confirm(`Replace ${selectedArtist!.name}'s ${type === 'ARTIST_BIO' ? 'bio' : 'tagline'} with this text?${current ? '\n\nThe current one will be overwritten.' : ''}`) &&
                apply.mutate()
              }
              disabled={apply.isPending}
              className="rounded-lg bg-brand-orange/15 px-2.5 py-1.5 text-xs font-medium text-brand-orange-light hover:bg-brand-orange/25"
            >
              Apply to profile
            </button>
          )
        }
      />
      {applied && <p className="text-sm text-emerald-300" role="status">{applied}</p>}
    </div>
  )
}

const FEATURE_LABELS = { BRIEFING: 'Briefing', DRAFT: 'Draft', CONTENT: 'Content', PRICING: 'Pricing' } as const

function RecentHistory() {
  const { data } = useQuery({ queryKey: ['ai-history'], queryFn: () => getAiHistory() })
  const [open, setOpen] = useState<string | null>(null)
  if (!data || data.length === 0) return null
  return (
    <section className="mt-10">
      <h2 className="font-semibold text-white">Recent AI work</h2>
      <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10">
        {data.slice(0, 10).map((g) => (
          <li key={g.id} className="px-4 py-3 text-sm">
            <button onClick={() => setOpen(open === g.id ? null : g.id)} className="flex w-full flex-wrap items-center gap-2 text-left">
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-neutral-300">{FEATURE_LABELS[g.feature]}</span>
              <span className="text-neutral-300">{g.variant?.toLowerCase().replace(/_/g, ' ') ?? ''}</span>
              <span className="text-xs text-neutral-500">
                {new Date(g.createdAt).toLocaleString()} · {g.user?.firstName ?? '—'}
              </span>
              {g.status !== 'COMPLETED' && (
                <span className="text-xs text-amber-400">{g.status === 'FAILED' && g.error === 'cancelled' ? 'cancelled' : g.status.toLowerCase()}</span>
              )}
            </button>
            {open === g.id && g.output && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">{g.output}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function AiAssistantPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as Tab) : 'briefing'

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl px-8 py-10">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Sparkles size={22} className="text-brand-orange" />
          AI Artist Manager
        </h1>
        <p className="mt-1 text-sm text-neutral-400">Suggestions from your own business data. Nothing is sent or saved until you choose to.</p>
        <div className="mt-4">
          <UsageBar />
        </div>

        <div className="mt-6 flex gap-1 border-b border-white/10" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setParams({ tab: t.id })}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.id ? 'border-brand-orange text-white' : 'border-transparent text-neutral-400 hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-6">
          {tab === 'briefing' && <BriefingTab />}
          {tab === 'pricing' && <PricingTab />}
          {tab === 'content' && <ContentTab />}
        </div>

        <RecentHistory />
      </div>
    </DashboardLayout>
  )
}
