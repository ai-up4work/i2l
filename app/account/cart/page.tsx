// app/account/cart/page.tsx
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ShoppingBag,
  ClipboardList,
  Minus,
  Plus,
  Heart,
  Trash2,
  Link2,
  Store,
  Truck,
  Plane,
  Lock,
  ArrowRight,
  Check,
} from 'lucide-react'
import { useCart, type CartLineItem, type CartProduct } from '@/contexts/Cartcontext'
import { useWishlist, type WishlistProduct } from '@/contexts/Wishlistcontext'
import { useDashboard } from '@/contexts/DashboardContext'
import { pathForView } from '@/components/dashboard/routes'
import { getDualDeliveryPricing, formatLKR, type ProductPriceableItem } from '@/lib/pricing'
import Image from 'next/image'

type DeliveryChoice = 'economy' | 'express'

// Renders under /account, so it inherits AccountLayout's own
// DashboardProvider/Header — no extra provider wrapping needed here,
// unlike the standalone marketplace PDP which has to mount its own.
//
// CartContext is intentionally NOT scoped per-platform (see
// contexts/Cartcontext.tsx — one global 'wishdrop:cart' key, each line
// just carries a `site` field), so this page shows a single mixed cart
// across every affiliate store AND every pasted-link item the shopper
// has added.
//
// SOURCE BADGE: a line's `product.source` ('catalogue' | 'link') drives
// a small pill on each row so a shopper with a mixed cart can tell at a
// glance which items came from browsing a store versus pasting a URL.
// Sits in the same visual slot a future carrier/perk badge (e.g.
// "Fastest India") would occupy — only one badge shows per line for now.
//
// MOVE TO WISHLIST: removes the line from the cart and adds an
// equivalent snapshot to WishlistContext, using the same identity
// convention (product.id, product.url) both contexts already share.
//
// DELIVERY METHOD: one selection for the whole cart, not per line — a
// real shipment only goes out one way. Every line's shown price and the
// grand total re-derive off this single choice via getDualDeliveryPricing,
// the same function the PDP uses, so nothing here can drift from what the
// shopper saw before adding to bag.

function toPriceableItem(product: CartProduct): ProductPriceableItem {
  return {
    price: product.sourcePrice != null ? Number(product.sourcePrice) : 0,
    currency: product.currencyCode ?? 'USD',
    weightKg: product.weightKg ?? undefined,
  }
}

function SourceBadge({ source, site }: { source: CartProduct['source']; site?: string | null }) {
  const isCatalogue = source === 'catalogue'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        isCatalogue ? 'bg-teal/10 text-teal-deep' : 'bg-gold/15 text-gold-deep'
      }`}
    >
      {isCatalogue ? <Store size={11} /> : <Link2 size={11} />}
      {isCatalogue ? (site ? `From ${site}` : 'From store') : 'Pasted link'}
    </span>
  )
}

function CartRow({
  line,
  deliveryChoice,
  onUpdateQty,
  onRemove,
  onMoveToWishlist,
}: {
  line: CartLineItem
  deliveryChoice: DeliveryChoice
  onUpdateQty: (id: string, qty: number) => void
  onRemove: (id: string) => void
  onMoveToWishlist: (line: CartLineItem) => void
}) {
  const dual = getDualDeliveryPricing(toPriceableItem(line.product))
  const option = deliveryChoice === 'economy' ? dual.economy : dual.express
  const lineTotal = option.priceLKR * line.qty

  return (
    <div className="flex gap-4 py-6 first:pt-0 last:pb-0">
      <div className="h-[120px] w-[120px] flex-none overflow-hidden rounded-2xl border border-ink/10 bg-white sm:h-20 sm:w-20">
        {line.product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <Image src={line.product.image} alt="" className="h-full w-full object-cover" width={120} height={120} />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink/15">
            <ShoppingBag size={22} strokeWidth={1.3} />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <SourceBadge source={line.product.source ?? 'link'} site={line.product.site} />
            <p className="mt-2 line-clamp-2 text-[15px] font-bold leading-snug text-ink">
              {line.product.title}
            </p>
            <p className="mt-1 text-xs text-ink/45">
              {formatLKR(option.priceLKR)} each · {deliveryChoice === 'economy' ? 'Economy' : 'Express'}
            </p>
          </div>
          <p className="flex-none font-display text-lg font-bold tabular-nums text-ink sm:text-xl">
            {formatLKR(lineTotal)}
          </p>
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center overflow-hidden rounded-full border border-ink/15 bg-white">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onUpdateQty(line.product.id, line.qty - 1)}
              className="grid h-9 w-9 place-items-center text-ink/60 transition-colors hover:bg-card"
            >
              <Minus size={14} />
            </button>
            <span className="w-6 text-center text-sm font-bold tabular-nums text-ink">{line.qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onUpdateQty(line.product.id, line.qty + 1)}
              className="grid h-9 w-9 place-items-center text-ink/60 transition-colors hover:bg-card"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMoveToWishlist(line)}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-ink/50 transition-colors hover:bg-rose-50 hover:text-rose-500"
            >
              <Heart size={13} />
              Save for later
            </button>
            <button
              type="button"
              aria-label="Remove"
              onClick={() => onRemove(line.product.id)}
              className="grid h-9 w-9 place-items-center rounded-full text-ink/35 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DeliveryOption({
  active,
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center gap-3.5 rounded-2xl border-2 px-4 py-4 text-left transition-all sm:px-5 ${
        active ? 'border-teal-deep bg-teal/[0.05]' : 'border-ink/10 bg-card/30 hover:border-ink/20'
      }`}
    >
      <div
        className="grid h-11 w-11 flex-none place-items-center rounded-full"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink/45">{subtitle}</p>
      </div>
      <span
        className={`grid h-5 w-5 flex-none place-items-center rounded-full border-2 transition-colors ${
          active ? 'border-teal-deep bg-teal-deep' : 'border-ink/20 bg-white'
        }`}
      >
        {active && <Check size={11} className="text-white" strokeWidth={3} />}
      </span>
    </button>
  )
}

export default function CartPage() {
  const cart = useCart()
  const wishlist = useWishlist()
  const dashboard = useDashboard()
  const router = useRouter()
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>('economy')
  const [confirming, setConfirming] = useState(false)

  const grandTotalLKR = useMemo(() => {
    return cart.items.reduce((sum, line) => {
      const dual = getDualDeliveryPricing(toPriceableItem(line.product))
      const option = deliveryChoice === 'economy' ? dual.economy : dual.express
      return sum + option.priceLKR * line.qty
    }, 0)
  }, [cart.items, deliveryChoice])

  const { catalogueCount, linkCount } = useMemo(() => {
    let catalogueCount = 0
    let linkCount = 0
    for (const line of cart.items) {
      if (line.product.source === 'catalogue') catalogueCount += line.qty
      else linkCount += line.qty
    }
    return { catalogueCount, linkCount }
  }, [cart.items])

  const pendingRequestCount = dashboard.requests.length

  function handleMoveToWishlist(line: CartLineItem) {
    const wishlistProduct: WishlistProduct = {
      id: line.product.id,
      url: line.product.url,
      site: line.product.site,
      title: line.product.title,
      image: line.product.image,
      currencyCode: line.product.currencyCode,
      price: line.product.sourcePrice,
    }
    wishlist.addItem(wishlistProduct)
    cart.removeItem(line.product.id)
  }

  const handleConfirm = () => {
    if (cart.items.length === 0 || confirming) return
    setConfirming(true)

    const lines = cart.items.map((line) => {
      const dual = getDualDeliveryPricing(toPriceableItem(line.product))
      const option = deliveryChoice === 'economy' ? dual.economy : dual.express
      return {
        name: line.product.title,
        url: line.product.url,
        qty: line.qty,
        unitPriceLKR: option.priceLKR,
        image: line.product.image ?? '',
      }
    })

    dashboard.confirmCartOrder(lines)
    cart.clearCart()
    router.push(pathForView('requests'))
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
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 lg:px-10">
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

      {catalogueCount > 0 && linkCount > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/45">
          <span className="inline-flex items-center gap-1">
            <Store size={11} className="text-teal-deep/60" /> {catalogueCount} from stores
          </span>
          <span className="inline-flex items-center gap-1">
            <Link2 size={11} className="text-gold-deep/60" /> {linkCount} from links
          </span>
        </div>
      )}

      <div className="rounded-3xl border border-ink/10 bg-card/40 px-5 py-1 sm:px-7">
        <div className="divide-y divide-ink/8">
          {cart.items.map((line) => (
            <CartRow
              key={line.product.id}
              line={line}
              deliveryChoice={deliveryChoice}
              onUpdateQty={cart.updateQty}
              onRemove={cart.removeItem}
              onMoveToWishlist={handleMoveToWishlist}
            />
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-ink/10 bg-card/40 p-5 sm:p-7">
        <h2 className="font-display text-lg font-bold text-ink">Choose Delivery Method</h2>
        <p className="mt-0.5 text-xs text-ink/45">
          Delivery arrives in {deliveryChoice === 'economy' ? '3–4 weeks' : '12–15 days'}
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <DeliveryOption
            active={deliveryChoice === 'economy'}
            icon={<Truck size={18} strokeWidth={1.8} />}
            iconBg="rgba(15,118,110,0.12)"
            iconColor="#0f766e"
            title="Economy"
            subtitle="Delivery arrives in 3–4 weeks"
            onClick={() => setDeliveryChoice('economy')}
          />
          <DeliveryOption
            active={deliveryChoice === 'express'}
            icon={<Plane size={18} strokeWidth={1.8} />}
            iconBg="rgba(217,158,0,0.14)"
            iconColor="#b5860a"
            title="Express"
            subtitle="Delivery arrives in 12–15 days"
            onClick={() => setDeliveryChoice('express')}
          />
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-ink/10 bg-card/40 p-5 sm:p-7">
        <div className="flex items-center justify-between text-sm text-ink/45">
          <span>Subtotal ({cart.itemCount} unit{cart.itemCount !== 1 ? 's' : ''})</span>
          <span className="tabular-nums">{formatLKR(grandTotalLKR)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-ink/10 pt-3">
          <span className="text-base font-bold text-ink">Total</span>
          <span className="font-display text-3xl font-extrabold tabular-nums text-ink">
            {formatLKR(grandTotalLKR)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming}
          className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-full bg-teal-deep px-6 py-4 text-sm font-bold tracking-wide text-white transition-all hover:bg-teal-deep/90 active:scale-[0.99] disabled:opacity-60"
        >
          <Lock size={15} />
          {confirming ? 'CONFIRMING…' : 'CONFIRM ORDER'}
          {!confirming && <ArrowRight size={16} />}
        </button>
        <p className="mt-3 text-center text-xs text-ink/40">
          You will not be charged now. This is just a request.
        </p>
      </div>
    </div>
  )
}