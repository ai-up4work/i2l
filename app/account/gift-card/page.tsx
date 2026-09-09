// app/account/gift-card/page.tsx
'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Info, ShieldCheck, Gift } from 'lucide-react'
import { useLoyalty, type GiftCardProduct } from '@/contexts/Loyaltycontext'

function formatCurrency(value: number, currency: string): string {
  return `${value.toFixed(2)}${currency}`
}

function GiftCardTile({ product }: { product: GiftCardProduct }) {
  return (
    <div className="w-56 flex-none">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-ink/5">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-ink/30">
            {product.name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="mt-3 font-body text-sm text-ink/80">
        Value: {formatCurrency(product.value, product.currency)}
      </div>
      <div className="font-body text-sm font-bold text-rose-600">
        Price: {formatCurrency(product.price, product.currency)}
      </div>
    </div>
  )
}

function GiftCardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <div className="h-56 animate-pulse rounded-2xl bg-ink/5" />
      <div className="mt-8 h-64 animate-pulse rounded-2xl bg-ink/5" />
    </div>
  )
}

export default function GiftCardPage() {
  const loyalty = useLoyalty()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [redeemOpen, setRedeemOpen] = useState(false)
  const [code, setCode] = useState('')
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  const scrollBy = (delta: number) => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  const handleRedeem = () => {
    const amount = loyalty.redeemGiftCard(code)
    if (amount > 0) {
      setFeedback({ ok: true, message: `€${amount.toFixed(2)} added to your wallet.` })
      setCode('')
    } else {
      setFeedback({ ok: false, message: 'That code doesn\u2019t look right — check it and try again.' })
    }
  }

  if (!loyalty.hydrated) {
    return <GiftCardSkeleton />
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 p-8 sm:p-10">
        <div
          className="pointer-events-none absolute inset-0 select-none font-display text-[10rem] font-black leading-none text-white/10"
          aria-hidden="true"
        >
          GIFT
        </div>

        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-white">Gift Card</h1>
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-center gap-2 font-body text-white/90">
                <ShieldCheck className="h-5 w-5" />
                Secure Payments
              </div>
              <div className="flex items-center gap-2 font-body text-white/90">
                <Gift className="h-5 w-5" />
                Flexible Use
              </div>
            </div>
          </div>

          <div className="w-full max-w-md rounded-xl bg-gradient-to-br from-white to-rose-50 p-6 shadow-lift lg:w-96">
            <div className="flex items-center gap-1.5 font-body text-sm text-ink/70">
              Total Balance
              <Info className="h-3.5 w-3.5 text-ink/40" />
            </div>

            <div className="mt-2 flex items-center gap-2 font-display text-3xl font-bold text-ink">
              €{loyalty.credits.toFixed(2)}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setRedeemOpen((v) => !v)}
                className="flex items-center gap-1 font-body text-sm text-ink/60 transition-colors hover:text-ink"
              >
                {redeemOpen ? 'Hide' : 'Check Balance'}
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${redeemOpen ? 'rotate-90' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setRedeemOpen(true)}
                className="flex items-center gap-1 rounded-full bg-rose-600 px-5 py-2.5 font-body text-sm font-bold text-white transition-colors hover:bg-rose-700"
              >
                Redeem Card
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {redeemOpen && (
              <div className="mt-4 border-t border-ink/10 pt-4">
                <label htmlFor="gift-card-code" className="font-body text-xs font-semibold text-ink/60">
                  Gift card code
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="gift-card-code"
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value)
                      setFeedback(null)
                    }}
                    placeholder="e.g. WD7X9K2M"
                    className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 font-body text-sm text-ink"
                  />
                  <button
                    type="button"
                    onClick={handleRedeem}
                    disabled={code.trim().length === 0}
                    className="flex-none rounded-lg bg-ink px-4 py-2 font-body text-sm font-bold text-parchment transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Redeem
                  </button>
                </div>
                {feedback && (
                  <p className={`mt-2 font-body text-xs ${feedback.ok ? 'text-teal-deep' : 'text-rose-600'}`}>
                    {feedback.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Best Sellers */}
      <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="font-body text-lg font-bold text-ink">Best Sellers</h2>

        <div className="relative mt-4">
          <button
            type="button"
            onClick={() => scrollBy(-240)}
            aria-label="Scroll left"
            className="absolute -left-4 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-ink/10 bg-white shadow-sm transition-colors hover:bg-ink/5 sm:flex"
          >
            <ChevronLeft className="h-4 w-4 text-ink/60" />
          </button>

          <div
            ref={scrollerRef}
            className="scrollbar-none flex gap-6 overflow-x-auto scroll-smooth pb-2"
          >
            {loyalty.giftCardCatalog.map((product) => (
              <GiftCardTile key={product.id} product={product} />
            ))}
          </div>

          <button
            type="button"
            onClick={() => scrollBy(240)}
            aria-label="Scroll right"
            className="absolute -right-4 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-ink/10 bg-white shadow-sm transition-colors hover:bg-ink/5 sm:flex"
          >
            <ChevronRight className="h-4 w-4 text-ink/60" />
          </button>
        </div>
      </div>
    </div>
  )
}