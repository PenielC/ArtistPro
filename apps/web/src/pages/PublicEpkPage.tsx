import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { FileText } from 'lucide-react'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { EpkDocument } from '../components/EpkDocument'
import { getPublicEpk, publicEpkUrl } from '../lib/epkApi'

export function PublicEpkPage() {
  const { slug = '' } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-epk', slug],
    queryFn: () => getPublicEpk(slug),
    retry: (count, err) => !(axios.isAxiosError(err) && err.response?.status === 404) && count < 2,
  })

  useEffect(() => {
    if (data) document.title = `${data.artist.name} | Press Kit`
  }, [data])

  if (data) return <EpkDocument data={data} profileHref={`/a/${slug}`} onlineUrl={publicEpkUrl(slug)} />

  const notFound = axios.isAxiosError(error) && error.response?.status === 404
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-ink px-4 text-center text-white">
      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div>
          <FileText size={32} className="mx-auto text-neutral-600" />
          <h1 className="mt-4 text-xl font-bold">{notFound ? 'Press kit not found' : 'Something went wrong'}</h1>
          <p className="mt-2 text-sm text-neutral-400">
            {notFound
              ? "This press kit doesn't exist or isn't public yet."
              : 'We could not load this press kit. Please try again in a moment.'}
          </p>
        </div>
      )}
    </div>
  )
}
