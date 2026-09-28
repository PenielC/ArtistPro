import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FileText, Mic2, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { Button } from '../components/ui/button'
import { listArtists, type Artist } from '../lib/artistsApi'

function status(artist: Artist) {
  if (!artist.epk) return { label: 'Not started', className: 'bg-white/5 text-neutral-500' }
  if (artist.epk.isPublished) return { label: 'Published', className: 'bg-emerald-500/15 text-emerald-400' }
  return { label: 'Draft', className: 'bg-amber-500/15 text-amber-400' }
}

export function EpkListPage() {
  const { data: artists, isLoading } = useQuery({ queryKey: ['artists'], queryFn: listArtists })

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <h1 className="text-2xl font-bold text-white">Press Kits</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A web and PDF press kit for each artist, built from their profile plus highlights, press, music and photos.
        </p>

        <div className="mt-8">
          {isLoading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : !artists || artists.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <Mic2 size={28} className="mx-auto text-neutral-600" />
              <p className="mt-4 text-sm font-medium text-white">Add an artist first</p>
              <p className="mt-1 text-sm text-neutral-500">Each press kit belongs to an artist on your roster.</p>
              <Button asChild className="mt-5 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
                <Link to="/artists">Go to Artists</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {artists.map((artist) => {
                const s = status(artist)
                return (
                  <div key={artist.id} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/5">
                      <FileText size={18} className="text-brand-orange-light" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-white">{artist.name}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.className}`}>
                          {s.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {artist.epk ? `Updated ${new Date(artist.epk.updatedAt).toLocaleDateString()}` : 'No press kit yet'}
                      </p>
                    </div>
                    {artist.epk?.isPublished && (
                      <a
                        href={`/a/${artist.slug}/epk`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-2 text-neutral-500 hover:bg-white/5 hover:text-white"
                        aria-label={`View ${artist.name}'s public press kit`}
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                    <Button asChild variant="outline" className="gap-2 rounded-lg border-white/10 bg-transparent text-white hover:bg-white/5">
                      <Link to={`/epk/${artist.id}`}>
                        <Pencil size={14} />
                        {artist.epk ? 'Edit' : 'Start'}
                      </Link>
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
