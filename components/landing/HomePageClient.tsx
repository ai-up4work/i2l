// components/landing/HomePageClient.tsx
//
// The landing page UI. Moved out of app/page.tsx (which is now a server
// component) because a 'use client' page can't export metadata — the
// homepage had no canonical URL or page-level structured data as a result.
'use client'

import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from 'react'
import Image from 'next/image'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Star,
  LinkIcon,
} from 'lucide-react'
import AirmailStripe from '@/components/shared/AirmailStripe'
import { destinations } from '@/content/data'
import Testimonials from '@/components/landing/Testimonials'
import Header, {
  HEADER_BAR_HEIGHT_MOBILE,
  HEADER_BAR_HEIGHT_DESKTOP,
} from '@/components/shared/Header'
import Hero from '@/components/landing/Landing-Hero'
import HowItWorks from '@/components/landing/HowItWorks'
import Footer from '@/components/landing/Footer'
import StatsBand from '@/components/landing/StatsBand'
import Community from '@/components/landing/Community'
import Partners from '@/components/landing/Partners'
import WhyChooseWishdrop from '@/components/landing/WhyChooseWishdrop'
import DealCoupon, { dealToCoupon, type Deal } from '@/components/shared/DealCoupon'
// REAL, CONNECTED chat components — this page previously had its own
// dead local `ChatButton` function (see removed "CHAT BUTTON" section)
// that rendered a static button with no onClick and no useChat() at all.
// That's why clicking it did nothing: it wasn't the same component as
// the one wired to ChatContext.
import ChatButton from '@/components/shared/ChatButton'
import ChatPanel from '@/components/shared/ChatPanel'
// DashboardProvider/useDashboard + ItemInfoModal — the SAME flow
// /account's "Buy for me" form and AccountShell use (see
// contexts/DashboardContext.tsx and app/account/layout.tsx). Pasting a
// link here scrapes and prices the item with no auth required — only
// DashboardContext's confirmRequest (fired from inside the modal on
// "Confirm & send request") checks for a signed-in user, and it already
// surfaces that as an inline error in the modal rather than a redirect.
// This page sits outside app/account/**, so nothing about /account's
// route protection in middleware.ts is touched by this at all — that
// route stays exactly as gated as before.
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext'
import ItemInfoModal from '@/components/dashboard/ItemInfoModal'

/* ============================================================================
 * MOTION PRIMITIVE — scroll-triggered reveal, respects reduced motion.
 * ==========================================================================*/

function Reveal({
  children,
  className = '',
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: ElementType
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      } ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
    >
      {children}
    </Tag>
  )
}

/* ============================================================================
 * DESTINATIONS
 * ==========================================================================*/

function Flag({ code, className = '' }: { code: string; className?: string }) {
  return (
    <Image
      src={`https://flagcdn.com/${code.toLowerCase()}.svg`}
      alt={`${code} flag`}
      fill
      className={`object-cover ${className}`}
      unoptimized
    />
  )
}

function DestinationNavArrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onPrev}
        aria-label="Previous destination"
        className="grid h-9 w-9 place-items-center rounded-full border border-parchment/25 text-parchment transition-colors hover:border-gold hover:text-gold"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        onClick={onNext}
        aria-label="Next destination"
        className="grid h-9 w-9 place-items-center rounded-full border border-parchment/25 text-parchment transition-colors hover:border-gold hover:text-gold"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

function Destinations() {
  const [index, setIndex] = useState(0)

  const visible = [0, 1, 2].map((offset) => destinations[(index + offset) % destinations.length])

  function showPrevious() {
    setIndex((current) => (current - 1 + destinations.length) % destinations.length)
  }

  function showNext() {
    setIndex((current) => (current + 1) % destinations.length)
  }

  return (
    <section id="destinations" className="bg-indigo px-6 py-12 text-parchment lg:px-10 lg:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex justify-end lg:hidden">
          <DestinationNavArrows onPrev={showPrevious} onNext={showNext} />
        </div>

        <div className="flex flex-col gap-0 lg:flex-row lg:items-center">
          <div className="w-full shrink-0 lg:w-[300px] mt-16">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Popular destinations
            </p>
            <h2 className="mt-3 font-display text-3xl leading-tight text-parchment sm:text-4xl">
              Explore top shopping destinations
            </h2>
            <p className="mt-3 font-body text-sm leading-relaxed text-parchment/60">
              Shop from leading stores in the world&rsquo;s most popular countries.
            </p>
            <a
              href="/account"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 font-body text-sm font-semibold text-ink transition-colors hover:bg-gold-deep"
            >
              Explore all destinations
            </a>
          </div>

          <div className="min-w-0 flex-1 sm:mt-8">
            <div className="mb-4 hidden justify-end lg:flex">
              <DestinationNavArrows onPrev={showPrevious} onNext={showNext} />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {visible.map((destination, i) => {
                const isLive = destination.code.toUpperCase() === 'IN'
                const Wrapper = isLive ? 'a' : 'div'

                return (
                  <Wrapper
                    key={destination.code + destination.name}
                    // {...(isLive
                    //   ? { href: `/destinations/${destination.code.toLowerCase()}` }
                    //   : { 'aria-disabled': true })}
                    className={`group w-full overflow-hidden rounded-lg shadow-lg shadow-indigo-deep/30 transition-transform duration-300 ${
                      isLive ? 'hover:-translate-y-1' : 'cursor-default'
                    } ${i === 0 ? '' : 'hidden sm:block'}`}
                  >
                    <div className="relative aspect-[4/3.6] overflow-hidden rounded-t-full bg-indigo-deep">
                      <img
                        src={destination.img}
                        alt={destination.name}
                        className={`h-full w-full object-cover object-top transition-transform duration-500 ${
                          isLive ? 'group-hover:scale-105' : ''
                        }`}
                      />

                      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-parchment/40 bg-indigo-deep/40 backdrop-blur">
                        <Flag code={destination.code} />
                      </span>

                      {!isLive && (
                        <div className="absolute inset-0 flex items-center justify-center bg-indigo-deep/55 backdrop-blur-[1px]">
                          <span className="rounded-full border border-parchment/30 bg-indigo-deep/70 px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-[0.15em] text-parchment">
                            Coming Soon
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="relative bg-card px-5 py-4">
                      <span className={`absolute inset-y-0 left-0 w-1 ${isLive ? 'bg-gold' : 'bg-ink/15'}`} />
                      <div className="flex items-center justify-between gap-3 pl-2">
                        <p
                          className={`font-display text-base font-semibold uppercase tracking-wide ${
                            isLive ? 'text-ink' : 'text-ink/50'
                          }`}
                        >
                          {destination.name}
                        </p>
                        {isLive ? (
                          <span className="flex shrink-0 items-center gap-1 font-body text-xs font-semibold uppercase tracking-wide text-teal transition-colors group-hover:text-teal-deep">
                            {/* Shop
                            <ArrowUpRight
                              size={13}
                              className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            /> */}
                          </span>
                        ) : (
                          <span className="flex shrink-0 items-center font-body text-xs font-semibold uppercase tracking-wide text-ink/35">
                            Coming Soon
                          </span>
                        )}
                      </div>
                    </div>
                  </Wrapper>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================================================================
 * DEALS & CATEGORIES
 * ==========================================================================*/

const topDeals: Deal[] = [
  {
    brand: 'eBay',
    discount: '15%',
    label: 'Off',
    detail: 'On Select Items',
    bgColor: '#EAE8FB',
    productImage: '/deals/ebay-card-bg.png',
    accent: 'text-[#5B57F0]',
    href: '/deals/ebay',
    brandLogo: '/logos/ebay.png',
  },
  {
    brand: 'Amazon',
    discount: '$20',
    label: 'Off',
    detail: 'On $150+ Orders',
    bgColor: '#FBEEDC',
    productImage: '/deals/amazon-card-bg.png',
    accent: 'text-[#E0A429]',
    href: '/deals/amazon',
    brandLogo: '/logos/amazon.png',
  },
  {
    brand: 'ZARA',
    discount: '25%',
    label: 'Off',
    detail: 'Sitewide',
    bgColor: '#E4F3EA',
    productImage: '/deals/zara-card-bg.png',
    accent: 'text-[#2FA36B]',
    href: '/deals/zara',
    brandLogo: '/logos/zara.png',
  },
  {
    brand: 'Rakuten',
    discount: '10%',
    label: 'Off',
    detail: 'On Orders Over $80',
    bgColor: '#FBE9E9',
    productImage: '/deals/rakuten-card-bg.png',
    accent: 'text-[#E24C5A]',
    href: '/deals/rakuten',
    brandLogo: '/logos/rakuten.png',
  },
]

const shopCategories = [
  { name: 'Electronics', image: '/categories/electronics.png', href: '/stores?category=electronics' },
  { name: 'Fashion', image: '/categories/fashion.png', href: '/stores?category=fashion' },
  { name: 'Beauty', image: '/categories/beauty.png', href: '/stores?category=beauty' },
  { name: 'Home & Living', image: '/categories/home.png', href: '/stores?category=home' },
  { name: 'Sports', image: '/categories/sports.png', href: '/stores?category=sports' },
  { name: 'Toys & Games', image: '/categories/toys.png', href: '/stores?category=toys' },
  { name: 'Anime', image: '/categories/anime.png', href: '/stores?category=anime' },
  { name: 'Books', image: '/categories/books.png', href: '/stores?category=books' },
]

function ShopByCategory() {
  return (
    <section className="mx-auto max-w-9xl px-12 py-4 lg:px-20 bg-card">
      <Reveal className="mt-20">
        <p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.2em] text-gold">
          Shop by category
        </p>
        <h2 className="mt-2 font-display font-semibold text-3xl text-indigo sm:text-4xl">Find what you love</h2>
      </Reveal>

      <div className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-8 lg:gap-5">
        {shopCategories.map((category, index) => (
          <Reveal key={category.name} delay={index * 60}>
            <a href={category.href} className="group flex flex-col items-center gap-2.5 text-center">
              <span className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-ink/5 transition-colors duration-300 group-hover:bg-gold/10">
                <Image
                  src={category.image}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </span>
              <span className="font-body text-xs font-medium text-indigo sm:text-sm">{category.name}</span>
            </a>
          </Reveal>
        ))}
      </div>

      <div className="mt-10 mb-8 flex justify-center">
        <a
          href="/stores"
          className="rounded-xl border border-gold/75 px-6 py-3 font-body text-sm font-semibold text-ink transition-colors duration-300 hover:border-gold/40 hover:bg-indigo hover:text-parchment"
        >
          Explore all categories
        </a>
      </div>

      {/* <Reveal className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.2em] text-gold">
            Deals &amp; Promos
          </p>
          <h2 className="mt-2 font-display font-semibold text-3xl text-indigo sm:text-4xl">
            Save more with top deals
          </h2>
        </div>
        <a
          href="/deals"
          className="hidden rounded-xl border border-gold/75 px-6 py-3 font-body text-sm font-semibold text-ink transition-colors duration-300 hover:border-gold/40 hover:bg-indigo hover:text-parchment sm:inline-flex"
        >
          View all deals
        </a>
      </Reveal>

      <div className="mt-8 mb-16 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {topDeals.map((deal, index) => (
          <Reveal key={deal.brand} delay={index * 60}>
            <DealCoupon coupon={dealToCoupon(deal)} />
          </Reveal>
        ))}
      </div>

      <div className="mt-6 flex justify-center sm:hidden">
        <a
          href="/deals"
          className="rounded-xl border border-gold/75 px-6 py-3 font-body text-sm font-semibold text-ink transition-colors duration-300 hover:border-gold/40 hover:bg-indigo hover:text-parchment"
        >
          View all deals
        </a>
      </div> */}
    </section>
  )
}

/* ============================================================================
 * FINAL CTA
 * ==========================================================================*/
// Now backed by DashboardContext — pastedLink/setPastedLink/startItemInfo
// are the exact same state and function /account's "Buy for me" form uses
// (see components/dashboard/HomePage.tsx). Pasting a link here opens the
// same ItemInfoModal (mounted once at the <Home> level below), scrapes and
// prices the item, and lets the visitor review it — all without being
// signed in. Only actually confirming the request (inside the modal) needs
// auth, and DashboardContext.confirmRequest already handles that itself by
// returning an inline error rather than this component redirecting anyone
// to /auth/login or /account.
function FinalCTA() {
  const { pastedLink: link, setPastedLink: setLink, startItemInfo } = useDashboard()

  function handleSubmit(event: React.FormEvent) {
    if (!link.trim()) {
      event.preventDefault()
      return
    }
    // startItemInfo (DashboardContext) calls event.preventDefault() itself
    // and kicks off beginRequestForUrl(pastedLink), which opens the modal
    // and starts the scrape/lookup — identical to submitting the "Buy for
    // me" form on /account.
    void startItemInfo(event)
  }

  // Envelope look: the airmail stripe from the header wraps a white card,
  // so the page closes on the same postal motif it opens with. The form
  // matches the hero's quote form (same shape, same CTA wording).
  const steps = ['Paste the link', 'Get a price in LKR', 'Delivered home']

  return (
    <section className="px-6 py-20 lg:px-10 lg:py-24">
      <Reveal className="mx-auto max-w-[1600px]">
        <div
          className="rounded-[30px] p-[9px] shadow-[0_40px_80px_-40px_rgba(8,39,79,0.45)]"
          style={{
            background:
              'repeating-linear-gradient(45deg,#C1272D 0 10px,#FBF6EC 10px 20px,#1E3A5F 20px 30px,#FBF6EC 30px 40px)',
          }}
        >
          <div className="relative overflow-hidden rounded-[22px] bg-card px-6 py-12 sm:px-12 lg:px-20 lg:py-16">
            {/* Decoration: postmark + cancellation waves, top-right */}
            <svg
              aria-hidden="true"
              viewBox="0 0 260 130"
              className="pointer-events-none absolute -right-6 -top-4 hidden w-[300px] text-indigo/[0.12] sm:block"
              fill="none"
            >
              <defs>
                <path id="cta-pm" d="M190,62 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
              </defs>
              <circle cx="190" cy="62" r="48" stroke="currentColor" strokeWidth="2" />
              <circle cx="190" cy="62" r="28" stroke="currentColor" strokeWidth="1.5" />
              <text fill="currentColor" fontSize="9" fontWeight="700" letterSpacing="2.2">
                <textPath href="#cta-pm">WISHDROP · COLOMBO · AIR MAIL ·</textPath>
              </text>
              {[30, 46, 62, 78, 94].map((y) => (
                <path
                  key={y}
                  d={`M0 ${y} q 15 -8 30 0 t 30 0 t 30 0 t 30 0`}
                  stroke="currentColor"
                  strokeWidth="2"
                />
              ))}
            </svg>

            <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-16">
              <div className="max-w-xl">
                <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-deep">
                  Ready to shop anywhere?
                </p>
                <h2
                  className="mt-3 font-display font-semibold leading-[1.05] tracking-[-0.015em] text-indigo"
                  style={{ fontSize: 'clamp(2rem, 2.2vw + 1.1rem, 3rem)' }}
                >
                  Got a link?
                  <br />
                  We&apos;ll handle <span className="whitespace-nowrap text-teal">the rest.</span>
                </h2>
                <p className="mt-4 max-w-md font-body text-base leading-relaxed text-ink/65">
                  Paste a product from your favourite Indian store. We&apos;ll price it in rupees and
                  bring it to your door in Sri Lanka.
                </p>
              </div>

              <div>
                <form
                  onSubmit={handleSubmit}
                  className="flex w-full items-center gap-1 rounded-2xl border border-indigo/10 bg-parchment/60 p-1.5 pl-4 transition-[border-color,box-shadow] duration-200 focus-within:border-teal/40 focus-within:bg-card focus-within:shadow-[0_0_0_4px_rgba(14,140,156,0.12)]"
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

                {/* three-step recap, echoing How It Works */}
                <ol className="mt-5 grid gap-2.5 pl-1 sm:grid-cols-3 sm:gap-3">
                  {steps.map((step, i) => (
                    <li key={step} className="flex items-center gap-2 font-body text-xs font-medium leading-snug text-ink/60">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo text-[10px] font-bold text-parchment">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ============================================================================
 * ITEM INFO MODAL — mounted once at the page level so it can pop open
 * over ANY section of the landing page (currently only triggered from
 * FinalCTA's paste-link form, but not tied to that section specifically).
 * Reads/writes DashboardContext exactly the way AccountShell does in
 * app/account/layout.tsx — same props, same wiring, so this is the
 * literal same review-and-submit flow, not a lookalike.
 * ==========================================================================*/
function HomeItemModal() {
  const {
    draft,
    setDraft,
    modalOpen,
    closeModal,
    confirmRequest,
    lookupLoading,
    scrapeResult,
    selectVariant,
  } = useDashboard()

  // FIX: this used to be `if (!modalOpen) return null`, which unmounted
  // ItemInfoModal from the tree the INSTANT modalOpen went false —
  // before its own internal close transition (mounted/entered state,
  // see that file) ever got a chance to play. That same bug was already
  // found and fixed in app/account/layout.tsx's AccountShell (see its
  // own identical comment) but never ported over here — this page has
  // its own separate copy of the same modal-mounting logic, so the fix
  // had to be applied twice. The modal now stays mounted at all times
  // and manages its own presence via the `open` prop internally,
  // unmounting itself only after its exit animation finishes.
  // ItemInfoModal positions its floating close button below the header
  // using --account-header-h-mobile / --account-header-h-desktop. Only
  // app/account/layout.tsx used to set them, so on this page they fell
  // back to 0px and the button sat underneath the fixed header (hidden).
  // Set them here too, with the same values the account layout uses.
  // `display: contents` keeps this wrapper out of layout entirely.
  return (
    <div
      className="contents"
      style={{
        ['--account-header-h-mobile' as string]: `${HEADER_BAR_HEIGHT_MOBILE}px`,
        ['--account-header-h-desktop' as string]: `${HEADER_BAR_HEIGHT_DESKTOP}px`,
      }}
    >
      <ItemInfoModal
        open={modalOpen}
        result={scrapeResult}
        qty={draft.qty}
        onQtyChange={(qty) => setDraft({ ...draft, qty })}
        onClose={closeModal}
        onSubmitRequest={confirmRequest}
        estimatedPriceLKR={draft.estimatedPriceLKR ?? null}
        loading={lookupLoading}
        onSelectVariant={(url) => {
          if (url) selectVariant(url)
        }}
      />
    </div>
  )
}

/* ============================================================================
 * PAGE
 * ==========================================================================*/
// NOTE: the local `ChatButton` function that used to live here (a static,
// unconnected button under a "CHAT BUTTON" comment) has been removed —
// it's replaced below by the real ChatButton/ChatPanel pair imported at
// the top, which are wired to ChatContext.
//
// This page renders its own <Header /> and <Footer /> rather than relying
// on app/(public)/layout.tsx, meaning it sits OUTSIDE that layout's tree.
// It used to also wrap its own <ChatProvider> here on the theory that
// (public)/layout.tsx's provider therefore never reaches it — but
// app/layout.tsx (the actual Next.js root layout, which wraps every page
// in the app with no exceptions, route groups included) has its own
// ChatProvider too, and that one DOES reach this page regardless of
// which route group it does or doesn't sit inside. The nested copy here
// was invisible-but-real waste, same issue (public)/layout.tsx and
// account/layout.tsx both had for the same reason — see their own
// comments. ChatButton/ChatPanel below just need SOME ChatProvider
// ancestor, which the root now guarantees.
//
// DashboardProvider is still mounted here, for a genuinely different
// reason: unlike ChatProvider, DashboardProvider has no root-level
// instance — only app/account/layout.tsx supplies one, scoped
// deliberately to account routes, and this page sits outside app/account/**
// too. FinalCTA and HomeItemModal both call useDashboard(), so this page
// still needs its own instance.
export default function HomePageClient() {
  return (
    <DashboardProvider>
      <main className="bg-parchment">
          <style>{`
            @keyframes float-slow {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-10px); }
            }
            @keyframes fade-slide-in {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes pulse-ring {
              0% { box-shadow: 0 0 0 0 rgba(193, 39, 45, 0.45); }
              70% { box-shadow: 0 0 0 14px rgba(193, 39, 45, 0); }
              100% { box-shadow: 0 0 0 0 rgba(193, 39, 45, 0); }
            }
            .animate-float-slow { animation: float-slow 6s ease-in-out infinite; }
            .animate-fade-slide-in { animation: fade-slide-in 0.45s ease-out both; }
            .animate-pulse-ring { animation: pulse-ring 2.6s ease-out infinite; }
            @media (prefers-reduced-motion: reduce) {
              .animate-float-slow, .animate-fade-slide-in, .animate-pulse-ring {
                animation: none !important;
              }
            }
          `}</style>

          <Header />

          <Hero />
          {/* <Partners /> */}
          <ShopByCategory />
          <WhyChooseWishdrop />
          <StatsBand />
          <HowItWorks />
          <Destinations />
          <Community />
          <Testimonials />
          <FinalCTA />
          <Footer />
          <ChatButton />
          <ChatPanel />
          <HomeItemModal />
        </main>
    </DashboardProvider>
  )
}