// app/account/gift-card/page.tsx
'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight, Info, ShieldCheck, Gift } from 'lucide-react'

type GiftCardProduct = {
  id: string
  name: string
  image: string
  value: string
  price: string
}

// TODO: replace with real catalog data once wired to a data source.
const BEST_SELLERS: GiftCardProduct[] = [
  { id: 'gc-1', name: 'SHEIN Classic', image: '', value: '100.00€', price: '93.00€' },
  { id: 'gc-2', name: "You're Amazing", image: '', value: '100.00€', price: '93.00€' },
  { id: 'gc-3', name: 'SHEIN Floral', image: '', value: '100.00€', price: '93.00€' },
  { id: 'gc-4', name: 'Best Wishes', image: '', value: '100.00€', price: '93.00€' },
  { id: 'gc-5', name: 'Thank You', image: '', value: '100.00€', price: '93.00€' },
]

function GiftCardTile({ product }: { product: GiftCardProduct }) {
  return (
    <div className="w-56 flex-none">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-ink/5">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-ink/30">
            SHEIN
          </div>
        )}
      </div>
      <div className="mt-3 font-body text-sm text-ink/80">Value: {product.value}</div>
      <div className="font-body text-sm font-bold text-rose-600">Price: {product.price}</div>
    </div>
  )
}

export default function GiftCardPage() {
  const scrollerRef = useRef<HTMLDivElement>(null)

  const scrollBy = (delta: number) => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  // TODO: replace with real balance once wired to a data source.
  const totalBalance = '0.00€'

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 p-8 sm:p-10">
        <div
          className="pointer-events-none absolute inset-0 select-none font-display text-[10rem] font-black leading-none text-white/10"
          aria-hidden="true"
        >
          SHEIN
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

            <button
              type="button"
              className="mt-2 flex items-center gap-2 font-display text-3xl font-bold text-ink transition-opacity hover:opacity-70"
            >
              {totalBalance}
              <ChevronRight className="h-5 w-5 text-ink/40" />
            </button>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                className="flex items-center gap-1 font-body text-sm text-ink/60 transition-colors hover:text-ink"
              >
                Check Balance
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                className="flex items-center gap-1 rounded-full bg-rose-600 px-5 py-2.5 font-body text-sm font-bold text-white transition-colors hover:bg-rose-700"
              >
                Link Card
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
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
            {BEST_SELLERS.map((product) => (
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