import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowUpRight, FileText, Mail, MapPin, MessageCircle, Mic2, Phone } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { SOCIAL_LINKS, getPublicArtist, type PublicArtist } from '../lib/artistsApi'

/** wa.me needs an international number; a local "0772…" number can't be turned into one reliably, so only "+…" gets a WhatsApp button. */
function whatsappLink(phone: string): string | null {
  const trimmed = phone.trim()
  if (!trimmed.startsWith('+')) return null
  const digits = trimmed.replace(/\D/g, '')
  return digits.length >= 8 ? `https://wa.me/${digits}` : null
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-ink text-white">
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-orange/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-40 h-96 w-96 rounded-full bg-brand-purple/20 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-8 sm:px-6">
        <main className="flex-1">{children}</main>
        <footer className="mt-12 flex items-center justify-center gap-2 text-xs text-neutral-500">
          Powered by
          <Link to="/" aria-label="ArtBH home">
            <Logo variant="dark" className="h-7" />
          </Link>
        </footer>
      </div>
    </div>
  )
}

function Profile({ artist }: { artist: PublicArtist }) {
  const subtitle = [artist.category, ...artist.genres].filter(Boolean).join(' · ')
  const whatsapp = artist.bookingPhone ? whatsappLink(artist.bookingPhone) : null
  const links = SOCIAL_LINKS.filter(({ key }) => artist[key])
  const hasContact = Boolean(artist.bookingEmail || artist.bookingPhone)
  const mailSubject = encodeURIComponent(`Booking enquiry for ${artist.name}`)

  return (
    <article className="animate-fade-in-up">
      <header className="flex flex-col items-center pt-6 text-center">
        {artist.photoUrl ? (
          <img
            src={artist.photoUrl}
            alt={artist.name}
            className="h-36 w-36 rounded-full object-cover ring-4 ring-white/10 sm:h-44 sm:w-44"
          />
        ) : (
          <span className="flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-brand-orange to-brand-purple sm:h-44 sm:w-44">
            <Mic2 size={48} className="text-white/90" />
          </span>
        )}
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">{artist.name}</h1>
        {subtitle && <p className="mt-2 text-sm font-medium text-brand-orange-light sm:text-base">{subtitle}</p>}
        {artist.location && (
          <p className="mt-2 flex items-center gap-1 text-sm text-neutral-400">
            <MapPin size={14} />
            {artist.location}
          </p>
        )}
        {artist.tagline && <p className="mt-5 max-w-xl text-lg text-neutral-200">{artist.tagline}</p>}
      </header>

      {hasContact && (
        <section className="mt-8 flex flex-wrap justify-center gap-3">
          {artist.bookingEmail && (
            <a
              href={`mailto:${artist.bookingEmail}?subject=${mailSubject}`}
              className="flex items-center gap-2 rounded-full bg-brand-orange px-6 py-3 text-sm font-semibold text-white hover:bg-brand-orange/90"
            >
              <Mail size={16} />
              Book {artist.name}
            </a>
          )}
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5"
            >
              <MessageCircle size={16} />
              WhatsApp
            </a>
          )}
          {artist.bookingPhone && (
            <a
              href={`tel:${artist.bookingPhone.replace(/[^\d+]/g, '')}`}
              className="flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5"
            >
              <Phone size={16} />
              {artist.bookingPhone}
            </a>
          )}
        </section>
      )}

      {artist.bio && (
        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">About</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-neutral-200">{artist.bio}</p>
        </section>
      )}

      {artist.hasEpk && (
        <section className="mt-6 flex justify-center">
          <Link
            to={`/a/${artist.slug}/epk`}
            className="flex items-center gap-2 rounded-2xl border border-brand-orange/30 bg-brand-orange/10 px-5 py-3 text-sm font-semibold text-brand-orange-light hover:bg-brand-orange/15"
          >
            <FileText size={16} />
            View full press kit
          </Link>
        </section>
      )}

      {links.length > 0 && (
        <section className="mt-6 flex flex-wrap justify-center gap-2">
          {links.map(({ key, label }) => (
            <a
              key={key}
              href={artist[key]!}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-neutral-300 hover:border-white/20 hover:text-white"
            >
              {label}
              <ArrowUpRight size={14} />
            </a>
          ))}
        </section>
      )}
    </article>
  )
}

export function PublicArtistPage() {
  const { slug = '' } = useParams()
  const { data: artist, isLoading, error } = useQuery({
    queryKey: ['public-artist', slug],
    queryFn: () => getPublicArtist(slug),
    retry: (count, err) => !(axios.isAxiosError(err) && err.response?.status === 404) && count < 2,
  })

  useEffect(() => {
    if (artist) document.title = `${artist.name} | ArtBH`
  }, [artist])

  if (isLoading) {
    return (
      <Shell>
        <p className="pt-24 text-center text-sm text-neutral-500">Loading…</p>
      </Shell>
    )
  }

  if (!artist) {
    const notFound = axios.isAxiosError(error) && error.response?.status === 404
    return (
      <Shell>
        <div className="pt-24 text-center">
          <Mic2 size={32} className="mx-auto text-neutral-600" />
          <h1 className="mt-4 text-xl font-bold">{notFound ? 'Profile not found' : 'Something went wrong'}</h1>
          <p className="mt-2 text-sm text-neutral-400">
            {notFound
              ? "This artist profile doesn't exist or isn't public yet."
              : 'We could not load this profile. Please try again in a moment.'}
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <Profile artist={artist} />
    </Shell>
  )
}
