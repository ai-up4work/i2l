// components/stores/ShareButton.tsx
'use client'

import { Share2 } from 'lucide-react'

export default function ShareButton({ title }: { title: string }) {
  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title, url: window.location.href }).catch(() => {})
    } else if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(window.location.href).catch(() => {})
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Share this product"
      className="rounded-xl p-2 transition-colors hover:bg-card"
    >
      <Share2 size={14} className="text-ink/50" />
    </button>
  )
}