import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, MapPin, Mic2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ArtistFormModal } from '../components/ArtistFormModal'
import { DashboardLayout } from '../components/DashboardLayout'
import { Button } from '../components/ui/button'
import { deleteArtist, listArtists, publicProfileUrl, type Artist } from '../lib/artistsApi'

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

function linkSummary(counts: Artist['_count']) {
  if (!counts) return null
  const parts = [
    [counts.bookings, 'booking'],
    [counts.quotes, 'quote'],
    [counts.contracts, 'contract'],
    [counts.invoices, 'invoice'],
  ] as const
  const nonZero = parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}${n === 1 ? '' : 's'}`)
  return nonZero.length ? nonZero.join(' · ') : 'Nothing linked yet'
}

export function ArtistsPage() {
  const [modalArtist, setModalArtist] = useState<Artist | 'new' | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: artists, isLoading } = useQuery({ queryKey: ['artists'], queryFn: listArtists })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteArtist(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artists'] }),
  })

  function handleDelete(artist: Artist) {
    if (window.confirm(`Delete ${artist.name}? Their bookings, quotes, contracts and invoices will be kept.`)) {
      deleteMutation.mutate(artist.id)
    }
  }

  async function handleCopy(artist: Artist) {
    try {
      await navigator.clipboard.writeText(publicProfileUrl(artist.slug))
      setCopiedId(artist.id)
      setTimeout(() => setCopiedId((id) => (id === artist.id ? null : id)), 2000)
    } catch {
      window.prompt('Copy this link:', publicProfileUrl(artist.slug))
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Artists</h1>
            <p className="mt-1 text-sm text-neutral-400">Your roster, each with a shareable public profile.</p>
          </div>
          <Button onClick={() => setModalArtist('new')} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            <Plus size={16} />
            New Artist
          </Button>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : !artists || artists.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <Mic2 size={28} className="mx-auto text-neutral-600" />
              <p className="mt-4 text-sm font-medium text-white">No artists yet</p>
              <p className="mt-1 text-sm text-neutral-500">
                Add yourself, or every act you manage, to get a public profile link and track work per artist.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {artists.map((artist) => (
                <div key={artist.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    {artist.photoUrl ? (
                      <img src={artist.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-orange to-brand-purple text-sm font-bold text-white">
                        {initials(artist.name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-white">{artist.name}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            artist.isPublished ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-neutral-500'
                          }`}
                        >
                          {artist.isPublished ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-neutral-500">
                        {[artist.category, ...artist.genres].filter(Boolean).join(' · ') || 'No category yet'}
                        {artist.location && (
                          <>
                            <MapPin size={11} className="ml-1 shrink-0" />
                            {artist.location}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setModalArtist(artist)}
                        className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white"
                        aria-label="Edit artist"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(artist)}
                        className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-red-400"
                        aria-label="Delete artist"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {artist.tagline && <p className="mt-3 text-sm text-neutral-300">{artist.tagline}</p>}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
                    <p className="text-xs text-brand-orange-light">{linkSummary(artist._count)}</p>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="mr-1 text-neutral-500">/a/{artist.slug}</span>
                      <button
                        onClick={() => handleCopy(artist)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-neutral-400 hover:bg-white/5 hover:text-white"
                        aria-label="Copy profile link"
                      >
                        {copiedId === artist.id ? <Check size={12} /> : <Copy size={12} />}
                        {copiedId === artist.id ? 'Copied' : 'Copy'}
                      </button>
                      <a
                        href={`/a/${artist.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded px-2 py-1 text-neutral-400 hover:bg-white/5 hover:text-white"
                        title={artist.isPublished ? 'Open public profile' : 'Not published yet: visitors will see "not found"'}
                      >
                        <ExternalLink size={12} />
                        View
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalArtist && (
        <ArtistFormModal artist={modalArtist === 'new' ? undefined : modalArtist} onClose={() => setModalArtist(null)} />
      )}
    </DashboardLayout>
  )
}
