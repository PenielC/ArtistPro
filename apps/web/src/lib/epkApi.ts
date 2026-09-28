import { api } from './api'
import type { PublicArtist } from './artistsApi'

export interface DiscographyItem {
  title: string
  kind?: string
  year?: number
  url?: string
}
export interface PerformanceItem {
  name: string
  location?: string
  year?: number
}
export interface PressQuote {
  quote: string
  source: string
  url?: string
}
export interface GalleryItem {
  url: string
  caption?: string
}
export interface MediaItem {
  title?: string
  url: string
}

export interface EpkContent {
  achievements: string[]
  discography: DiscographyItem[]
  performances: PerformanceItem[]
  pressQuotes: PressQuote[]
  gallery: GalleryItem[]
  media: MediaItem[]
}

/** What the EPK document renders: the same shape for the public page and the private preview. */
export interface EpkView {
  artist: PublicArtist
  epk: EpkContent & { updatedAt: string | null }
}

export interface EpkEditorData {
  artist: PublicArtist & { id: string; isPublished: boolean }
  epk: EpkContent & { isPublished: boolean; updatedAt: string | null }
}

export const DISCOGRAPHY_KINDS = ['Album', 'EP', 'Single', 'Mixtape', 'Live album', 'Compilation']

export async function getEpk(artistId: string): Promise<EpkEditorData> {
  const { data } = await api.get<EpkEditorData>(`/artists/${artistId}/epk`)
  return data
}

export async function saveEpk(
  artistId: string,
  input: Partial<EpkContent> & { isPublished?: boolean },
): Promise<EpkEditorData> {
  const { data } = await api.put<EpkEditorData>(`/artists/${artistId}/epk`, input)
  return data
}

export async function getPublicEpk(slug: string): Promise<EpkView> {
  const { data } = await api.get<EpkView>(`/public/artists/${encodeURIComponent(slug)}/epk`)
  return data
}

export function publicEpkUrl(slug: string): string {
  return `${window.location.origin}/a/${slug}/epk`
}
