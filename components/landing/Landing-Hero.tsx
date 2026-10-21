'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, Calculator, Check, Link as LinkIcon } from 'lucide-react'
import { useAffiliatedStores } from '@/hooks/useAffiliatedStores'
import PriceEstimatorDialog from '@/components/shared/PriceEstimatorDialog'
import { OUTER_H } from '@/components/shared/headerMetrics'
import { AIRMAIL_STRIPE_HEIGHT } from '@/components/shared/AirmailStripe'
// Same flow FinalCTA and /account's "Buy for me" form use — see
// contexts/DashboardContext.tsx. Pasting a link here scrapes and prices
// the item via the shared ItemInfoModal (mounted once at the page level).
// Only confirming the request inside that modal needs auth.
import { useDashboard } from '@/contexts/DashboardContext'

/* ============================================================================
 * HERO
 *
 * Design notes
 * - One headline colour (indigo) with a single teal accent. Gold is kept for
 *   highlights only (the headline underline), per the
 *   palette rules in app/globals.css.
 * - The right-hand illustration comes from the background image
 *   (/hero-demo.png); the copy column stays on the left.
 * - Everything uses tokens from @theme (ink / parchment / card / teal /
 *   gold / indigo). No arbitrary hex values except the airmail stripe,
 *   which matches components/shared/AirmailStripe.tsx.
 * ==========================================================================*/

// Avatars visible in the store row: 4 on mobile, 5 from sm up.
const VISIBLE_COUNT = 5
const ROTATE_MS = 6000

// Clears the fixed header (tallest part of the notch + airmail stripe).
const HEADER_CLEARANCE = OUTER_H + AIRMAIL_STRIPE_HEIGHT

const AIRMAIL_STRIPE =
  'repeating-linear-gradient(45deg,#C1272D 0 10px,#FBF6EC 10px 20px,#1E3A5F 20px 30px,#FBF6EC 30px 40px)'

// Advances through `localStores` VISIBLE_COUNT at a time, wrapping around.
// Returns a static slice when there aren't enough stores to rotate. Runs
// client-side after mount, so first paint matches the server.
function useStoreCarousel(localStores: ReturnType<typeof useAffiliatedStores>['stores']) {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    if (localStores.length <= VISIBLE_COUNT) return
    const id = window.setInterval(() => {
      setOffset((o) => (o + VISIBLE_COUNT) % localStores.length)
    }, ROTATE_MS)
    return () => window.clearInterval(id)
  }, [localStores])

  const count = Math.min(VISIBLE_COUNT, localStores.length)
  return Array.from({ length: count }, (_, i) => localStores[(offset + i) % localStores.length])
}

// Staggered entrance. `motion-safe:` keeps it off for reduced-motion users.
function rise(delay: number): { className: string; style: CSSProperties } {
  return {
    className: 'motion-safe:animate-[fadeUp_700ms_cubic-bezier(0.22,1,0.36,1)_both]',
    style: { animationDelay: `${delay}ms` },
  }
}

// Kept short so all three fit on one line beside the link box on desktop.
const PROMISES = ['Instant LKR price', 'No sign-up needed to check', 'Quality checked products']

export default function Hero() {
  const router = useRouter()
  const { pastedLink: link, setPastedLink: setLink, startItemInfo } = useDashboard()
  const { stores } = useAffiliatedStores()
  const localStores = stores.filter((store) => store.storeType === 'local')
  const visibleStores = useStoreCarousel(localStores)
  const hiddenCount = Math.max(0, localStores.length - visibleStores.length)

  function handleSubmit(event: React.FormEvent) {
    if (!link.trim()) {
      event.preventDefault()
      return
    }
    // startItemInfo (DashboardContext) calls event.preventDefault() itself.
    void startItemInfo(event)
  }

  return (
    <section
      className="relative isolate overflow-hidden bg-parchment lg:min-h-[100svh]"
      style={{ paddingTop: HEADER_CLEARANCE }}
    >
      <style jsx>{`
        @keyframes avatarPop {
          from {
            opacity: 0;
            transform: scale(0.85);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .avatarPop {
          animation: avatarPop 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .avatarPop {
            animation: none;
          }
        }
      `}</style>

      {/* ── Background artwork ───────────────────────────────────────
          The original /hero-demo.png carries the right-hand illustration.
          A parchment wash sits over it: strong on mobile (where the copy
          overlaps the artwork) and only on the left edge from lg up, so
          the illustration stays fully visible beside the text. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <Image
          src="/hero-demo.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-parchment/80 lg:bg-transparent lg:bg-gradient-to-r lg:from-parchment/85 lg:via-parchment/30 lg:to-transparent" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 pb-16 pt-10 sm:pt-14 lg:min-h-[calc(100svh-74px)] lg:px-4 lg:pb-20 lg:pt-6">
        {/* ── Copy + quote form ────────────────────────────────────────── */}
        <div className="max-w-xl">
          <p
            {...rise(0)}
            className={`${rise(0).className} inline-flex items-center gap-2.5 rounded-full border border-indigo/10 bg-card/70 py-1 pl-1 pr-3.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo/75 backdrop-blur-sm`}
          >
            <span
              aria-hidden="true"
              className="h-5 w-7 rounded-full"
              style={{ background: AIRMAIL_STRIPE }}
            />
            Shop India · Delivered to Sri Lanka
          </p>

          <h1
            {...rise(80)}
            className={`${rise(80).className} mt-6 font-display font-semibold leading-[1.02] tracking-[-0.02em] text-indigo`}
            style={{ ...rise(80).style, fontSize: 'clamp(2.6rem, 3.6vw + 1.1rem, 4.4rem)' }}
          >
            Wish it.
            <br />
            We&apos;ll{' '}
            <span className="relative inline-block whitespace-nowrap text-teal">
              drop it
              {/* hand-drawn gold underline — the only gold in the headline */}
              <svg
                aria-hidden="true"
                viewBox="0 0 200 14"
                preserveAspectRatio="none"
                className="absolute -bottom-1.5 left-0 h-[0.22em] w-full text-gold"
              >
                <path
                  d="M3 9.5C42 3.5 98 2 197 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <br />
            at your door.
          </h1>

          <p
            {...rise(160)}
            className={`${rise(160).className} mt-6 max-w-md font-body text-base leading-relaxed text-ink/65 sm:text-lg`}
          >
            Paste a link from your favourite Indian store. We&apos;ll price it in rupees, buy it, check it, ship it
            and hand it to you.
          </p>

          <form
            onSubmit={handleSubmit}
            {...rise(240)}
            className={`${rise(240).className} mt-9 flex w-full items-center gap-1 rounded-2xl border border-indigo/10 bg-card p-1.5 pl-4 shadow-[0_24px_50px_-28px_rgba(8,39,79,0.45)] transition-[border-color,box-shadow] duration-200 focus-within:border-teal/40 focus-within:shadow-[0_0_0_4px_rgba(14,140,156,0.12),0_24px_50px_-28px_rgba(8,39,79,0.45)]`}
          >
            <LinkIcon size={17} className="shrink-0 text-indigo/35" aria-hidden="true" />
            <input
              aria-label="Product link"
              type="url"
              inputMode="url"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Paste a product link…"
              className="h-11 w-full min-w-0 bg-transparent px-3 font-body text-[15px] text-ink outline-none placeholder:text-ink/40"
            />
            <button
              type="submit"
              disabled={!link.trim()}
              aria-label="Get my quote"
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal px-3.5 font-body text-sm font-semibold text-parchment transition-all duration-200 hover:bg-teal-deep active:scale-[0.97] disabled:cursor-default disabled:opacity-75 disabled:active:scale-100 sm:px-5"
            >
              <span className="hidden sm:inline">Get my quote</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>

          <ul
            {...rise(300)}
            className={`${rise(300).className} mt-4 flex flex-wrap gap-x-5 gap-y-2 pl-1`}
          >
            {PROMISES.map((item) => (
              <li
                key={item}
                className="flex items-center gap-1.5 whitespace-nowrap font-body text-xs font-medium text-ink/60"
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-teal/12 text-teal-deep">
                  <Check size={10} strokeWidth={3} aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>

          {/* No link yet? A rough price from the rupee price + weight.
              A real second option (card), not a footnote link — new
              visitors often know an item's rupee price before they have
              its link. Kept quieter than the link box above. */}
          <div {...rise(340)} className={`${rise(340).className} mt-8`}>
            <PriceEstimatorDialog
              triggerClassName="group flex w-full items-center gap-3.5 rounded-2xl border border-gold/35 bg-gold/[0.07] px-4 py-3 text-left transition-colors duration-200 hover:border-gold/60 hover:bg-gold/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
              trigger={
                <>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-deep">
                    <Calculator size={19} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-body text-sm font-semibold text-indigo">
                      No link yet? Estimate from the rupee price
                    </span>
                    <span className="block font-body text-xs text-ink/55">
                      Type the price and weight to see a rough total in LKR.
                    </span>
                  </span>
                  <ArrowRight
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-gold-deep transition-transform duration-200 group-hover:translate-x-1"
                  />
                </>
              }
            />
          </div>

          {/* Secondary path: browse partner stores. Leads with real logos as
              a trust signal; rotates through the local-store pool. */}
          {visibleStores.length > 0 && (
            <div
              {...rise(380)}
              className={`${rise(380).className} mt-10 flex items-center gap-4 border-t border-indigo/10 pt-6`}
            >
              <span className="flex -space-x-2.5">
                {visibleStores.map((store, i) => (
                  <span
                    key={`${store.platform}-${i}`}
                    className={`avatarPop relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-card ring-2 ring-parchment ${
                      i >= 4 ? 'hidden sm:block' : ''
                    }`}
                    style={{ animationDelay: `${i * 60}ms`, zIndex: 10 - i }}
                  >
                    <Image
                      src={store.logo}
                      alt={store.name}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </span>
                ))}
                {hiddenCount > 0 && (
                  <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo font-body text-[11px] font-bold text-parchment ring-2 ring-parchment">
                    +{hiddenCount}
                  </span>
                )}
              </span>

              <div className="min-w-0">
                <p className="font-body text-xs text-ink/55">Or shop our partner stores</p>
                <button
                  type="button"
                  onClick={() => router.push('/stores')}
                  className="group mt-0.5 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-teal-deep"
                >
                  Browse {localStores.length} affiliated stores
                  <ArrowRight
                    size={14}
                    aria-hidden="true"
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}