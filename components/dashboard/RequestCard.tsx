import { useState } from 'react'
import { Clock3 } from 'lucide-react'
import type { ItemRequest, RequestStatus } from './types'
import CurrencySelect from '@/components/CurrencySelect'
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion'
import { formatMoney, type CurrencyCode } from '@/lib/currency/convert'
import { platformLogos } from './data'

const STATUS_LABEL: Record<RequestStatus, string> = {
  Requested: 'In review',
  'Awaiting payment': 'Awaiting payment',
}

const STATUS_PILL: Record<RequestStatus, string> = {
  Requested: 'bg-ink/5 text-ink/60',
  'Awaiting payment': 'bg-gold/15 text-gold',
}

const STATUS_DOT: Record<RequestStatus, string> = {
  Requested: 'bg-ink/40',
  'Awaiting payment': 'bg-gold',
}

// Extra, optional payment-countdown + platform fields. These aren't on
// ItemRequest yet — wire them up from real data when available; sensible
// defaults keep the current mock behavior working in the meantime.
type PaymentMeta = {
  totalDue?: string
  hoursRemaining?: number
  totalHours?: number
  // Currency the unitPrice was actually captured in. Not on ItemRequest yet
  // either — defaults to 'USD' below to match the previous hardcoded "US$".
  currency?: string
  // Marketplace the item was sourced from. Defaults to 'eBay' to match
  // the previous hardcoded label/badge.
  platform?: string
  // Optional logo override for a specific request. If omitted, falls back
  // to the platformLogos map (from data.ts) keyed by `platform`.
  platformLogoUrl?: string
}

const RING_RADIUS = 18
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

// Fallback initials/colors for any platform without a logo file in
// platformLogos (data.ts).
const PLATFORM_FALLBACK: Record<string, { initials: string; className: string }> = {
  Etsy: { initials: 'Et', className: 'bg-[#F1641E]/15 text-[#F1641E]' },
  Poshmark: { initials: 'Po', className: 'bg-[#7F0353]/10 text-[#7F0353]' },
}

function PlatformBadge({ platform, logoUrl }: { platform: string; logoUrl?: string }) {
  const [imgError, setImgError] = useState(false)
  const resolvedLogo = logoUrl ?? platformLogos[platform]

  if (resolvedLogo && !imgError) {
    return (
      <img
        src={resolvedLogo}
        alt={`${platform} logo`}
        onError={() => setImgError(true)}
        className="h-8 w-auto max-w-[80px] flex-none object-contain"
      />
    )
  }

  const style = PLATFORM_FALLBACK[platform] ?? {
    initials: platform.slice(0, 2),
    className: 'bg-ink/10 text-ink/60',
  }

  return (
    <span
      className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold ${style.className}`}
      aria-hidden
    >
      {style.initials}
    </span>
  )
}

export default function RequestCard({ request }: { request: ItemRequest & PaymentMeta }) {
  const isAwaitingPayment = request.status === 'Awaiting payment'
  const platform = request.platform ?? 'eBay'

  // Original currency the price was scraped/entered in — fixed, never mutated.
  const originalCurrency = request.currency ?? 'USD'
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(originalCurrency as CurrencyCode)

  // Guard: only attempt conversion/formatting when unitPrice is an actual
  // number. Missing/undefined price data (upstream field mismatch, still-
  // loading data, etc.) previously flowed straight into formatMoney and
  // rendered as the literal string "LKRNaN" — this stops that at the source
  // and shows a clear "Price pending" state instead.
  const hasValidPrice = typeof request.unitPrice === 'number' && !Number.isNaN(request.unitPrice)

  const { convertedAmount, loading: converting, error: conversionError } = useCurrencyConversion(
    hasValidPrice ? request.unitPrice : null,
    originalCurrency,
    displayCurrency
  )

  const price = !hasValidPrice
    ? null
    : convertedAmount != null
      ? formatMoney(convertedAmount, displayCurrency)
      : formatMoney(request.unitPrice, originalCurrency)

  const totalDue = request.totalDue ?? 'HK$2,509'
  const totalHours = request.totalHours ?? 72
  const hoursRemaining = request.hoursRemaining ?? 45
  const percentElapsed = Math.min(100, Math.max(0, ((totalHours - hoursRemaining) / totalHours) * 100))
  const dashOffset = RING_CIRCUMFERENCE * (1 - percentElapsed / 100)
  const days = Math.floor(hoursRemaining / 24)
  const hours = Math.round(hoursRemaining % 24)
  const isUrgent = hoursRemaining <= 24

  return (
    <article className="group overflow-hidden rounded-2xl border border-ink/10 bg-card font-body transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5">
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-ink/50">
          <PlatformBadge platform={platform} logoUrl={request.platformLogoUrl} />
          {platform}
        </div>

        <div className="mt-4 flex gap-4">
          <img
            src={request.image}
            alt={request.name}
            className="h-24 w-24 flex-none rounded-lg border border-ink/10 object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <div className="flex min-w-0 flex-col justify-center gap-1.5">
            <h2 className="line-clamp-2 font-semibold leading-snug text-ink">{request.name}</h2>
            <span className="text-sm text-ink/50">x{request.qty}</span>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-display text-lg font-semibold text-teal-deep">
                {converting ? '…' : price ?? <span className="text-ink/35">Price pending</span>}
              </strong>
              {hasValidPrice && (
                <CurrencySelect
                  value={displayCurrency}
                  onChange={setDisplayCurrency}
                  className="rounded-md border border-ink/10 bg-parchment px-1.5 py-0.5 text-[11px] font-semibold text-ink/60 outline-none focus:ring-2 focus:ring-gold/50"
                />
              )}
            </div>
            {conversionError && hasValidPrice && (
              <span className="text-xs text-indigo-deep/70">Couldn&apos;t convert — showing original</span>
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-ink/10 pt-4">
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-ink/50">Status</span>
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_PILL[request.status]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[request.status]} ${isAwaitingPayment ? 'motion-safe:animate-pulse' : ''}`} />
              {STATUS_LABEL[request.status]}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-ink/50">Request No.</span>
            <span className="font-label text-xs tracking-tight text-ink">{request.id}</span>
          </div>
        </div>
      </div>

      {isAwaitingPayment && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 bg-gold/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90" aria-hidden>
              <circle cx="22" cy="22" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="3" className="text-gold/20" />
              <circle
                cx="22"
                cy="22"
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                className={`transition-[stroke-dashoffset] duration-700 ease-out ${isUrgent ? 'text-indigo-deep' : 'text-gold'}`}
              />
            </svg>
            <div>
              <strong className="font-display block text-lg font-semibold text-ink">Total {totalDue}</strong>
              <span className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium ${isUrgent ? 'text-indigo-deep' : 'text-gold'}`}>
                <Clock3 size={14} strokeWidth={2.5} />
                {days > 0 ? `${days} day${days === 1 ? '' : 's'} ${hours}h` : `${hours}h`} remaining
              </span>
            </div>
          </div>
          <button className="rounded-lg bg-teal px-6 py-3 text-sm font-semibold text-parchment transition-all duration-200 hover:bg-teal-deep active:scale-95">
            Pay now
          </button>
        </div>
      )}
    </article>
  )
}