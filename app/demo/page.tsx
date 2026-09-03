'use client'

import { useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Globe,
  Heart,
  MessageCircle,
  Package,
  Plane,
  Search,
  Shirt,
  Smartphone,
  Sparkles,
  Home as HomeIcon,
  Star,
  Zap,
} from 'lucide-react'
import AirmailStripe from '@/components/shared/AirmailStripe'
import {
  community,
  destinations,
  footerColumns,
  footerSocialLinks,
  guides,
  navLinks,
  partners,
  promoCodes,
  promoStripItems,
  statsBandItems,
  steps,
  testimonials,
  topChoices,
  type LandingPromoCode,
} from '@/content/data';
import Header from '@/components/landing/Header'
import Hero from '@/components/landing/Hero'
import TopChoices from '@/components/landing/TopChoices'
import Destinations from '@/components/landing/Destinations'
import Partners from '@/components/landing/Partners'
import HowItWorks from '@/components/landing/HowItWorks'
import LinkOnlyCTA from '@/components/landing/Linkonlycta'
import Testimonials from '@/components/landing/Testimonials'
import Footer from '@/components/landing/Footer'
import StatsBand from '@/components/landing/StatsBand'
import Community from '@/components/landing/Community'

/* ============================================================================
 * MOTION PRIMITIVE — scroll-triggered reveal, respects reduced motion.
 * Purely presentational: wraps existing content, never alters it.
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

/* A short dashed line that visibly "travels" — the flight-path / customs-route
   motif already used across the page, now given a bit of life. */
function RouteLine({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`bg-[length:22px_2px] bg-[linear-gradient(to_right,currentColor_50%,transparent_50%)] bg-repeat-x animate-route-flow motion-reduce:animate-none ${className}`}
    />
  )
}

/* ============================================================================
 * SMALL SHARED PIECES (inlined — previously separate shared components)
 * ==========================================================================*/

function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-sm font-bold text-paper transition-transform duration-300 group-hover:rotate-[8deg]">
        IL
      </span>
      <span>
        India<span className="text-rust">2</span>Lanka
      </span>
    </span>
  )
}

function PromoCodeCard({ tag, discount, title, code, expiresOn }: LandingPromoCode) {
  return (
    <div className="group flex flex-col justify-between rounded-2xl border border-dashed border-ink/20 bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-ink/40 hover:shadow-lift">
      <div>
        <span className="font-mono text-[11px] uppercase tracking-widest text-rust">{tag}</span>
        <p className="mt-2 font-display text-2xl text-ink">{discount}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/70">{title}</p>
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-dashed border-ink/20 pt-4">
        <span className="rounded-lg bg-ink/5 px-3 py-1.5 font-mono text-xs font-semibold text-ink transition-colors duration-300 group-hover:bg-ink group-hover:text-paper">
          {code}
        </span>
        <span className="text-[11px] text-muted">Expires {expiresOn}</span>
      </div>
    </div>
  )
}


/* ============================================================================
 * CALC CARD (used inside Hero)
 * Kept as a general shipping-cost estimator — still relevant since every
 * proxy-bought item still needs to ship to Sri Lanka.
 * ==========================================================================*/

const RATE_PER_KG = 1450
const BASE_FEE = 900
const MIN_WEIGHT = 0.5
const MAX_WEIGHT = 20

const SPEED_OPTIONS = [
  { id: 'standard' as const, label: 'Standard', eta: '10–14 days', icon: Package, multiplier: 1 },
  { id: 'express' as const, label: 'Express', eta: '3–5 days', icon: Zap, multiplier: 1.6 },
]

function CalcCard() {
  const [weight, setWeight] = useState(1)
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]['id']>('standard')

  const activeOption = SPEED_OPTIONS.find((o) => o.id === speed)!
  const estimate = Math.round((BASE_FEE + weight * RATE_PER_KG) * activeOption.multiplier)
  const pct = useMemo(() => ((weight - MIN_WEIGHT) / (MAX_WEIGHT - MIN_WEIGHT)) * 100, [weight])

  return (
    <div className="rounded-[1.75rem] border border-ink/10 bg-card shadow-lift transition-shadow duration-300 hover:shadow-xl">
      <div className="px-6 pt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-rust">Quick estimate</p>
        <h2 className="mt-2 font-display text-xl text-ink">What will delivery cost?</h2>

        <label htmlFor="weight" className="mt-6 block">
          <span className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted">
            <span>Estimated item weight</span>
            <span className="font-display text-base normal-case tracking-normal text-ink">{weight} kg</span>
          </span>

          <div className="relative mt-4 pb-2">
            <input
              id="weight"
              type="range"
              min={MIN_WEIGHT}
              max={MAX_WEIGHT}
              step={0.5}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="peer absolute inset-x-0 top-1/2 z-10 h-6 w-full -translate-y-1/2 cursor-pointer opacity-0"
            />
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-rust transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rust bg-paper shadow-sm transition-[left] duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-rust peer-focus-visible:ring-offset-2 motion-reduce:transition-none"
              style={{ left: `${pct}%` }}
              aria-hidden="true"
            />
          </div>
        </label>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {SPEED_OPTIONS.map(({ id, label, eta, icon: Icon }) => {
            const active = speed === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSpeed(id)}
                aria-pressed={active}
                className={`flex flex-col items-start gap-1 rounded-xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust ${
                  active ? 'border-ink bg-ink text-paper' : 'border-ink/15 text-ink/70 hover:border-ink/40'
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <Icon size={13} aria-hidden="true" />
                  {label}
                </span>
                <span className={active ? 'text-[11px] text-paper/70' : 'text-[11px] text-muted'}>{eta}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative mt-6 border-t border-dashed border-ink/20">
        <span className="absolute -left-2.5 top-0 h-5 w-5 -translate-y-1/2 rounded-full bg-paper" aria-hidden="true" />
        <span className="absolute -right-2.5 top-0 h-5 w-5 -translate-y-1/2 rounded-full bg-paper" aria-hidden="true" />

        <div className="px-6 py-5">
          <p className="text-xs uppercase tracking-wide text-muted">Estimated cost</p>
          <p key={estimate} className="mt-0.5 font-display text-3xl text-ink animate-price-pop motion-reduce:animate-none">
            LKR {estimate.toLocaleString('en-LK')}
          </p>
          <a
            href="/account"
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-blue px-4 py-3 text-xs font-semibold text-paper transition-all duration-200 hover:bg-blue-deep hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
          >
            Send us the link
            <ArrowRight size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  )
}


/* ============================================================================
 * PROMO CODES SECTION
 * ==========================================================================*/

function PromoCodesSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-0 lg:px-10">
      <Reveal className="flex items-center justify-between gap-4">
        <h2 className="font-display text-3xl text-ink sm:text-4xl">Trending Promo Codes</h2>
        <a href="/account/promo-codes" className="flex flex-none items-center gap-1 text-sm font-semibold text-ink hover:text-blue">
          View more <ChevronRight size={16} />
        </a>
      </Reveal>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {promoCodes.map((promo, index) => (
          <Reveal key={promo.code} delay={index * 100}>
            <PromoCodeCard
              tag={promo.tag}
              discount={promo.discount}
              title={promo.title}
              code={promo.code}
              expiresOn={promo.expiresOn}
            />
          </Reveal>
        ))}
      </div>
    </section>
  )
}


/* ============================================================================
 * SHOP BY CATEGORY
 * Placeholder data/icons — swap in real category content + links when ready.
 * ==========================================================================*/

const shopCategories = [
  { name: 'Fashion', icon: Shirt, href: '/account/requests/new?category=fashion' },
  { name: 'Tech', icon: Smartphone, href: '/account/requests/new?category=tech' },
  { name: 'Beauty', icon: Sparkles, href: '/account/requests/new?category=beauty' },
  { name: 'Home', icon: HomeIcon, href: '/account/requests/new?category=home' },
]

function ShopByCategory() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
      <Reveal className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-rust">Browse</p>
        <h2 className="mt-2 font-display text-3xl text-ink sm:text-4xl">Shop by category</h2>
      </Reveal>

      <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-4">
        {shopCategories.map((category, index) => {
          const Icon = category.icon
          return (
            <Reveal key={category.name} delay={index * 80}>
              <a
                href={category.href}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-card px-6 py-10 text-center transition-all duration-300 hover:-translate-y-1 hover:border-rust/40 hover:shadow-lift"
              >
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rust/10 text-rust transition-colors duration-300 group-hover:bg-rust group-hover:text-paper">
                  <Icon size={24} aria-hidden="true" />
                </span>
                <span className="font-display text-base text-ink">{category.name}</span>
              </a>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}

/* ============================================================================
 * FINAL CTA — closing banner before the footer.
 * ==========================================================================*/

function FinalCTA() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
      <Reveal className="relative overflow-hidden rounded-[28px] bg-ink px-10 py-16 text-center text-paper sm:px-16">
        <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-rust/10 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-blue/10 blur-3xl" aria-hidden="true" />

        <h2 className="relative font-display text-3xl sm:text-4xl">Ready to start shopping?</h2>
        <p className="relative mx-auto mt-3 max-w-md font-body text-sm text-paper/60">
          Paste any product link and we&apos;ll handle the rest — buying, consolidating, and shipping it straight to your door.
        </p>
        <a
          href="/account/requests/new"
          className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-rust px-8 py-3.5 font-body text-sm font-semibold text-paper transition-all duration-200 hover:bg-rust/90 hover:shadow-md"
        >
          Start a request
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </Reveal>
    </section>
  )
}

/* ============================================================================
 * CHAT BUTTON
 * ==========================================================================*/

function ChatButton() {
  return (
    <button
      aria-label="Chat with support"
      className="fixed bottom-6 right-6 z-40 grid h-14 w-14 animate-pulse-ring place-items-center rounded-full bg-rust text-paper shadow-lift transition-transform duration-200 hover:scale-110 motion-reduce:animate-none"
    >
      <MessageCircle />
    </button>
  )
}

function ViewportTwo() {
  return (
    <>
      <Partners />
      <PromoCodesSection />
      <ShopByCategory />
      <LinkOnlyCTA />
    </>
  )
}

/* ============================================================================
 * PAGE
 * ==========================================================================*/

export default function Home() {
  return (
    <main className="bg-paper">
      <style jsx global>{`
        @keyframes route-flow {
          to {
            background-position: 22px 0;
          }
        }
        @keyframes float-slow {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        @keyframes fade-slide-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes price-pop {
          from {
            opacity: 0;
            transform: translateY(4px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes pulse-ring {
          0% {
            box-shadow: 0 0 0 0 rgba(193, 39, 45, 0.45);
          }
          70% {
            box-shadow: 0 0 0 14px rgba(193, 39, 45, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(193, 39, 45, 0);
          }
        }
        .animate-route-flow {
          animation: route-flow 1.4s linear infinite;
        }
        .animate-float-slow {
          animation: float-slow 6s ease-in-out infinite;
        }
        .animate-fade-slide-in {
          animation: fade-slide-in 0.45s ease-out both;
        }
        .animate-price-pop {
          animation: price-pop 0.3s ease-out both;
        }
        .animate-pulse-ring {
          animation: pulse-ring 2.6s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-route-flow,
          .animate-float-slow,
          .animate-fade-slide-in,
          .animate-price-pop,
          .animate-pulse-ring {
            animation: none !important;
          }
        }

        /* --------------------------------------------------------------
         * No scroll-snap or scroll-hijacking — the page scrolls entirely
         * natively from top to bottom.
         * -------------------------------------------------------------- */
      `}</style>

      <Header />

      <Hero />

      <ViewportTwo />

      <TopChoices />
      <Destinations />
      <HowItWorks />
      <StatsBand />
      <Community />
      <Testimonials />
      <Footer />
      <ChatButton />
    </main>
  )
}