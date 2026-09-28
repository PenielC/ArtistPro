import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Eye } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EpkDocument } from '../components/EpkDocument'
import { getEpk, publicEpkUrl } from '../lib/epkApi'

/** Private preview of the saved kit, published or not, so it can be checked and saved as PDF before sharing. */
export function EpkPreviewPage() {
  const { artistId = '' } = useParams()
  const { data, isLoading, isError } = useQuery({ queryKey: ['epk', artistId], queryFn: () => getEpk(artistId) })

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-ink text-sm text-neutral-500">
        {isLoading ? 'Loading…' : isError ? 'Could not load this press kit.' : null}
      </div>
    )
  }

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-brand-ink/95 px-4 py-2.5 text-sm backdrop-blur print:hidden">
        <Link to={`/epk/${artistId}`} className="flex items-center gap-2 text-neutral-300 hover:text-white">
          <ArrowLeft size={16} />
          Back to editor
        </Link>
        <span className="flex items-center gap-2 text-neutral-400">
          <Eye size={14} />
          {data.epk.isPublished ? 'Preview of your published press kit' : 'Private preview: this press kit is not public yet'}
        </span>
      </div>
      <EpkDocument
        data={data}
        profileHref={data.artist.isPublished ? `/a/${data.artist.slug}` : undefined}
        onlineUrl={data.epk.isPublished ? publicEpkUrl(data.artist.slug) : undefined}
      />
    </>
  )
}
