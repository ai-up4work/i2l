'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function CopyCouponCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard?.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center justify-between rounded-xl border border-dashed border-ink/20 bg-card px-4 py-2.5 font-mono text-sm font-semibold text-ink transition-colors hover:border-teal/50"
    >
      {code}
      {copied ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-teal-deep">
          <Check size={14} /> Copied
        </span>
      ) : (
        <Copy size={14} className="text-ink/40" />
      )}
    </button>
  )
}
