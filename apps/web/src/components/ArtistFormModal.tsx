import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { extractErrorMessage } from '../lib/AuthContext'
import {
  ARTIST_CATEGORIES,
  SOCIAL_LINKS,
  createArtist,
  updateArtist,
  type Artist,
  type ArtistInput,
} from '../lib/artistsApi'
import { Button } from './ui/button'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-neutral-500'

type SocialKey = (typeof SOCIAL_LINKS)[number]['key']

export function ArtistFormModal({ artist, onClose }: { artist?: Artist; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(artist?.name ?? '')
  const [slug, setSlug] = useState(artist?.slug ?? '')
  const [category, setCategory] = useState(artist?.category ?? '')
  const [genres, setGenres] = useState(artist?.genres.join(', ') ?? '')
  const [tagline, setTagline] = useState(artist?.tagline ?? '')
  const [location, setLocation] = useState(artist?.location ?? '')
  const [bio, setBio] = useState(artist?.bio ?? '')
  const [photoUrl, setPhotoUrl] = useState(artist?.photoUrl ?? '')
  const [bookingEmail, setBookingEmail] = useState(artist?.bookingEmail ?? '')
  const [bookingPhone, setBookingPhone] = useState(artist?.bookingPhone ?? '')
  const [links, setLinks] = useState<Record<SocialKey, string>>(
    () => Object.fromEntries(SOCIAL_LINKS.map(({ key }) => [key, artist?.[key] ?? ''])) as Record<SocialKey, string>,
  )
  const [isPublished, setIsPublished] = useState(artist?.isPublished ?? false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const input: ArtistInput = {
        name: name.trim(),
        category: category.trim() || null,
        genres: genres.split(',').map((g) => g.trim()).filter(Boolean),
        tagline: tagline.trim() || null,
        location: location.trim() || null,
        bio: bio.trim() || null,
        photoUrl: photoUrl.trim() || null,
        bookingEmail: bookingEmail.trim() || null,
        bookingPhone: bookingPhone.trim() || null,
        ...Object.fromEntries(SOCIAL_LINKS.map(({ key }) => [key, links[key].trim() || null])),
        isPublished,
      }
      // A blank slug on a new artist means "generate one from the name".
      if (slug.trim()) input.slug = slug.trim()
      return artist ? updateArtist(artist.id, input) : createArtist(input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artists'] })
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-brand-ink shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-bold text-white">{artist ? 'Edit Artist' : 'New Artist'}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
            <section className="flex flex-col gap-3">
              <p className={labelClass}>Profile</p>
              <input
                required
                aria-label="Stage name"
                placeholder="Stage / act name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  aria-label="Category"
                  list="artist-categories"
                  placeholder="Category (e.g. DJ)"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inputClass}
                />
                <datalist id="artist-categories">
                  {ARTIST_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <input
                  aria-label="Location"
                  placeholder="Based in (e.g. Harare)"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={inputClass}
                />
              </div>
              <input
                aria-label="Genres"
                placeholder="Genres / styles, comma-separated (e.g. Afro-pop, Jazz)"
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                className={inputClass}
              />
              <input
                aria-label="Tagline"
                maxLength={160}
                placeholder="One-line tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className={inputClass}
              />
              <textarea
                aria-label="Bio"
                placeholder="Bio: who you are, notable performances, what you bring to an event"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={5}
                maxLength={5000}
                className={inputClass}
              />
              <input
                aria-label="Photo URL"
                type="url"
                placeholder="Photo link (https://…)"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                className={inputClass}
              />
            </section>

            <section className="flex flex-col gap-3">
              <p className={labelClass}>Booking contact (shown publicly)</p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  aria-label="Booking email"
                  type="email"
                  placeholder="Bookings email"
                  value={bookingEmail}
                  onChange={(e) => setBookingEmail(e.target.value)}
                  className={inputClass}
                />
                <input
                  aria-label="Booking phone"
                  placeholder="Bookings phone / WhatsApp"
                  value={bookingPhone}
                  onChange={(e) => setBookingPhone(e.target.value)}
                  className={inputClass}
                />
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <p className={labelClass}>Links</p>
              <div className="grid grid-cols-2 gap-3">
                {SOCIAL_LINKS.map(({ key, label }) => (
                  <input
                    key={key}
                    aria-label={label}
                    type="url"
                    placeholder={`${label} (https://…)`}
                    value={links[key]}
                    onChange={(e) => setLinks((prev) => ({ ...prev, [key]: e.target.value }))}
                    className={inputClass}
                  />
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <p className={labelClass}>Public profile</p>
              <div className="flex items-center rounded-lg border border-white/10 bg-white/5 focus-within:border-brand-orange focus-within:ring-2 focus-within:ring-brand-orange/20">
                <span className="pl-3 text-sm text-neutral-500">/a/</span>
                <input
                  aria-label="Profile link"
                  placeholder={artist ? '' : 'generated from the name'}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  className="w-full bg-transparent py-2.5 pr-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
                />
              </div>
              {artist && slug !== artist.slug && (
                <p className="text-xs text-amber-400">Changing the link breaks any copies of the old link you've already shared.</p>
              )}
              <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-4 w-4 accent-brand-orange"
                />
                Published: anyone with the link can view this profile
              </label>
            </section>
          </div>

          <div className="border-t border-white/10 px-6 py-4">
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="h-11 w-full rounded-lg bg-brand-orange text-sm font-semibold text-white hover:bg-brand-orange/90"
            >
              {mutation.isPending ? 'Saving…' : artist ? 'Save Changes' : 'Create Artist'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
