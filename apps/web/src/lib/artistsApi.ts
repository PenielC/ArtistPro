import { api } from './api'

export interface PublicArtist {
  name: string
  slug: string
  category: string | null
  genres: string[]
  tagline: string | null
  bio: string | null
  location: string | null
  photoUrl: string | null
  bookingEmail: string | null
  bookingPhone: string | null
  website: string | null
  instagram: string | null
  facebook: string | null
  tiktok: string | null
  youtube: string | null
  spotify: string | null
  /** Only on the public profile response: whether a published press kit exists to link to. */
  hasEpk?: boolean
}

export interface Artist extends PublicArtist {
  id: string
  organizationId: string
  isPublished: boolean
  createdAt: string
  updatedAt: string
  _count?: { bookings: number; quotes: number; contracts: number; invoices: number }
  epk?: { isPublished: boolean; updatedAt: string } | null
}

/** Optional fields are sent as null on update so a cleared input actually clears the stored value. */
export type ArtistInput = { name: string; slug?: string; genres?: string[]; isPublished?: boolean } & {
  [K in Exclude<keyof PublicArtist, 'name' | 'slug' | 'genres' | 'hasEpk'>]?: string | null
}

export const ARTIST_CATEGORIES = [
  'Musician',
  'Band',
  'DJ',
  'Comedian',
  'MC / Host',
  'Speaker',
  'Dancer',
  'Performer',
  'Photographer',
  'Content Creator',
]

export const SOCIAL_LINKS = [
  { key: 'website', label: 'Website' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'spotify', label: 'Spotify' },
] as const

export function publicProfileUrl(slug: string): string {
  return `${window.location.origin}/a/${slug}`
}

export async function listArtists(): Promise<Artist[]> {
  const { data } = await api.get<Artist[]>('/artists')
  return data
}

export async function createArtist(input: ArtistInput): Promise<Artist> {
  const { data } = await api.post<Artist>('/artists', input)
  return data
}

export async function updateArtist(id: string, input: Partial<ArtistInput>): Promise<Artist> {
  const { data } = await api.patch<Artist>(`/artists/${id}`, input)
  return data
}

export async function deleteArtist(id: string): Promise<void> {
  await api.delete(`/artists/${id}`)
}

export async function getPublicArtist(slug: string): Promise<PublicArtist> {
  const { data } = await api.get<PublicArtist>(`/public/artists/${encodeURIComponent(slug)}`)
  return data
}
