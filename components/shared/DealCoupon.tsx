/* ============================================================================
 * DEAL COUPON
 * A single "ticket" style deal card — pulled out of ShopByCategory so it
 * can be reused/tested on its own.
 *
 * Sizing: the old version set a fixed height per breakpoint (h-32 →
 * sm:h-44 → lg:h-48) on a card whose width came from the grid (2 cols on
 * mobile, 4 on desktop). Because width and height were controlled by two
 * unrelated systems, the card's actual aspect ratio drifted at every
 * width in between the named breakpoints — narrower and squarer on
 * mobile, wider and flatter on desktop — so the "ticket" silhouette
 * wasn't consistent.
 *
 * Fixed by dropping height breakpoints entirely: the card is `w-full
 * aspect-[7/4]`, so height is always derived from whatever width the
 * grid gives it — same silhouette at 2 columns, 4 columns, or anything
 * in between. Interior text, the brand logo, and the perforation studs
 * scale continuously with `clamp()` (viewport-relative) instead of
 * jumping at sm:/lg:, so nothing looks cramped just above a breakpoint
 * or oversized just below one.
 * ==========================================================================*/

export interface Deal {
  brand: string
  discount: string
  label: string
  detail: string
  bgColor: string
  productImage: string
  accent: string
  href: string
  brandLogo: string
}

export default function DealCoupon({ deal }: { deal: Deal }) {
  return (
    <a
      href={deal.href}
      className="group relative flex aspect-[7/4] w-full overflow-hidden rounded-xl shadow-[0_1px_2px_rgba(8,39,79,0.06),0_12px_28px_-12px_rgba(8,39,79,0.25)] ring-1 ring-inset ring-black/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_1px_2px_rgba(8,39,79,0.08),0_20px_36px_-14px_rgba(8,39,79,0.32)] sm:rounded-2xl"
      style={{ backgroundColor: deal.bgColor }}
    >
      <div
        className="relative flex min-w-0 flex-1 flex-col bg-cover bg-center p-[clamp(0.65rem,3vw,1.5rem)]"
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
          <p
            className={`font-body font-extrabold leading-none ${deal.accent}`}
            style={{ fontSize: 'clamp(1.05rem, 4.2vw, 1.875rem)' }}
          >
            {deal.discount}
          </p>
          <p
            className={`mt-0.5 font-body font-semibold uppercase tracking-wide ${deal.accent}`}
            style={{ fontSize: 'clamp(0.55rem, 1.6vw, 0.75rem)' }}
          >
            {deal.label}
          </p>
          <p
            className="mt-1 font-body text-ink/70"
            style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.875rem)' }}
          >
            {deal.detail}
          </p>
        </div>

        <div className="relative z-10 mt-auto">
          <img
            src={deal.brandLogo}
            alt={`${deal.brand} logo`}
            className="w-auto object-contain"
            style={{ height: 'clamp(0.9rem, 3vw, 1.75rem)' }}
          />
        </div>
      </div>

      <div className="relative w-0 flex-none">
        <span
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-card"
          style={{ top: '-0.5rem', height: 'clamp(0.85rem, 1.6vw, 1.5rem)', width: 'clamp(0.85rem, 1.6vw, 1.5rem)' }}
        />
        <span
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-card"
          style={{ bottom: '-0.5rem', height: 'clamp(0.85rem, 1.6vw, 1.5rem)', width: 'clamp(0.85rem, 1.6vw, 1.5rem)' }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-1/2 w-0 -translate-x-1/2 border-l-2 border-dashed border-ink/15 sm:inset-y-3"
        />
      </div>

      <div
        className="relative flex flex-none flex-col items-center justify-center gap-3 py-2"
        style={{ width: 'clamp(1.75rem, 5vw, 4rem)' }}
      >
        <span
          className="rotate-180 whitespace-nowrap font-body font-semibold uppercase tracking-[0.15em] text-ink/50 [writing-mode:vertical-rl]"
          style={{ fontSize: 'clamp(6px, 1vw, 9px)' }}
        >
          View Deal
        </span>
      </div>
    </a>
  )
}