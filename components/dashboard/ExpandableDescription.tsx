'use client'

import { useState } from 'react'

export default function ExpandableDescription({
  description,
  fullDescription,
}: {
  description: string
  fullDescription?: string | null
}) {
  const [open, setOpen] = useState(false)

  const hasSeparateFull =
    !!fullDescription && fullDescription.trim() !== description.trim()

  const expandedExtra = hasSeparateFull ? fullDescription : null

  return (
    <>
      <p
        className={`mt-5 whitespace-pre-line text-sm leading-relaxed text-ink/65 ${
          !open && !hasSeparateFull ? 'line-clamp-3' : ''
        }`}
      >
        {description}
      </p>

      {open && expandedExtra && (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/65">
          {expandedExtra}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex items-center text-xs font-bold uppercase tracking-wide text-teal-deep transition-colors hover:text-teal"
      >
        {open ? 'Show less' : 'Full details'}
        <span className={`ml-1 inline-block transition-transform ${open ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>
    </>
  )
}