// components/stores/ShareButton.tsx
//
// Share a store or a product (lib/share.ts): the phone's share sheet when
// there is one — important in the installed app, which has no address bar —
// otherwise the link is copied, with a "Link copied" note so the shopper
// knows it worked.
'use client'

import { useEffect, useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { shareLink, shareUrl } from '@/lib/share'

export default function ShareButton({
  title,
  text,
  url,
  look = 'icon',
  label = 'Share',
  className = '',
}: {
  title: string
  text?: string
  /** Path or full link to share; defaults to this page without its query. */
  url?: string
  /** icon: small bare icon · round: circle like the Follow button · pill: icon + label. */
  look?: 'icon' | 'round' | 'pill'
  label?: string
  className?: string
}) {
  const [note, setNote] = useState<'copied' | 'failed' | null>(null)
  useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 2200)
    return () => window.clearTimeout(t)
  }, [note])

  async function onShare() {
    const r = await shareLink({ title, text, url: url ? shareUrl(url) : undefined })
    if (r === 'copied' || r === 'failed') setNote(r)
  }

  const Icon = note === 'copied' ? Check : Share2
  const base =
    look === 'pill'
      ? 'inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/15 bg-card px-3.5 text-sm font-semibold text-ink/80 hover:border-ink/30 hover:text-ink'
      : look === 'round'
        ? 'grid h-9 w-9 place-items-center rounded-full border border-ink/15 bg-card text-ink/70 hover:text-ink'
        : 'grid h-8 w-8 place-items-center rounded-xl text-ink/50 hover:bg-card hover:text-ink'

  return (
    <span className={`relative inline-flex ${className}`}>
      <button type="button" onClick={onShare} aria-label={`${label}: ${title}`} title={label} className={`transition-colors ${base}`}>
        <Icon size={look === 'icon' ? 15 : 14} className={note === 'copied' ? 'text-teal-deep' : ''} aria-hidden />
        {look === 'pill' && <span>{note === 'copied' ? 'Copied' : label}</span>}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={`pointer-events-none absolute right-0 top-full z-40 mt-1.5 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 font-body text-xs font-semibold text-parchment shadow-lg transition-opacity ${
          note ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {note === 'copied' ? 'Link copied' : note === 'failed' ? 'Couldn’t copy the link' : ''}
      </span>
    </span>
  )
}
