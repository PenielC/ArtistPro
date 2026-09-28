import type { ReactNode } from 'react'

/** **bold** only; everything else stays literal text (React escapes it). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}

/**
 * Renders the small Markdown subset the AI is asked to produce (headings,
 * bullet and numbered lists, bold, paragraphs) as React elements, never as HTML,
 * so model output can't inject markup. Works on partial text while streaming.
 */
export function SimpleMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={blocks.length} className="leading-relaxed text-neutral-200">
          {inline(paragraph.join(' '))}
        </p>,
      )
      paragraph = []
    }
  }
  const flushList = () => {
    if (list) {
      const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>)
      blocks.push(
        list.ordered ? (
          <ol key={blocks.length} className="list-decimal space-y-1.5 pl-5 text-neutral-200 marker:text-neutral-500">
            {items}
          </ol>
        ) : (
          <ul key={blocks.length} className="list-disc space-y-1.5 pl-5 text-neutral-200 marker:text-brand-orange">
            {items}
          </ul>
        ),
      )
      list = null
    }
  }

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (heading) {
      flushParagraph()
      flushList()
      const Tag = heading[1].length === 1 ? 'h2' : 'h3'
      blocks.push(
        <Tag key={blocks.length} className={heading[1].length === 1 ? 'text-lg font-bold text-white' : 'pt-2 text-sm font-semibold uppercase tracking-wide text-brand-orange-light'}>
          {inline(heading[2])}
        </Tag>,
      )
    } else if (bullet || numbered) {
      flushParagraph()
      const ordered = !!numbered
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
    } else if (!line.trim()) {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line.trim())
    }
  }
  flushParagraph()
  flushList()

  return <div className="flex flex-col gap-3 text-sm">{blocks}</div>
}
