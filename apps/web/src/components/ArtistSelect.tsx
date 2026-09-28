import { useQuery } from '@tanstack/react-query'
import { listArtists } from '../lib/artistsApi'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'

/** Optional artist link for new bookings/quotes/contracts/invoices. Renders nothing until the org has an artist. */
export function ArtistSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (artistId: string, artistName: string | null) => void
}) {
  const { data: artists } = useQuery({ queryKey: ['artists'], queryFn: listArtists })
  if (!artists || artists.length === 0) return null

  return (
    <select
      aria-label="Artist"
      value={value}
      onChange={(e) => onChange(e.target.value, artists.find((a) => a.id === e.target.value)?.name ?? null)}
      className={inputClass}
    >
      <option value="" className="bg-brand-ink">
        No specific artist
      </option>
      {artists.map((a) => (
        <option key={a.id} value={a.id} className="bg-brand-ink">
          {a.name}
        </option>
      ))}
    </select>
  )
}

