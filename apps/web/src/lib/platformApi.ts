import { api } from './api'

export type AnnouncementTone = 'INFO' | 'WARNING'

export interface PublicPlatform {
  signupsEnabled: boolean
  announcement: { message: string; tone: AnnouncementTone; updatedAt: string } | null
}

export async function getPublicPlatform(): Promise<PublicPlatform> {
  const { data } = await api.get<PublicPlatform>('/public/platform')
  return data
}
