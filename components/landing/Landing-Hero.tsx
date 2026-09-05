'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, Check, Link } from 'lucide-react'
import { affiliatedStores } from '@/data/stores/data'

// Marketplaces lead here since they're the most globally recognizable
// names for a first-time visitor.
const featuredStores = affiliatedStores.filter((store) => store.storeType === 'marketplace')

function WaveMark() {
  // Small decorative squiggle next to the section label — no meaning
  // beyond decoration, matching the reference design.
  return (
    <svg width="18" height="14" viewBox="0 0 20 16" fill="none" aria-hidden="true" className="shrink-0 text-ink/25">
      <path d="M1 3.5c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M1 8c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M1 12.5c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/* ============================================================================
 * HERO
 * ==========================================================================*/

export default function Hero() {
  const router = useRouter()
  const [link, setLink] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = link.trim()
    if (!trimmed || submitted) return

    setSubmitted(true)

    window.setTimeout(() => {
      router.push(`/account?link=${encodeURIComponent(trimmed)}`)
    }, 500)
  }

  // Note: the previous inline text-link CTA opened Header's ShopBottomSheet
  // via OPEN_SHOP_EVENT. The box design below links straight to /stores
  // and /stores/[platform] instead, since "View all stores" and individual
  // logos read more naturally as real navigation than a sheet trigger.

  return (
    <section className="relative overflow-hidden bg-parchment" style={{ height: `calc(100dvh)` }}>
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/hero-demo.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>

      <div className="relative z-10 mx-auto flex h-full mt-12 max-w-7xl flex-col justify-center px-6 lg:px-10">
        <div className="max-w-xl">
          <p className="font-body text-xs font-extrabold uppercase tracking-[0.2em] text-gold">
            Shop global. We deliver.
          </p>

          <h1
            className="mt-4 font-display leading-[1.02] tracking-tight"
            style={{ fontSize: 'clamp(2.5rem, 4.5vw + 0.75rem, 3.75rem)' }}
          >
            <span className="text-teal">Wish it. </span>
            <span className="text-gold">We&apos;ll drop it</span>
            <br />
            <span className="text-indigo">right at your door.</span>
          </h1>

          <p className="mt-5 font-semibold max-w-sm font-body text-sm leading-relaxed text-ink/70 sm:text-base">
            Shop from your favorite global stores and get it delivered safely to Sri Lanka.
          </p>

          <form
            onSubmit={handleSubmit}
            className="relative mt-16 flex w-full max-w-xl items-center gap-1 rounded-2xl border border-black/5 bg-card py-1.5 pl-5 pr-1.5 shadow-lift"
          >
            <Link size={16} className="shrink-0 text-ink/35" aria-hidden="true" />
            <input
              aria-label="Product link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Paste product link (e.g. Amazon, eBay, etc.)"
              disabled={submitted}
              className="w-full min-w-0 bg-transparent px-3 font-body text-sm text-ink outline-none placeholder:text-ink/40 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={submitted || !link.trim()}
              className="flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-teal px-6 py-3 font-body text-sm font-semibold text-parchment transition-all duration-200 hover:bg-indigo active:scale-95 disabled:cursor-default disabled:opacity-60 disabled:active:scale-100"
            >
              {submitted ? (
                <>
                  Sent <Check size={15} />
                </>
              ) : (
                <>
                  Get Quote <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Browse Stores: the bordered "box" design from the reference,
              scaled down to fit the hero's max-w-xl column instead of
              running full page width. Header row (label + "View all
              stores") on top, a divided row of real store logos below. */}
          <div className="mt-8 max-w-xl overflow-hidden rounded-2xl border border-black/5 bg-card/80 shadow-lift backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <WaveMark />
                <span className="font-body text-xs font-semibold text-ink sm:text-sm">Our Affiliate Stores</span>
              </div>

              <a
                href="/stores"
                className="group inline-flex shrink-0 items-center gap-1 font-body text-xs font-semibold text-teal-deep transition-colors hover:text-indigo-deep sm:text-sm"
              >
                View all
                <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
            </div>

            <div className="flex divide-x divide-ink/10 border-t border-black/5">
              {featuredStores.map((store) => (
                <a
                  key={store.platform}
                  href={`/stores/${store.platform}`}
                  className="flex flex-1 items-center justify-center px-2 py-4 transition-colors duration-200 hover:bg-ink/[0.03] sm:px-4"
                >
                  <Image
                    src={store.logo}
                    alt={store.name}
                    width={90}
                    height={26}
                    className="h-4 w-auto object-contain opacity-80 grayscale transition-all duration-200 hover:opacity-100 hover:grayscale-0 sm:h-5"
                  />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}