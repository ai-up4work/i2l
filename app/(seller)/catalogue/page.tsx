// app/seller/catalogue/page.tsx
'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, ChevronRight, Clock, Inbox } from 'lucide-react'

import {
  getCataloguesForSeller,
  getCurrentSellerId,
  STATUS_LABEL,
  STATUS_DOT,
  STATUS_PILL,
} from '@/data/catalogues/data'

// ---------------------------------------------------------------------------
// /seller/catalogue — Seller Dashboard (external, separate auth per §3)
//
// Scoped structurally to the signed-in seller's own products only —
// getCataloguesForSeller filters by sellerId, never trusts a client
// parameter. No cost/margin math shown beyond the seller's own cost
// price; sellingPrice, markupPercent, and margin/profit never appear
// here (see the edit page for why).
// ---------------------------------------------------------------------------

export default function SellerCataloguePage() {
  const router = useRouter()
  const sellerId = getCurrentSellerId() // TODO(wire-up): real seller session
  const entries = useMemo(() => getCataloguesForSeller(sellerId), [sellerId])

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-4xl px-6 pb-20 pt-10 lg:px-10">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
            <BookOpen size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display text-3xl text-ink">Your listings</h1>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
              Products WishDrop is selling in Sri Lanka on your behalf. Propose a cost or availability change on
              any listing — WishDrop reviews it before it goes live.
            </p>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-ink/10 bg-card shadow-[0_1px_2px_rgba(32,36,43,0.04),0_20px_50px_-32px_rgba(32,36,43,0.35)]">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <Inbox size={22} className="text-ink/25" />
              <p className="text-sm font-semibold text-ink/70">No listings yet</p>
              <p className="max-w-xs text-xs text-ink/45">
                WishDrop will add your products here once your store is onboarded.
              </p>
            </div>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/seller/catalogue/${e.id}`)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') router.push(`/seller/catalogue/${e.id}`)
                }}
                className="flex cursor-pointer items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 outline-none transition-colors last:border-b-0 hover:bg-parchment/50 focus-visible:bg-teal/[0.08]"
              >
                <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-lg border border-dashed border-ink/15 bg-white">
                  {e.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.images[0]} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <BookOpen size={14} className="text-ink/20" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{e.title}</span>
                  {e.pendingChange ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-gold-deep">
                      <Clock size={11} />
                      Awaiting WishDrop review
                    </span>
                  ) : (
                    <span className="mt-0.5 text-xs text-ink/40">Cost: {e.currency} {e.costPrice.toLocaleString()}</span>
                  )}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[e.status]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[e.status]}`} />
                  {STATUS_LABEL[e.status]}
                </span>
                <ChevronRight size={16} className="flex-none text-ink/25" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}