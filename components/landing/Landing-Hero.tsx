'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, Check, Link } from 'lucide-react'
import { OPEN_SHOP_EVENT } from '@/components/shared/Header'
import { affiliatedStores } from '@/data/stores/data'

// Featured store logos for the hero's "Browse Stores" row — pulled from
// the same affiliatedStores array the /stores pages use, so this never
// drifts out of sync with the real store list. Marketplaces lead here
// since they're the most globally recognizable names for a first-time
// visitor; local sellers get their moment on the /stores browse page.
//
// Pulls up to 6 now (was 4) — mobile only shows the first 4 (see the
// `hidden lg:block` on avatars past index 2 below), laptop and up shows
// all 6. Slicing here rather than conditionally in JS keeps this
// CSS-driven: no resize-triggered re-render, no hydration mismatch
// between server and client guessing the viewport size.
const featuredStores = affiliatedStores.filter((store) => store.storeType === 'local').slice(0, 6)

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

  // Browse Stores is now a first-class secondary CTA on every breakpoint,
  // not just a mobile fallback for a hidden nav entry. It reuses Header's
  // own ShopBottomSheet instance via OPEN_SHOP_EVENT instead of wiring up
  // new state, the same as before.
  function handleBrowseStores() {
    window.dispatchEvent(new Event(OPEN_SHOP_EVENT))
  }

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

          {/* Browse Stores: a permanent secondary path on every breakpoint,
              sitting where the feature row used to live. Leads with actual
              store logos as a quick trust signal ("real stores, not just a
              form") before the "browse more" link, rather than a plain
              button or a generic feature-icon row.

              Avatar count is responsive: 4 on mobile (index 0–3 always
              visible), all 6 from the lg breakpoint up — the 5th–6th
              avatars carry `hidden lg:block` so they simply don't render
              below that width rather than shrinking to fit. */}
          <button
            type="button"
            onClick={handleBrowseStores}
            className="group -mx-3 mt-16 inline-flex items-center gap-3 rounded-full bg-parchment/85 px-3 py-2 text-left shadow-sm backdrop-blur-sm transition-colors duration-200 hover:bg-parchment"
          >
            <span className="flex -space-x-2.5">
              {featuredStores.map((store, i) => (
                <span
                  key={store.platform}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-parchment bg-card shadow-sm ${
                    i >= 4 ? 'hidden lg:block' : ''
                  }`}
                >
                  <Image src={store.logo} alt={store.name} fill className="object-contain" />
                </span>
              ))}
            </span>

            <span className="flex flex-col leading-tight">
              <span className="font-body text-sm font-semibold text-teal-deep">Browse top stores</span>
            </span>

            <ArrowRight
              size={14}
              className="ml-1 shrink-0 text-teal-deep transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </button>
        </div>
      </div>
    </section>
  )
}