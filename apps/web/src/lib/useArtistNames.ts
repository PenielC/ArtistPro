import { useQuery } from '@tanstack/react-query'
import { listArtists } from './artistsApi'

/** id → name lookup for showing the linked artist on list rows. */
export function useArtistNames(): Map<string, string> {
  const { data: artists } = useQuery({ queryKey: ['artists'], queryFn: listArtists })
  return new Map((artists ?? []).map((a) => [a.id, a.name]))
}
