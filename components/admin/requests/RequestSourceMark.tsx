// components/admin/requests/RequestSourceMark.tsx
//
// Visual anchor for a request card. A request has no catalog product
// image, but its first item often has a customer-submitted screenshot —
// that's the closest thing to a "product photo" a request has, so it
// takes priority. Falls back to a domain monogram tile when no
// screenshot exists yet, OR when the screenshot URL fails to actually
// load (broken link, expired hotlink, etc.) — onError flips imgFailed
// so a dead image degrades to the monogram instead of showing raw
// broken-image alt text in the card.
"use client"

import { useState } from "react"

const PALETTE = [
  { bg: "bg-teal-deep/12", text: "text-teal-deep", ring: "ring-teal-deep/20" },
  { bg: "bg-gold/20", text: "text-gold-deep", ring: "ring-gold-deep/20" },
  { bg: "bg-indigo-100", text: "text-indigo-700", ring: "ring-indigo-200" },
  { bg: "bg-ink/8", text: "text-ink/60", ring: "ring-ink/15" },
  { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" },
  { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-200" },
]

function hashDomain(domain: string) {
  let h = 0
  const safe = domain ?? ""
  for (let i = 0; i < safe.length; i++) h = (h * 31 + safe.charCodeAt(i)) >>> 0
  return h
}

export function RequestSourceMark({
  domain,
  screenshotUrl,
  itemCount,
  breached,
  className = "",
}: {
  domain: string
  /** Customer-submitted screenshot for the first item, if any — shown in place of the monogram when present and loadable. */
  screenshotUrl?: string
  itemCount?: number
  breached?: boolean
  className?: string
}) {
  const [imgFailed, setImgFailed] = useState(false)

  if (screenshotUrl && !imgFailed) {
    return (
      <div className={`relative h-full w-full overflow-hidden rounded-xl bg-ink/5 ${className}`}>
        <img
          src={screenshotUrl}
          alt="Customer-submitted reference"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
        {breached && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-600 ring-2 ring-white" />
        )}
        {itemCount !== undefined && itemCount > 1 && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold text-white ring-2 ring-card">
            {itemCount}
          </span>
        )}
      </div>
    )
  }

  const safeDomain = domain ?? ""
  const tone = PALETTE[hashDomain(safeDomain) % PALETTE.length]
  const initial = safeDomain.replace(/^www\./, "").charAt(0).toUpperCase() || "?"

  return (
    <div
      className={`relative grid h-full w-full place-items-center rounded-xl ring-1 ring-inset ${tone.bg} ${tone.ring} ${className}`}
    >
      <span className={`font-display text-2xl leading-none ${tone.text}`}>{initial}</span>
      {breached && (
        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-600 ring-2 ring-card" />
      )}
      {itemCount !== undefined && itemCount > 1 && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold text-white ring-2 ring-card">
          {itemCount}
        </span>
      )}
    </div>
  )
}