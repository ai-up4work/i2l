// components/stores/TagList.tsx
'use client'

import { useState } from 'react'
import { Tag as TagIcon } from 'lucide-react'

const MAX_VISIBLE_TAGS = 6

export default function TagList({ tags }: { tags: string[] }) {
  const [expanded, setExpanded] = useState(false)
  if (!tags.length) return null

  const visible = expanded ? tags : tags.slice(0, MAX_VISIBLE_TAGS)
  const hiddenCount = tags.length - visible.length

  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5">
      <TagIcon size={11} className="mr-0.5 text-ink/30" strokeWidth={1.8} />
      {visible.map((t) => (
        <span
          key={t}
          className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-ink/50 ring-1 ring-inset ring-ink/10"
        >
          {t}
        </span>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-ink/70 ring-1 ring-inset ring-ink/10 transition-colors hover:bg-ink/5"
        >
          +{hiddenCount} more
        </button>
      )}
      {expanded && tags.length > MAX_VISIBLE_TAGS && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-ink/70 ring-1 ring-inset ring-ink/10 transition-colors hover:bg-ink/5"
        >
          Show less
        </button>
      )}
    </div>
  )
}