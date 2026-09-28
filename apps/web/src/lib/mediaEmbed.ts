export type EmbedProvider = 'YouTube' | 'Vimeo' | 'Spotify' | 'SoundCloud'

export interface MediaEmbed {
  provider: EmbedProvider
  src: string
  /** 'video' → 16:9 box; otherwise a fixed player height in px. */
  height: 'video' | number
}

/**
 * Turns a recognised YouTube / Vimeo / Spotify / SoundCloud link into an
 * embeddable player URL. The iframe src is always rebuilt from the parsed id on
 * the provider's own embed host — never the pasted URL — so an arbitrary link
 * can't be framed. Anything unrecognised returns null and renders as a link card.
 */
export function toEmbed(raw: string): MediaEmbed | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '')
  const path = url.pathname

  let youtubeId: string | null = null
  if (host === 'youtu.be') youtubeId = path.split('/')[1] ?? null
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    youtubeId = path === '/watch' ? url.searchParams.get('v') : (path.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null)
  }
  if (youtubeId && /^[\w-]{11}$/.test(youtubeId)) {
    return { provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${youtubeId}`, height: 'video' }
  }

  if (host === 'vimeo.com') {
    const id = path.match(/^\/(\d+)(?:\/|$)/)?.[1]
    if (id) return { provider: 'Vimeo', src: `https://player.vimeo.com/video/${id}`, height: 'video' }
  }

  if (host === 'open.spotify.com') {
    const m = path.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/)
    if (m) {
      const compact = m[1] === 'track' || m[1] === 'episode'
      return { provider: 'Spotify', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: compact ? 152 : 352 }
    }
  }

  if (host === 'soundcloud.com') {
    const segments = path.split('/').filter(Boolean)
    if (segments.length >= 2 && segments.every((s) => /^[\w-]+$/.test(s))) {
      const target = encodeURIComponent(`https://soundcloud.com/${segments.join('/')}`)
      return {
        provider: 'SoundCloud',
        src: `https://w.soundcloud.com/player/?url=${target}&color=%23fa5813&visual=false`,
        height: segments[1] === 'sets' ? 450 : 166,
      }
    }
  }

  return null
}

/** "https://www.youtube.com/watch?v=…" → "youtube.com". For link cards and the printed kit. */
export function displayHost(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '')
  } catch {
    return raw
  }
}
