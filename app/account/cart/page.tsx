// app/account/cart/page.tsx
'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ShoppingBag,
  ClipboardList,
  Truck,
  Plane,
  Lock,
  ArrowRight,
  Check,
  Tag,
  ShieldCheck,
  User,
  Mail,
  Phone,
  MapPin,
  Store,
  Link2,
  ChevronDown,
  ChevronRight,
  X,
  Info,
} from 'lucide-react'
import { useCart, type CartLineItem, type CartProduct } from '@/contexts/Cartcontext'
import { useDashboard } from '@/contexts/DashboardContext'
import { pathForView } from '@/components/dashboard/routes'
import {
  getDualDeliveryPricing,
  formatLKR,
  TERMS_URL,
  TERMS_SUMMARY,
  TERMS_CHECKBOX_LABEL,
  type ProductPriceableItem,
  type DeliveryPriceOption,
} from '@/lib/pricing'
import Image from 'next/image'

type DeliveryChoice = 'economy' | 'express'

const COMMON_COUNTRIES = [
  'Sri Lanka',
  'India',
  'United States',
  'United Kingdom',
  'Australia',
  'Canada',
  'United Arab Emirates',
  'Singapore',
  'Germany',
  'France',
] as const

function toPriceableItem(product: CartProduct): ProductPriceableItem {
  return {
    price: product.sourcePrice != null ? Number(product.sourcePrice) : 0,
    currency: product.currencyCode ?? 'USD',
    weightKg: product.weightKg ?? undefined,
  }
}

function cleanSiteLabel(site: string): string {
  const trimmed = site.trim().replace(/^www\./i, '')
  if (trimmed.includes('.')) return trimmed
  return trimmed
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}


function DeliveryModeToggle({
  value,
  onChange,
}: {
  value: DeliveryChoice
  onChange: (value: DeliveryChoice) => void
}) {
  const options: { key: DeliveryChoice; label: string; sub: string; icon: React.ReactNode }[] = [
    { key: 'economy', label: 'Economy', sub: '3–4 weeks', icon: <Truck size={15} strokeWidth={1.8} /> },
    { key: 'express', label: 'Express', sub: '12–15 days', icon: <Plane size={15} strokeWidth={1.8} /> },
  ]
  return (
    <div className="flex gap-2.5">
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`flex flex-1 items-center gap-2 rounded-xl border-2 px-3.5 py-2.5 text-left transition-all ${
              active ? 'border-teal-deep bg-teal/[0.06]' : 'border-ink/12 bg-white hover:border-ink/25'
            }`}
          >
            <span className={active ? 'text-teal-deep' : 'text-ink/40'}>{opt.icon}</span>
            <span className="min-w-0">
              <span className={`block text-sm font-bold ${active ? 'text-teal-deep' : 'text-ink'}`}>
                {opt.label}
              </span>
              <span className="block text-[11px] text-ink/40">{opt.sub}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold text-ink/70">
      {children}
      {required && <span className="text-red-400"> *</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/35 transition-colors focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20'

function ConfirmCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink/60">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none rounded border-ink/25 text-teal-deep focus:ring-teal/30"
      />
      <span>{children}</span>
    </label>
  )
}

function SourceBadge({ product }: { product: CartProduct }) {
  const source = product.source ?? 'link'
  const siteLabel = product.site ? cleanSiteLabel(product.site) : null

  if (source === 'catalogue') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-teal/[0.08] px-2 py-0.5 text-[10px] font-semibold text-teal-deep">
        <Store size={10} strokeWidth={2} />
        {siteLabel || 'Affiliated store'}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10px] font-semibold text-ink/50">
      <Link2 size={10} strokeWidth={2} />
      Pasted link{siteLabel ? ` · ${siteLabel}` : ''}
    </span>
  )
}

function BreakdownColumn({
  option,
  qty,
  heading,
  active,
}: {
  option: DeliveryPriceOption
  qty: number
  heading?: string
  active?: boolean
}) {
  const rows: { label: string; value: number }[] = [
    { label: 'Price', value: option.priceLKR * qty },
    { label: 'Service Charge', value: option.serviceChargeLKR * qty },
    { label: 'Delivery', value: option.deliveryFeeLKR * qty },
  ]

  return (
    <div className={`rounded-xl ${active ? 'bg-teal/[0.06]' : 'bg-ink/[0.02]'} px-3 py-2.5`}>
      {heading && (
        <p className={`mb-1.5 text-xs font-bold ${active ? 'text-teal-deep' : 'text-ink/60'}`}>{heading}</p>
      )}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] text-ink/45">{row.label}</span>
            <span className="text-xs tabular-nums text-ink/70">{formatLKR(row.value)}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-ink/30">
        Price includes currency conversion, freight &amp; handling.
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-ink/[0.08] pt-2">
        <span className="text-xs font-bold text-ink">Total</span>
        <span className="text-sm font-extrabold tabular-nums text-ink">
          {formatLKR(option.actualTotalLKR * qty)}
        </span>
      </div>
    </div>
  )
}

function PriceBreakdownOverlay({
  line,
  deliveryChoice,
  onClose,
}: {
  line: CartLineItem
  deliveryChoice: DeliveryChoice
  onClose: () => void
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const dual = getDualDeliveryPricing(toPriceableItem(line.product))
  const option = deliveryChoice === 'economy' ? dual.economy : dual.express

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-h-[80vh] sm:w-full sm:max-w-md sm:rounded-3xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Price breakdown for ${line.product.title}`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/10 sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="h-16 w-16 flex-none overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
              {line.product.image ? (
                <Image
                  src={line.product.image}
                  alt=""
                  className="h-full w-full object-cover"
                  width={64}
                  height={64}
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-ink/15">
                  <ShoppingBag size={16} strokeWidth={1.3} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold text-ink">{line.product.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <SourceBadge product={line.product} />
                <span className="text-xs text-ink/40">{line.qty}×</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close price breakdown"
            className="flex-none rounded-full p-1.5 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-xs font-bold text-ink/50">
            Breakdown · {deliveryChoice === 'economy' ? 'Economy' : 'Express'} (selected)
          </p>
          <BreakdownColumn option={option} qty={line.qty} />
        </div>

        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1 text-xs font-bold text-ink/50">
            <Info size={11} />
            Compare delivery methods
          </p>
          <div className="grid grid-cols-2 gap-2">
            <BreakdownColumn
              option={dual.express}
              qty={line.qty}
              heading="Express"
              active={deliveryChoice === 'express'}
            />
            <BreakdownColumn
              option={dual.economy}
              qty={line.qty}
              heading="Economy"
              active={deliveryChoice === 'economy'}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-ink/5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-ink/10"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function ReviewLine({
  line,
  deliveryChoice,
  onOpenBreakdown,
}: {
  line: CartLineItem
  deliveryChoice: DeliveryChoice
  onOpenBreakdown: () => void
}) {
  const dual = getDualDeliveryPricing(toPriceableItem(line.product))
  const option = deliveryChoice === 'economy' ? dual.economy : dual.express
  const grandLineTotal = option.actualTotalLKR * line.qty

  return (
    <button
      type="button"
      onClick={onOpenBreakdown}
      className="flex w-full items-start gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-ink/[0.03]"
    >
      <div className="h-16 w-16 flex-none overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
        {line.product.image ? (
          <Image src={line.product.image} alt="" className="h-full w-full object-cover" width={64} height={64} />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink/15">
            <ShoppingBag size={16} strokeWidth={1.3} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-1 text-sm font-semibold text-ink">{line.product.title}</p>
          <p className="flex-none text-sm font-bold tabular-nums text-ink">{formatLKR(grandLineTotal)}</p>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <SourceBadge product={line.product} />
          <span className="flex-none text-xs font-medium text-ink/40">{line.qty}×</span>
        </div>

        <div className="mt-1 flex items-center gap-0.5 text-[11px] font-semibold text-teal-deep">
          View price breakdown
          <ChevronRight size={12} strokeWidth={2.5} />
        </div>
      </div>
    </button>
  )
}

function CartSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-10" aria-hidden="true">
      <div className="overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 px-6 py-5 sm:px-8">
          <div className="h-6 w-40 animate-pulse rounded-md bg-ink/10" />
          <div className="h-5 w-40 animate-pulse rounded-md bg-ink/10" />
        </div>
        <div className="grid lg:grid-cols-3">
          <div className="space-y-4 px-6 py-6 sm:px-8 lg:col-span-2 lg:border-r lg:border-ink/10">
            <div className="h-10 w-64 animate-pulse rounded-xl bg-ink/10" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 w-full animate-pulse rounded-xl bg-ink/10" />
            ))}
          </div>
          <div className="px-6 py-6 sm:px-8">
            <div className="h-5 w-32 animate-pulse rounded-md bg-ink/10" />
            <div className="mt-4 space-y-4">
              <div className="h-12 w-full animate-pulse rounded-xl bg-ink/10" />
              <div className="h-12 w-full animate-pulse rounded-xl bg-ink/10" />
            </div>
            <div className="mt-6 h-14 w-full animate-pulse rounded-full bg-ink/10" />
          </div>
        </div>
      </div>
    </div>
  )
}

function useMatchHeightAtDesktop<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null)
  const [height, setHeight] = useState<number | null>(null)

  const sourceRef = useCallback((el: T | null) => {
    setNode(el)
  }, [])

  useLayoutEffect(() => {
    if (!node) return

    function measure() {
      if (!node) return
      setHeight(window.innerWidth >= 1024 ? node.getBoundingClientRect().height : null)
    }

    measure()

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(node)
    window.addEventListener('resize', measure)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [node])

  return { sourceRef, height }
}

export default function CartPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const cart = useCart()
  const dashboard = useDashboard()
  const router = useRouter()
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>('economy')
  const [confirming, setConfirming] = useState(false)
  const [discountCode, setDiscountCode] = useState('')

  const [breakdownLineId, setBreakdownLineId] = useState<string | null>(null)
  const breakdownLine = cart.items.find((line) => line.product.id === breakdownLineId) ?? null

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [whatsappCode, setWhatsappCode] = useState('+94')
  const [whatsapp, setWhatsapp] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [stateRegion, setStateRegion] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [confirmsRestrictions, setConfirmsRestrictions] = useState(false)
  const [confirmsPreowned, setConfirmsPreowned] = useState(false)

  const { sourceRef: leftPanelRef, height: leftPanelHeight } = useMatchHeightAtDesktop<HTMLDivElement>()

  const detailsComplete =
    fullName.trim() &&
    email.trim() &&
    whatsapp.trim() &&
    country.trim() &&
    city.trim() &&
    termsAccepted &&
    confirmsRestrictions &&
    confirmsPreowned

  const { priceSubtotalLKR, serviceChargeSubtotalLKR, deliverySubtotalLKR, grandTotalLKR } = useMemo(() => {
    let priceSubtotalLKR = 0
    let serviceChargeSubtotalLKR = 0
    let deliverySubtotalLKR = 0

    cart.items.forEach((line) => {
      const dual = getDualDeliveryPricing(toPriceableItem(line.product))
      const option = deliveryChoice === 'economy' ? dual.economy : dual.express
      priceSubtotalLKR += option.priceLKR * line.qty
      serviceChargeSubtotalLKR += option.serviceChargeLKR * line.qty
      deliverySubtotalLKR += option.deliveryFeeLKR * line.qty
    })

    return {
      priceSubtotalLKR,
      serviceChargeSubtotalLKR,
      deliverySubtotalLKR,
      grandTotalLKR: priceSubtotalLKR + serviceChargeSubtotalLKR + deliverySubtotalLKR,
    }
  }, [cart.items, deliveryChoice])

  const pendingRequestCount = dashboard.requests.length

  const handleConfirm = () => {
    if (cart.items.length === 0 || confirming || !detailsComplete) return
    setConfirming(true)

    const lines = cart.items.map((line) => {
      const dual = getDualDeliveryPricing(toPriceableItem(line.product))
      const option = deliveryChoice === 'economy' ? dual.economy : dual.express
      return {
        name: line.product.title,
        url: line.product.url,
        qty: line.qty,
        unitPriceLKR: option.actualTotalLKR,
        image: line.product.image ?? '',
      }
    })

    dashboard.confirmCartOrder(lines)
    cart.clearCart()
    router.push(pathForView('requests'))
  }

  if (!mounted) {
    return <CartSkeleton />
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-teal/[0.07]">
          <ShoppingBag size={28} className="text-teal-deep/40" strokeWidth={1.4} />
        </div>
        <p className="mt-5 font-display text-xl text-ink">Your bag is empty</p>
        <p className="mt-1 text-sm text-ink/45">
          Browse an affiliated store or paste a product link to get started.
        </p>
        <Link
          href="/stores"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-teal px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-teal-deep"
        >
          Browse stores
        </Link>

        {pendingRequestCount > 0 && (
          <Link
            href={pathForView('requests')}
            className="mt-5 flex items-center justify-center gap-1.5 text-xs font-semibold text-teal-deep hover:underline"
          >
            <ClipboardList size={14} />
            You also have {pendingRequestCount} request{pendingRequestCount !== 1 ? 's' : ''} in progress
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 lg:px-10">
      {pendingRequestCount > 0 && (
        <Link
          href={pathForView('requests')}
          className="mb-5 flex items-center gap-2 rounded-2xl border border-teal/20 bg-teal/5 px-4 py-3 text-xs font-semibold text-teal-deep transition-colors hover:bg-teal/10"
        >
          <ClipboardList size={14} className="shrink-0" />
          You also have {pendingRequestCount} request{pendingRequestCount !== 1 ? 's' : ''} being tracked
          separately
        </Link>
      )}

      <div className="overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-sm">
        <div className="grid lg:grid-cols-3 lg:items-start">
          <div ref={leftPanelRef} className="flex flex-col lg:col-span-2 lg:border-r lg:border-ink/10">
            <div className="px-6 pt-6 sm:px-8">
              <h2 className="font-display text-lg font-bold text-ink">Shipping Information</h2>

              <div className="mt-4">
                <FieldLabel>Delivery method</FieldLabel>
                <DeliveryModeToggle value={deliveryChoice} onChange={setDeliveryChoice} />
              </div>

              <div className="mt-5">
                <FieldLabel required>Full name</FieldLabel>
                <div className="relative">
                  <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter full name"
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>

              <div className="mt-4">
                <FieldLabel required>Email address</FieldLabel>
                <div className="relative">
                  <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email address"
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>

              <div className="mt-4">
                <FieldLabel required>WhatsApp number</FieldLabel>
                <div className="flex gap-2">
                  <select
                    value={whatsappCode}
                    onChange={(e) => setWhatsappCode(e.target.value)}
                    className="w-24 flex-none rounded-xl border border-ink/15 bg-white px-2 text-sm text-ink focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20"
                  >
                    <option value="+94">🇱🇰 +94</option>
                    <option value="+91">🇮🇳 +91</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+44">🇬🇧 +44</option>
                  </select>
                  <div className="relative flex-1">
                    <Phone size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
                    <input
                      type="tel"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="Enter WhatsApp number"
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-ink/40">We'll send order updates to this number.</p>
              </div>

              <div className="mt-4">
                <FieldLabel required>Country</FieldLabel>
                <div className="relative">
                  <MapPin size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className={`${inputClass} appearance-none pl-10 pr-9 ${country ? 'text-ink' : 'text-ink/35'}`}
                  >
                    <option value="" disabled>
                      Select country
                    </option>
                    {COMMON_COUNTRIES.map((c) => (
                      <option key={c} value={c} className="text-ink">
                        {c}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={15}
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink/30"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <FieldLabel required>City</FieldLabel>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Enter city"
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel>State</FieldLabel>
                  <input
                    type="text"
                    value={stateRegion}
                    onChange={(e) => setStateRegion(e.target.value)}
                    placeholder="Enter state"
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel>ZIP code</FieldLabel>
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder="Enter ZIP code"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-4 border-t mb-4 border-ink/10 px-6 py-4 sm:px-8">
              <div>
                <ConfirmCheckbox checked={termsAccepted} onChange={setTermsAccepted}>
                  {TERMS_CHECKBOX_LABEL.replace(/Terms and Conditions\.?$/i, '')}
                  <Link href={TERMS_URL} target="_blank" className="font-semibold text-teal-deep hover:underline">
                    Terms and Conditions
                  </Link>
                  .
                </ConfirmCheckbox>
                <p className="mt-1.5 pl-6 text-[11px] text-ink/40">{TERMS_SUMMARY}</p>
              </div>

              <ConfirmCheckbox checked={confirmsRestrictions} onChange={setConfirmsRestrictions}>
                I confirm the products requested do not violate Buy&amp;Ship&apos;s parcel restrictions or contain any{' '}
                <a href="#prohibited-items" className="font-semibold text-teal-deep hover:underline">
                  prohibited items
                </a>
                . I acknowledge the criteria for refunds and returns under Buy&amp;Ship&apos;s{' '}
                <a href="#purchase-protection" className="font-semibold text-teal-deep hover:underline">
                  Purchase Protection plan
                </a>
                .
              </ConfirmCheckbox>

              <ConfirmCheckbox checked={confirmsPreowned} onChange={setConfirmsPreowned}>
                I confirm and agree that, as it is not possible to guarantee or verify whether the condition of
                pre-owned items matches the seller&apos;s description, all pre-owned items are not eligible for
                refunds or returns. Fragile items and products sent via standard mail without tracking services are
                also not eligible for refunds or returns.
              </ConfirmCheckbox>
            </div>
          </div>

          <div
            className="flex flex-col lg:overflow-hidden lg:bg-card/20"
            style={leftPanelHeight != null ? { height: leftPanelHeight } : undefined}
          >
            <div className="flex-1 min-h-0 px-6 pt-6 sm:px-8 lg:overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <h2 className="font-display text-lg font-bold text-ink">Review your cart</h2>

              <div className="mt-4 divide-y divide-ink/[0.06]">
                {cart.items.map((line) => (
                  <div key={line.product.id} className="py-2 first:pt-0">
                    <ReviewLine
                      line={line}
                      deliveryChoice={deliveryChoice}
                      onOpenBreakdown={() => setBreakdownLineId(line.product.id)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-none border-t border-ink/10 bg-white px-6 py-5 sm:px-8 lg:bg-card/20">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink/15 bg-white px-3.5 py-2.5">
                  <Tag size={14} className="flex-none text-ink/35" />
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    placeholder="Discount code"
                    className="w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-ink/35 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={!discountCode.trim()}
                  className="flex-none rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Apply
                </button>
              </div>

              <div className="mt-4 space-y-2 border-t border-ink/10 pt-4">
                <p className="text-xs font-bold text-ink/50">
                  Order breakdown · {deliveryChoice === 'economy' ? 'Economy' : 'Express'}
                </p>
                <div className="flex items-center justify-between text-sm text-ink/50">
                  <span>Price ({cart.itemCount} unit{cart.itemCount !== 1 ? 's' : ''})</span>
                  <span className="tabular-nums">{formatLKR(priceSubtotalLKR)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-ink/50">
                  <span>Service Charge</span>
                  <span className="tabular-nums">{formatLKR(serviceChargeSubtotalLKR)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-ink/50">
                  <span>Delivery</span>
                  <span className="tabular-nums">{formatLKR(deliverySubtotalLKR)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between border-t-2 border-ink/10 pt-3">
                  <span className="text-base font-bold text-ink">Total</span>
                  <span className="font-display text-2xl font-extrabold tabular-nums text-ink">
                    {formatLKR(grandTotalLKR)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming || !detailsComplete}
                title={!detailsComplete ? 'Fill in shipping details and accept the terms to continue' : undefined}
                className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-full bg-teal-deep px-6 py-4 text-sm font-bold tracking-wide text-white transition-all hover:bg-teal-deep/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Lock size={15} />
                {confirming ? 'CONFIRMING…' : 'CONFIRM ORDER'}
                {!confirming && <ArrowRight size={16} />}
              </button>

              <div className="mt-4 flex items-start gap-2 text-xs text-ink/45">
                <ShieldCheck size={15} className="mt-0.5 flex-none text-teal-deep/60" />
                <p>
                  <span className="font-semibold text-ink/60">You will not be charged now.</span> This is
                  just a request — payment happens after the seller confirms availability.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {breakdownLine && (
        <PriceBreakdownOverlay
          line={breakdownLine}
          deliveryChoice={deliveryChoice}
          onClose={() => setBreakdownLineId(null)}
        />
      )}
    </div>
  )
}