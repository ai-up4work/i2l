// components/shared/DealCoupon.tsx

export interface Deal {
  brand: string
  discount: string
  label?: string
  detail?: string
  bgColor?: string
  productImage?: string
  accent?: string
  href: string
  brandLogo?: string
}

const FALLBACK_BG = '#F0EFEC'
const FALLBACK_ACCENT = 'text-ink'

export default function DealCoupon({ deal }: { deal: Deal }) {
  const bgColor = deal.bgColor ?? FALLBACK_BG
  const accent = deal.accent ?? FALLBACK_ACCENT

  return (
   <a 
      href={deal.href}
      className="group relative flex aspect-[7/4] w-full overflow-hidden rounded-xl shadow-[0_1px_2px_rgba(8,39,79,0.06),0_12px_28px_-12px_rgba(8,39,79,0.25)] ring-1 ring-inset ring-black/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_1px_2px_rgba(8,39,79,0.08),0_20px_36px_-14px_rgba(8,39,79,0.32)] sm:rounded-2xl"
      style={{ backgroundColor: bgColor }}
    >
      <div
        className="relative flex min-w-0 flex-1 flex-col bg-cover bg-center p-[clamp(0.65rem,3vw,1.5rem)]"
        style={deal.productImage ? { backgroundImage: `url(${deal.productImage})` } : undefined}
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
            className={`font-body font-extrabold leading-none ${accent}`}
            style={{ fontSize: 'clamp(1.05rem, 4.2vw, 1.875rem)' }}
          >
            {deal.discount}
          </p>
          {deal.label && (
            <p
              className={`mt-0.5 font-body font-semibold uppercase tracking-wide ${accent}`}
              style={{ fontSize: 'clamp(0.55rem, 1.6vw, 0.75rem)' }}
            >
              {deal.label}
            </p>
          )}
          {deal.detail && (
            <p
              className="mt-1 font-body text-ink/70"
              style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.875rem)' }}
            >
              {deal.detail}
            </p>
          )}
        </div>

        <div className="relative z-10 mt-auto">
          {deal.brandLogo ? (
            <img
              src={deal.brandLogo}
              alt={`${deal.brand} logo`}
              className="w-auto object-contain"
              style={{ height: 'clamp(0.9rem, 3vw, 1.75rem)' }}
              onError={(e) => {
                // if the logo asset 404s, fall back to text instead of a broken-image icon
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextElementSibling?.classList.remove('hidden')
              }}
            />
          ) : null}
          <span
            className={`font-body font-bold uppercase tracking-wide ${accent} ${deal.brandLogo ? 'hidden' : ''}`}
            style={{ fontSize: 'clamp(0.7rem, 2.4vw, 1rem)' }}
          >
            {deal.brand}
          </span>
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