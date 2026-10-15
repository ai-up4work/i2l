// components/landing/Testimonials.tsx
//
// "What customers say" on the landing page. Data: content/data.ts
// `testimonials` — real reviews only (see the note there).
//
// Layout
//   - Left: heading, the average rating worked out from the reviews (only
//     shown once there are 5+ rated reviews, so a tiny sample doesn't
//     look like a claim), and "Share your experience", which opens
//     WhatsApp so happy customers can send a review.
//   - Right: review cards. Up to 4 reviews sit in a grid; with more, they
//     scroll slowly in two rows (pauses on hover, and stays still for
//     people who prefer reduced motion).
'use client'

import Image from 'next/image'
import { MessageCircle, Quote, Star } from 'lucide-react'
import { testimonials, type Testimonial } from '@/content/data'
import { buildWhatsAppLink } from '@/lib/chat/waLink'

function initials(name: string) {
  return name
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="flex gap-0.5 text-gold" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} fill={i < Math.round(value) ? 'currentColor' : 'none'} strokeWidth={1.5} />
      ))}
    </span>
  )
}

function Card({ t }: { t: Testimonial }) {
  const meta = [t.item && t.store ? `${t.item} from ${t.store}` : t.item || t.store, t.city].filter(Boolean).join(' · ')
  return (
    <figure className="flex w-[300px] flex-none flex-col rounded-3xl bg-indigo p-6 ring-1 ring-parchment/10 sm:w-[340px]">
      <div className="flex items-start justify-between gap-3">
        <Quote size={26} className="text-gold/70" strokeWidth={1.5} aria-hidden />
        {t.rating && <Stars value={t.rating} />}
      </div>
      <blockquote className="mt-3 flex-1 font-body text-[15px] leading-relaxed text-parchment/90">{t.quote}</blockquote>
      {t.photo && (
        <div className="relative mt-4 aspect-[16/10] overflow-hidden rounded-2xl">
          <Image src={t.photo} alt={t.item ? `${t.name}'s ${t.item}` : ''} fill sizes="340px" className="object-cover" />
        </div>
      )}
      <figcaption className="mt-5 flex items-center gap-3 border-t border-parchment/10 pt-4">
        <span className="relative grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full bg-teal/30 font-body text-sm font-bold text-parchment ring-2 ring-gold/40">
          {initials(t.name)}
          {t.avatar && <Image src={t.avatar} alt="" fill sizes="40px" className="object-cover" />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-body text-sm font-semibold text-parchment">{t.name}</p>
          {(meta || t.source || t.date) && (
            <p className="truncate font-body text-xs text-parchment/55">
              {meta}
              {meta && (t.source || t.date) ? ' · ' : ''}
              {[t.source ? `via ${t.source}` : null, t.date].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      </figcaption>
    </figure>
  )
}

function Row({ items, reverse = false }: { items: Testimonial[]; reverse?: boolean }) {
  // Content repeated twice so the loop is seamless (translate -50%).
  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      <div
        className={`flex w-max gap-5 py-2 motion-safe:animate-[testimonialScroll_var(--dur)_linear_infinite] group-hover:[animation-play-state:paused] ${
          reverse ? '[animation-direction:reverse]' : ''
        }`}
        style={{ ['--dur' as string]: `${Math.max(40, items.length * 9)}s` }}
      >
        {[...items, ...items].map((t, i) => (
          <div key={i} aria-hidden={i >= items.length}>
            <Card t={t} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Testimonials() {
  if (testimonials.length === 0) return null

  const rated = testimonials.filter((t) => t.rating)
  const average = rated.length ? rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length : 0
  const showAverage = rated.length >= 5
  const scrolling = testimonials.length > 4
  const half = Math.ceil(testimonials.length / 2)

  const shareLink = buildWhatsAppLink(
    null,
    'Hi Wishdrop! I’d like to share a review of my order:\n\n(What did you buy, and how was it?)\n\nYou can show my review on your website: yes / no',
  )

  return (
    <section className="relative overflow-hidden bg-indigo-deep px-6 py-20 text-parchment lg:px-10 lg:py-24">
      <style>{`@keyframes testimonialScroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-teal/20 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-[1600px] items-center gap-12 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div>
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">Real customers</p>
          <h2 className="mt-3 font-display text-4xl leading-[1.08] sm:text-5xl">
            What shoppers in Sri Lanka say
          </h2>

          {showAverage ? (
            <div className="mt-6 flex items-center gap-4">
              <span className="font-display text-5xl text-parchment">{average.toFixed(1)}</span>
              <div>
                <Stars value={average} size={16} />
                <p className="mt-1 font-body text-sm text-parchment/60">from {rated.length} reviews</p>
              </div>
            </div>
          ) : (
            <p className="mt-5 max-w-sm font-body text-sm leading-relaxed text-parchment/65">
              Every order is bought, quality checked and delivered by our own team — here&apos;s how it went for some
              of our customers.
            </p>
          )}

          <a
            href={shareLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-parchment/25 px-5 py-2.5 font-body text-sm font-semibold text-parchment transition-colors hover:border-gold hover:text-gold"
          >
            <MessageCircle size={16} /> Share your experience
          </a>
        </div>

        {scrolling ? (
          <div className="min-w-0 space-y-3">
            <Row items={testimonials.slice(0, half)} />
            <Row items={testimonials.slice(half)} reverse />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 [&_figure]:w-auto">
            {testimonials.map((t, i) => (
              <Card key={`${t.name}-${i}`} t={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
