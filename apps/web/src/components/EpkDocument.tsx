import { ArrowUpRight, Download, Mail, MapPin, MessageCircle, Mic2, Phone, Quote } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SOCIAL_LINKS, type PublicArtist } from '../lib/artistsApi'
import type { EpkView } from '../lib/epkApi'
import { displayHost, toEmbed } from '../lib/mediaEmbed'
import { Logo } from './Logo'

/** wa.me needs an international number, so only "+…" numbers get a WhatsApp button. */
function whatsappLink(phone: string): string | null {
  const trimmed = phone.trim()
  if (!trimmed.startsWith('+')) return null
  const digits = trimmed.replace(/\D/g, '')
  return digits.length >= 8 ? `https://wa.me/${digits}` : null
}

function subtitleOf(artist: PublicArtist) {
  return [artist.category, ...artist.genres].filter(Boolean).join(' · ')
}

function formatUpdated(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null
}

// ─────────────────────────────── Web layout ───────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-orange-light">
        <span className="h-px w-8 bg-brand-orange" />
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function MediaPlayer({ title, url }: { title?: string; url: string }) {
  const embed = toEmbed(url)
  if (!embed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center justify-between gap-3 self-start rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 hover:border-white/20"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-white">{title || displayHost(url)}</span>
          <span className="block truncate text-xs text-neutral-500">{displayHost(url)}</span>
        </span>
        <ArrowUpRight size={16} className="shrink-0 text-neutral-400" />
      </a>
    )
  }
  return (
    <figure className={embed.height === 'video' ? '' : 'md:col-span-2'}>
      <div className={`overflow-hidden rounded-xl border border-white/10 bg-black ${embed.height === 'video' ? 'aspect-video' : ''}`}>
        <iframe
          src={embed.src}
          title={title || `${embed.provider} player`}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          className="block w-full"
          style={{ height: embed.height === 'video' ? '100%' : embed.height }}
        />
      </div>
      {title && <figcaption className="mt-2 text-sm text-neutral-400">{title}</figcaption>}
    </figure>
  )
}

function WebEpk({ data, profileHref }: { data: EpkView; profileHref?: string }) {
  const { artist, epk } = data
  const subtitle = subtitleOf(artist)
  const whatsapp = artist.bookingPhone ? whatsappLink(artist.bookingPhone) : null
  const links = SOCIAL_LINKS.filter(({ key }) => artist[key])
  const mailSubject = encodeURIComponent(`Booking enquiry for ${artist.name}`)
  const updated = formatUpdated(epk.updatedAt)

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-ink text-white print:hidden">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand-orange/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-60 h-[28rem] w-[28rem] rounded-full bg-brand-purple/20 blur-3xl" />

      <div className="relative mx-auto max-w-5xl px-4 pb-10 pt-10 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">Electronic Press Kit</p>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white hover:bg-white/5"
          >
            <Download size={14} />
            Download PDF
          </button>
        </div>

        <header className="mt-8 grid items-center gap-8 md:grid-cols-[auto_1fr]">
          {artist.photoUrl ? (
            <img
              src={artist.photoUrl}
              alt={artist.name}
              className="mx-auto h-56 w-56 rounded-3xl object-cover ring-1 ring-white/10 md:h-72 md:w-72"
            />
          ) : (
            <span className="mx-auto flex h-56 w-56 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-orange to-brand-purple md:h-72 md:w-72">
              <Mic2 size={64} className="text-white/90" />
            </span>
          )}
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">{artist.name}</h1>
            {subtitle && <p className="mt-3 font-medium text-brand-orange-light">{subtitle}</p>}
            {artist.location && (
              <p className="mt-2 flex items-center justify-center gap-1 text-sm text-neutral-400 md:justify-start">
                <MapPin size={14} />
                {artist.location}
              </p>
            )}
            {artist.tagline && <p className="mt-5 text-lg text-neutral-200">{artist.tagline}</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
              {artist.bookingEmail && (
                <a
                  href={`mailto:${artist.bookingEmail}?subject=${mailSubject}`}
                  className="flex items-center gap-2 rounded-full bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90"
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
                  className="flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/5"
                >
                  <MessageCircle size={16} />
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </header>

        {artist.bio && (
          <Section title="Biography">
            <p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed text-neutral-200">{artist.bio}</p>
          </Section>
        )}

        {epk.achievements.length > 0 && (
          <Section title="Highlights">
            <ul className="grid gap-3 sm:grid-cols-2">
              {epk.achievements.map((a, i) => (
                <li key={i} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-neutral-200">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange" />
                  {a}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {epk.media.length > 0 && (
          <Section title="Watch & listen">
            <div className="grid gap-5 md:grid-cols-2">
              {epk.media.map((m, i) => (
                <MediaPlayer key={i} title={m.title} url={m.url} />
              ))}
            </div>
          </Section>
        )}

        {epk.pressQuotes.length > 0 && (
          <Section title="Press">
            <div className="grid gap-5 md:grid-cols-2">
              {epk.pressQuotes.map((q, i) => (
                <blockquote key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <Quote size={20} className="text-brand-orange" />
                  <p className="mt-3 text-lg leading-relaxed text-white">{q.quote}</p>
                  <footer className="mt-4 text-sm text-neutral-400">
                    —{' '}
                    {q.url ? (
                      <a href={q.url} target="_blank" rel="noreferrer noopener" className="underline decoration-white/20 hover:text-white">
                        {q.source}
                      </a>
                    ) : (
                      q.source
                    )}
                  </footer>
                </blockquote>
              ))}
            </div>
          </Section>
        )}

        {epk.discography.length > 0 && (
          <Section title="Discography">
            <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.03]">
              {epk.discography.map((d, i) => (
                <li key={i} className="flex items-center gap-4 px-5 py-4">
                  <span className="w-12 shrink-0 text-sm tabular-nums text-neutral-500">{d.year ?? ''}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-white">{d.title}</span>
                    {d.kind && <span className="text-xs text-neutral-500">{d.kind}</span>}
                  </span>
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-1 text-sm text-brand-orange-light hover:text-white"
                    >
                      Listen
                      <ArrowUpRight size={14} />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {epk.performances.length > 0 && (
          <Section title="Notable performances">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {epk.performances.map((p, i) => (
                <li key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-medium text-white">{p.name}</p>
                  <p className="mt-1 text-sm text-neutral-500">{[p.location, p.year].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {epk.gallery.length > 0 && (
          <Section title="Gallery">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {epk.gallery.map((g, i) => (
                <a key={i} href={g.url} target="_blank" rel="noreferrer noopener" className="group relative block overflow-hidden rounded-xl">
                  <img src={g.url} alt={g.caption ?? `${artist.name} photo ${i + 1}`} loading="lazy" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                  {g.caption && (
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-xs text-white">
                      {g.caption}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </Section>
        )}

        {(artist.bookingEmail || artist.bookingPhone || links.length > 0) && (
          <Section title="Booking & contact">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 text-sm">
                {artist.bookingEmail && (
                  <a href={`mailto:${artist.bookingEmail}?subject=${mailSubject}`} className="flex items-center gap-2 text-white hover:text-brand-orange-light">
                    <Mail size={16} className="text-neutral-500" />
                    {artist.bookingEmail}
                  </a>
                )}
                {artist.bookingPhone && (
                  <a href={`tel:${artist.bookingPhone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-white hover:text-brand-orange-light">
                    <Phone size={16} className="text-neutral-500" />
                    {artist.bookingPhone}
                  </a>
                )}
              </div>
              {links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {links.map(({ key, label }) => (
                    <a
                      key={key}
                      href={artist[key]!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-sm text-neutral-300 hover:border-white/20 hover:text-white"
                    >
                      {label}
                      <ArrowUpRight size={14} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        <footer className="mt-16 flex flex-col items-center gap-3 text-xs text-neutral-500">
          {profileHref && (
            <Link to={profileHref} className="text-neutral-400 underline decoration-white/20 hover:text-white">
              View {artist.name}&apos;s profile
            </Link>
          )}
          {updated && <p>Last updated {updated}</p>}
          <span className="flex items-center gap-2">
            Powered by
            <Link to="/" aria-label="ArtBH home">
              <Logo variant="dark" className="h-7" />
            </Link>
          </span>
        </footer>
      </div>
    </div>
  )
}

// ────────────────────────────── Print layout ──────────────────────────────
// A separate light, A4-friendly layout: players become titled links, and every
// link is printed as text because a PDF often ends up on paper.

function PrintSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h2 className="border-b-2 border-[#fa5813] pb-1 text-[10pt] font-bold uppercase tracking-[0.15em] text-neutral-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function PrintEpk({ data, onlineUrl }: { data: EpkView; onlineUrl?: string }) {
  const { artist, epk } = data
  const subtitle = subtitleOf(artist)
  const links = SOCIAL_LINKS.filter(({ key }) => artist[key])
  const updated = formatUpdated(epk.updatedAt)

  return (
    <div className="hidden bg-white text-[10.5pt] leading-snug text-neutral-800 [print-color-adjust:exact] print:block">
      <header className="flex items-start gap-6 border-b border-neutral-200 pb-5">
        {artist.photoUrl && <img src={artist.photoUrl} alt="" className="h-40 w-40 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="text-[8pt] font-semibold uppercase tracking-[0.25em] text-[#fa5813]">Electronic Press Kit</p>
          <h1 className="mt-1 text-[28pt] font-bold leading-tight text-neutral-950">{artist.name}</h1>
          {subtitle && <p className="mt-1 font-medium text-neutral-700">{subtitle}</p>}
          {artist.location && <p className="text-neutral-500">{artist.location}</p>}
          {artist.tagline && <p className="mt-3 italic text-neutral-700">{artist.tagline}</p>}
        </div>
        {(artist.bookingEmail || artist.bookingPhone) && (
          <div className="w-52 shrink-0 rounded-lg bg-neutral-100 p-3 text-[9pt]">
            <p className="font-bold uppercase tracking-wide text-neutral-900">Bookings</p>
            {artist.bookingEmail && <p className="mt-1 break-all">{artist.bookingEmail}</p>}
            {artist.bookingPhone && <p className="mt-0.5">{artist.bookingPhone}</p>}
          </div>
        )}
      </header>

      {artist.bio && (
        <PrintSection title="Biography">
          <p className="whitespace-pre-line">{artist.bio}</p>
        </PrintSection>
      )}

      {(epk.achievements.length > 0 || epk.performances.length > 0) && (
        <div className="grid grid-cols-2 gap-8">
          {epk.achievements.length > 0 && (
            <PrintSection title="Highlights">
              <ul className="list-disc space-y-1 pl-4 marker:text-[#fa5813]">
                {epk.achievements.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </PrintSection>
          )}
          {epk.performances.length > 0 && (
            <PrintSection title="Notable performances">
              <ul className="space-y-1">
                {epk.performances.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium text-neutral-900">{p.name}</span>
                    {(p.location || p.year) && <span className="text-neutral-500"> · {[p.location, p.year].filter(Boolean).join(' · ')}</span>}
                  </li>
                ))}
              </ul>
            </PrintSection>
          )}
        </div>
      )}

      {epk.pressQuotes.length > 0 && (
        <PrintSection title="Press">
          <div className="space-y-3">
            {epk.pressQuotes.map((q, i) => (
              <blockquote key={i} className="break-inside-avoid border-l-4 border-[#fa5813] pl-3">
                <p className="italic text-neutral-900">&ldquo;{q.quote}&rdquo;</p>
                <footer className="mt-0.5 text-[9pt] text-neutral-500">
                  — {q.source}
                  {q.url && ` (${q.url})`}
                </footer>
              </blockquote>
            ))}
          </div>
        </PrintSection>
      )}

      {epk.discography.length > 0 && (
        <PrintSection title="Discography">
          <table className="w-full text-left">
            <tbody>
              {epk.discography.map((d, i) => (
                <tr key={i} className="break-inside-avoid border-b border-neutral-100 align-top">
                  <td className="w-12 py-1 tabular-nums text-neutral-500">{d.year ?? ''}</td>
                  <td className="py-1 font-medium text-neutral-900">{d.title}</td>
                  <td className="py-1 text-neutral-500">{d.kind ?? ''}</td>
                  <td className="break-all py-1 text-[8.5pt] text-neutral-500">{d.url ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintSection>
      )}

      {epk.media.length > 0 && (
        <PrintSection title="Watch & listen">
          <ul className="space-y-1">
            {epk.media.map((m, i) => (
              <li key={i}>
                <span className="font-medium text-neutral-900">{m.title || toEmbed(m.url)?.provider || displayHost(m.url)}</span>
                <span className="break-all text-[8.5pt] text-neutral-500"> · {m.url}</span>
              </li>
            ))}
          </ul>
        </PrintSection>
      )}

      {epk.gallery.length > 0 && (
        <PrintSection title="Gallery">
          <div className="grid grid-cols-3 gap-2">
            {epk.gallery.map((g, i) => (
              <figure key={i} className="break-inside-avoid">
                <img src={g.url} alt="" className="aspect-[4/3] w-full rounded object-cover" />
                {g.caption && <figcaption className="mt-0.5 text-[8pt] text-neutral-500">{g.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </PrintSection>
      )}

      {links.length > 0 && (
        <PrintSection title="Online">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[9pt]">
            {links.map(({ key, label }) => (
              <li key={key} className="break-all">
                <span className="font-medium text-neutral-900">{label}:</span> {artist[key]}
              </li>
            ))}
          </ul>
        </PrintSection>
      )}

      <footer className="mt-8 flex items-center justify-between border-t border-neutral-200 pt-2 text-[8pt] text-neutral-400">
        <span>{onlineUrl ? `Online press kit: ${onlineUrl}` : ''}</span>
        <span>{updated ? `Updated ${updated} · ` : ''}ArtBH</span>
      </footer>
    </div>
  )
}

/**
 * The press kit, used by the public /a/:slug/epk page and the private preview.
 * On screen it's the dark web layout; when printed (Download PDF) it switches
 * to the light A4 layout.
 */
export function EpkDocument({ data, profileHref, onlineUrl }: { data: EpkView; profileHref?: string; onlineUrl?: string }) {
  return (
    <>
      <WebEpk data={data} profileHref={profileHref} />
      <PrintEpk data={data} onlineUrl={onlineUrl} />
    </>
  )
}
