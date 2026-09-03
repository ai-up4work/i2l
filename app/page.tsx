'use client'

import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Star,
  LinkIcon,
  Link,
} from 'lucide-react'
import { GlobeHemisphereWest, ShieldCheck, Truck } from '@phosphor-icons/react'
import { pathForView } from '@/components/dashboard/routes'
import AirmailStripe from '@/components/shared/AirmailStripe'
import { destinations, partners, testimonials } from '@/content/data'
import Header from '@/components/shared/Header'
import HowItWorks from '@/components/landing/HowItWorks'
import Footer from '@/components/landing/Footer'
import StatsBand from '@/components/landing/StatsBand'
import Community from '@/components/landing/Community'
import WhyChooseWishdrop from '@/components/landing/WhyChooseWishdrop'

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

/* ============================================================================
 * HERO
 * ==========================================================================*/

function Hero() {
  const router = useRouter()
  const [link, setLink] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = link.trim()
    if (!trimmed || submitted) return

    setSubmitted(true)

    window.setTimeout(() => {
      router.push(`${pathForView('addRequest')}?link=${encodeURIComponent(trimmed)}`)
    }, 500)
  }

    const heroFeatures = [
    { icon: GlobeHemisphereWest, title: 'Global Stores', text: 'Top brands worldwide' },
    { icon: ShieldCheck, title: 'Safe & Secure', text: 'Your items, our priority' },
    { icon: Truck, title: 'Fast Delivery', text: 'To your doorstep' },
    ]

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
            <div className="mt-20 flex flex-wrap items-center gap-x-8 gap-y-5">
            {heroFeatures.map(({ icon: Icon, title, text }) => (
                <div key={title} className="group flex items-center gap-3">
                <span className="relative grid h-9 w-9 flex-none place-items-center rounded-2xl bg-gradient-to-br from-teal/15 via-card to-gold/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_2px_6px_-2px_rgba(8,39,79,0.25)] ring-1 ring-inset ring-ink/5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-[4deg]">
                    <Icon size={18} weight="duotone" className="text-indigo" style={{ '--icon-secondary': 'var(--color-gold)' } as React.CSSProperties} />
                </span>
                <span className="leading-tight">
                    <span className="block font-body text-xs font-semibold text-indigo sm:text-sm">{title}</span>
                    <span className="block font-body text-[8px] text-indigo/50 sm:text-xs">{text}</span>
                </span>
                </div>
            ))}
            </div>
        </div>
      </div>
    </section>
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
              {visible.map((destination) => (
                <a
                  key={destination.code + destination.name}
                  href={`/destinations/${destination.code.toLowerCase()}`}
                  className="group w-full overflow-hidden rounded-lg shadow-lg shadow-indigo-deep/30 transition-transform duration-300 hover:-translate-y-1"
                >
                  <div className="relative aspect-[4/3.6] overflow-hidden rounded-t-full bg-indigo-deep">
                    <img
                      src={destination.img}
                      alt={destination.name}
                      className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-parchment/40 bg-indigo-deep/40 backdrop-blur">
                      <Flag code={destination.code} />
                    </span>
                  </div>

                  <div className="relative bg-card px-5 py-4">
                    <span className="absolute inset-y-0 left-0 w-1 bg-gold" />
                    <div className="flex items-center justify-between gap-3 pl-2">
                      <p className="font-display text-base font-semibold uppercase tracking-wide text-ink">
                        {destination.name}
                      </p>
                      <span className="flex shrink-0 items-center gap-1 font-body text-xs font-semibold uppercase tracking-wide text-teal transition-colors group-hover:text-teal-deep">
                        Shop
                        <ArrowUpRight
                          size={13}
                          className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        />
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================================================================
 * PARTNERS
 * ==========================================================================*/
function Partners() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 text-center lg:px-10">
      <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
        Trusted by thousands <span className="text-ink/30">•</span> Partnered with the best
      </p>

      <div className="mt-12 flex flex-wrap items-center justify-center gap-x-14 gap-y-8">
        {partners.map((partner) => (
          <Image
            key={partner.name}
            src={partner.logo}
            alt={partner.name}
            width={140}
            height={50}
            className="h-9 w-auto object-contain sm:h-11"
          />
        ))}
      </div>
    </section>
  )
}

/* ============================================================================
 * TESTIMONIALS
 * ==========================================================================*/

function Testimonials() {
  const [index, setIndex] = useState(0)

  function showPrevious() {
    setIndex((current) => (current - 1 + testimonials.length) % testimonials.length)
  }

  function showNext() {
    setIndex((current) => (current + 1) % testimonials.length)
  }

  return (
    <section className="bg-indigo-deep px-6 py-24 text-center text-parchment lg:px-10">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-3xl sm:text-4xl">What people are saying</h2>

        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={showPrevious}
            aria-label="Previous testimonial"
            className="grid h-10 w-10 place-items-center rounded-full border border-parchment/25 transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={showNext}
            aria-label="Next testimonial"
            className="grid h-10 w-10 place-items-center rounded-full border border-parchment/25 transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="mt-10 grid gap-5 text-left sm:grid-cols-3">
          {[0, 1, 2].map((offset) => {
            const testimonial = testimonials[(index + offset) % testimonials.length]
            return (
              <blockquote key={testimonial.name} className="rounded-2xl bg-indigo p-7">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 flex-none overflow-hidden rounded-full border border-dashed border-gold/60">
                    <Image
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      width={48}
                      height={48}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <cite className="block font-body text-sm font-semibold not-italic text-parchment">
                      {testimonial.name}
                    </cite>
                    <div className="mt-0.5 flex gap-0.5 text-gold">
                      {Array.from({ length: 5 }).map((_, starIndex) => (
                        <Star key={starIndex} size={11} fill="currentColor" />
                      ))}
                    </div>
                  </div>
                </div>

                <p className="mt-5 min-h-[84px] font-body text-sm leading-relaxed text-parchment/85">
                  {testimonial.quote}
                </p>
              </blockquote>
            )
          })}
        </div>

        <a
          href="#"
          className="mt-10 inline-flex items-center gap-2 font-body font-semibold text-gold transition-colors hover:text-gold-deep"
        >
          <Star size={15} /> View more on Trustpilot
        </a>
      </div>
    </section>
  )
}

/* ============================================================================
 * DEALS & CATEGORIES (deals promo strip + shop by category)
 * ==========================================================================*/

const topDeals = [
  {
    brand: 'eBay',
    discount: '15%',
    label: 'Off',
    detail: 'On Select Items',
    bgColor: '#EAE8FB', // soft lavender
    productImage: '/deals/ebay-card-bg.png', // cutout product image only
    accent: 'text-[#5B57F0]', // lighter periwinkle-indigo
    href: '/deals/ebay',
    brandLogo: '/logos/ebay.png',
  },
  {
    brand: 'Amazon',
    discount: '$20',
    label: 'Off',
    detail: 'On $150+ Orders',
    bgColor: '#FBEEDC', // soft peach
    productImage: '/deals/amazon-card-bg.png',
    accent: 'text-[#E0A429]', // lighter amber-gold
    href: '/deals/amazon',
    brandLogo: '/logos/amazon.png',
  },
  {
    brand: 'ZARA',
    discount: '25%',
    label: 'Off',
    detail: 'Sitewide',
    bgColor: '#E4F3EA', // soft mint
    productImage: '/deals/zara-card-bg.png',
    accent: 'text-[#2FA36B]', // lighter emerald-green
    href: '/deals/zara',
    brandLogo: '/logos/zara.png',
  },
  {
    brand: 'Rakuten',
    discount: '10%',
    label: 'Off',
    detail: 'On Orders Over $80',
    bgColor: '#FBE9E9', // soft rose
    productImage: '/deals/rakuten-card-bg.png',
    accent: 'text-[#E24C5A]', // lighter rose-red
    href: '/deals/rakuten',
    brandLogo: '/logos/rakuten.png',
  },
]

const shopCategories = [
  { name: 'Electronics', image: '/categories/electronics.png', href: '/account/requests/new?category=electronics' },
  { name: 'Fashion', image: '/categories/fashion.png', href: '/account/requests/new?category=fashion' },
  { name: 'Beauty', image: '/categories/beauty.png', href: '/account/requests/new?category=beauty' },
  { name: 'Home & Living', image: '/categories/home.png', href: '/account/requests/new?category=home' },
  { name: 'Sports', image: '/categories/sports.png', href: '/account/requests/new?category=sports' },
  { name: 'Toys & Games', image: '/categories/toys.png', href: '/account/requests/new?category=toys' },
  { name: 'Anime', image: '/categories/anime.png', href: '/account/requests/new?category=anime' },
  { name: 'Books', image: '/categories/books.png', href: '/account/requests/new?category=books' },
]

function ShopByCategory() {
  return (
    <section className="mx-auto max-w-9xl px-12 py-20 lg:px-20 bg-card">


      {/* Shop by category */}
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

      <div className="mt-10 flex justify-center">
        <a
          href="/account/requests/new"
          className="rounded-xl border border-gold/75 px-6 py-3 font-body text-sm font-semibold text-ink transition-colors duration-300 hover:border-gold/40 hover:bg-indigo hover:text-parchment"
        >
          Explore all categories
        </a>
      </div>

            {/* Deals & Promos */}
      <Reveal className="flex items-end justify-between">
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
          className="rounded-xl border border-gold/75 px-6 py-3 font-body text-sm font-semibold text-ink transition-colors duration-300 hover:border-gold/40 hover:bg-indigo hover:text-parchment"
        >
          View all deals
        </a>
      </Reveal>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {topDeals.map((deal, index) => (
          <Reveal key={deal.brand} delay={index * 60}>
            <a
              href={deal.href}
              className="group relative flex h-44 overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(8,39,79,0.06),0_12px_28px_-12px_rgba(8,39,79,0.25)] ring-1 ring-inset ring-black/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_1px_2px_rgba(8,39,79,0.08),0_20px_36px_-14px_rgba(8,39,79,0.32)] sm:h-48"
              style={{ backgroundColor: deal.bgColor }}
            >
              {/* main coupon body */}
              <div
                className="relative flex min-w-0 flex-1 flex-col bg-cover bg-center p-6"
                style={{ backgroundImage: `url(${deal.productImage})` }}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/25 blur-2xl transition-transform duration-500 group-hover:scale-125"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/20 to-transparent"
                />

                <div className="relative z-10 min-w-0">
                  <p className={`font-body text-3xl font-extrabold leading-none ${deal.accent}`}>
                    {deal.discount}
                  </p>
                  <p className={`mt-0.5 font-body text-xs font-semibold uppercase tracking-wide ${deal.accent}`}>
                    {deal.label}
                  </p>
                  <p className="mt-2 font-body text-sm text-ink/70">{deal.detail}</p>
                </div>

                <div className="relative z-10 mt-auto">
                  <img
                    src={deal.brandLogo}
                    alt={`${deal.brand} logo`}
                    className="h-6 w-auto object-contain sm:h-7"
                  />
                </div>
              </div>

              {/* perforation: dashed line + circular notches */}
              <div className="relative w-0 flex-none">
                <span
                  aria-hidden="true"
                  className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-card"
                />
                <span
                  aria-hidden="true"
                  className="absolute -bottom-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-card"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-y-3 left-1/2 w-0 -translate-x-1/2 border-l-2 border-dashed border-ink/15"
                />
              </div>

              {/* ticket stub */}
              <div className="relative flex w-14 flex-none flex-col items-center justify-center gap-3 py-4 sm:w-16">
                <span className="rotate-180 whitespace-nowrap font-body text-[9px] font-semibold uppercase tracking-[0.2em] text-ink/50 [writing-mode:vertical-rl]">
                  View Deal
                </span>
                {/* <ArrowUpRight
                  size={15}
                  className="text-ink/60 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                /> */}
              </div>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ============================================================================
 * FINAL CTA
 * ==========================================================================*/
function FinalCTA() {
  const router = useRouter()
  const [link, setLink] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = link.trim()
    if (!trimmed || submitted) return

    setSubmitted(true)

    window.setTimeout(() => {
      router.push(`${pathForView('addRequest')}?link=${encodeURIComponent(trimmed)}`)
    }, 500)
  }

  return (
    <section className="mx-auto max-w-8xl px-6 py-20 lg:px-10">
      <Reveal className="relative overflow-hidden rounded-[28px] bg-parchment border border-black/5 shadow-lift">
        <div className="pointer-events-none absolute inset-0">
          <Image
            src="/final-cta-bg.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 1152px, 100vw"
            className="object-cover object-left lg:object-center"
          />
          {/* scrim: darkens/lightens under the text so it reads over any part of the illustration */}
          <div className="absolute inset-0 bg-gradient-to-r from-parchment/90 via-parchment/40 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-col gap-8 px-8 py-14 sm:px-12 lg:flex-row lg:items-center lg:justify-between lg:px-14 lg:py-16">
          {/* text block — offset right on desktop to clear the illustration */}
          <div className="max-w-lg rounded-2xl lg:ml-[240px] xl:ml-[300px]">
            <p className="font-body text-xs font-extrabold uppercase tracking-[0.2em] text-gold drop-shadow-sm">
              Ready to shop anywhere?
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold leading-tight text-indigo drop-shadow-sm sm:text-2xl">
              Your global shopping companion, always.
            </h2>
            <p className="mt-2 font-body text-sm text-ink/70">
              Paste a product link and let WishDrop handle the rest.
            </p>
          </div>

          {/* quick-quote form */}
          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-md items-center gap-1 rounded-full border border-black/5 bg-card py-1.5 pl-5 pr-1.5 shadow-lift"
          >
            <LinkIcon size={16} className="shrink-0 text-ink/35" aria-hidden="true" />
            <input
              aria-label="Product link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Paste product link here..."
              disabled={submitted}
              className="w-full min-w-0 bg-transparent px-3 font-body text-sm text-ink outline-none placeholder:text-ink/40 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={submitted || !link.trim()}
              aria-label="Start Shopping"
              className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-teal px-4 py-3 font-body text-sm font-semibold text-parchment transition-all duration-200 hover:bg-indigo-deep active:scale-95 disabled:cursor-default disabled:opacity-60 disabled:active:scale-100 sm:px-6"
            >
              {submitted ? (
                <>
                  <span className="hidden sm:inline">Sent</span> <Check size={15} />
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Start Shopping</span> <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>
        </div>
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
      className="fixed bottom-6 right-6 z-40 grid h-14 w-14 animate-pulse-ring place-items-center rounded-full bg-gold text-parchment shadow-lift transition-transform duration-200 hover:scale-110 motion-reduce:animate-none"
    >
      <MessageCircle />
    </button>
  )
}

/* ============================================================================
 * PAGE
 * ==========================================================================*/

export default function Home() {
  return (
    <main className="bg-parchment">
      <style jsx global>{`
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
        .animate-float-slow {
          animation: float-slow 6s ease-in-out infinite;
        }
        .animate-fade-slide-in {
          animation: fade-slide-in 0.45s ease-out both;
        }
        .animate-pulse-ring {
          animation: pulse-ring 2.6s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-float-slow,
          .animate-fade-slide-in,
          .animate-pulse-ring {
            animation: none !important;
          }
        }
      `}</style>

      <Header />

      <Hero />
      <Partners />
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
    </main>
  )
}