// app/account/boards/[id]/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Check,
  Heart,
  ImageOff,
  Minus,
  Plus,
  Share2,
  Shirt,
  ShoppingBagIcon,
  X,
} from 'lucide-react'

import { useWishlist, type BoardItem } from '@/contexts/Wishlistcontext'
import { useCart, type CartProduct } from '@/contexts/Cartcontext'

function ProductThumb({ image, alt }: { image?: string | null; alt: string }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-ink/10 bg-card">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={alt} className="h-full w-full object-contain p-2" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gold/10">
          <ImageOff className="h-7 w-7 text-teal-deep/40" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton — mirrors this page's actual shape: centered title, the
// toolbar row (item-count text + Share/Add-all buttons), then the item
// grid, each card matching BoardItemCard's layout.
// ---------------------------------------------------------------------------

function BoardDetailPageSkeleton() {
  return (
    <>
      <div className="mt-6 flex flex-col items-center gap-2">
        <div className="h-7 w-56 animate-pulse rounded bg-ink/10" />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink/[0.04] px-4 py-3">
        <div className="h-4 w-40 animate-pulse rounded bg-ink/10" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 animate-pulse rounded-lg bg-ink/10" />
          <div className="h-9 w-36 animate-pulse rounded-lg bg-ink/10" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex flex-col rounded-2xl border border-ink/10 bg-card p-3">
            <div className="aspect-square w-full animate-pulse rounded-xl bg-ink/10" />
            <div className="mt-2.5 h-3.5 w-4/5 animate-pulse rounded bg-ink/10" />
            <div className="mt-1.5 h-3.5 w-1/2 animate-pulse rounded bg-ink/10" />
            <div className="mt-2 h-5 w-16 animate-pulse rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </>
  )
}

export default function BoardDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const boardId = params.id

  const wishlist = useWishlist()
  const cart = useCart()

  const [shareOpen, setShareOpen] = useState(false)
  const [lastResult, setLastResult] = useState<{ added: number; skipped: number } | null>(null)

  const board = wishlist.getBoard(boardId)

  // Still loading from storage — show a skeleton rather than a premature
  // "Board Not Found", since `board` will read as undefined until hydrated.
  if (!wishlist.hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
        <BoardDetailPageSkeleton />
      </div>
    )
  }

  if (!board) {
    return (
      <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
        <div className="mt-16 flex flex-col items-center text-center">
          <Shirt size={40} className="text-ink/25" strokeWidth={1.25} />
          <p className="mt-4 text-lg font-semibold text-ink">Board Not Found</p>
          <p className="mt-2 max-w-md text-sm text-ink/55">
            This board may have been deleted, or the link is no longer valid.
          </p>
          <button
            type="button"
            onClick={() => router.push('/account/boards')}
            className="mt-6 rounded-none bg-ink px-6 py-3 text-sm font-bold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            GO TO BOARDS
          </button>
        </div>
      </div>
    )
  }

  const items = board.items.slice().sort((a, b) => a.position - b.position)

  const addToBag = (item: BoardItem) => {
    const product: CartProduct = {
      id: item.id,
      url: item.url,
      site: item.site,
      title: item.title,
      image: item.image,
      currencyCode: item.currencyCode,
      sourcePrice: item.price,
    }
    cart.addItem(product, item.quantity ?? 1)
  }

  const handleAddAllToCart = () => {
    const result = wishlist.addBoardToCart(board.id, (item) => {
      try {
        addToBag(item)
        return true
      } catch {
        return false
      }
    })
    setLastResult({ added: result.added.length, skipped: result.skipped.length })

    if (result.added.length > 0) {
      router.push('/cart')
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-2xl uppercase tracking-wide text-ink">
          {board.name} ({items.length})
        </h1>
        {board.description && <p className="max-w-md text-sm text-ink/55">{board.description}</p>}
      </div>

      {items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <Shirt size={40} className="text-ink/25" strokeWidth={1.25} />
          <p className="mt-4 text-lg font-semibold text-ink">This Board is Empty</p>
          <p className="mt-2 max-w-md text-sm text-ink/55">
            Add your favourite items to a Board by selecting on the Wishlist page or clicking the
            heart button of the details page.
          </p>
          <button
            type="button"
            onClick={() => router.push('/wishlist')}
            className="mt-6 rounded-none bg-ink px-6 py-3 text-sm font-bold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            GO TO WISHLIST TO ADD ITEMS
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink/[0.04] px-4 py-3">
            <div className="text-sm text-ink/60">
              {lastResult
                ? `${lastResult.added} added to bag${lastResult.skipped ? `, ${lastResult.skipped} unavailable` : ''}.`
                : `${items.length} ${items.length === 1 ? 'item' : 'items'} in this board`}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
              >
                <Share2 size={14} />
                Share
              </button>
              <button
                type="button"
                onClick={handleAddAllToCart}
                className="flex items-center gap-1.5 rounded-lg bg-ink px-5 py-2 text-sm font-bold tracking-wide text-white transition-opacity hover:opacity-90"
              >
                <ShoppingBagIcon size={14} />
                ADD ALL TO CART
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {items.map((item) => (
              <BoardItemCard
                key={item.id}
                item={item}
                onRemove={() => wishlist.removeItemFromBoard(board.id, item.id)}
                onAddToBag={() => addToBag(item)}
                onQuantityChange={(qty) => wishlist.updateItemQuantity(board.id, item.id, qty)}
              />
            ))}
          </div>
        </>
      )}

      <ShareBoardModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        board={board}
        onGenerateLink={() => wishlist.generateShareLink(board.id)}
        onRevoke={() => wishlist.revokeShareLink(board.id)}
      />
    </div>
  )
}

function BoardItemCard({
  item,
  onRemove,
  onAddToBag,
  onQuantityChange,
}: {
  item: BoardItem
  onRemove: () => void
  onAddToBag: () => void
  onQuantityChange: (quantity: number) => void
}) {
  const quantity = item.quantity ?? 1

  return (
    <div className="group relative flex flex-col rounded-2xl border border-ink/10 bg-card p-3">
      <div className="relative">
        <ProductThumb image={item.image} alt={item.title} />

        <button
          type="button"
          aria-label="Remove from board"
          onClick={onRemove}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-teal-deep shadow-sm transition-colors hover:bg-white"
        >
          <Heart size={15} fill="currentColor" />
        </button>

        <button
          type="button"
          aria-label={`Add ${item.title} to bag`}
          onClick={onAddToBag}
          className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-ink text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <ShoppingBagIcon size={14} />
        </button>
      </div>

      <a href={item.url} className="mt-2.5 line-clamp-2 text-sm font-semibold text-ink hover:underline">
        {item.title}
      </a>

      {item.variant && (
        <p className="mt-0.5 text-xs text-ink/50">
          {item.variant.label}: {item.variant.value}
        </p>
      )}

      {item.price && (
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-ink">
            {item.currencyCode ?? ''} {item.price}
          </span>
          {item.priceAtSave && item.priceAtSave !== item.price && (
            <span className="text-xs text-ink/40 line-through">
              {item.currencyCode ?? ''} {item.priceAtSave}
            </span>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => onQuantityChange(quantity - 1)}
          disabled={quantity <= 1}
          className="grid h-6 w-6 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:bg-ink/5 disabled:opacity-30"
        >
          <Minus size={12} />
        </button>
        <span className="w-4 text-center text-xs font-semibold text-ink">{quantity}</span>
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => onQuantityChange(quantity + 1)}
          className="grid h-6 w-6 place-items-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:bg-ink/5"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}

function ShareBoardModal({
  open,
  onClose,
  board,
  onGenerateLink,
  onRevoke,
}: {
  open: boolean
  onClose: () => void
  board: { id: string; shareToken?: string | null }
  onGenerateLink: () => string
  onRevoke: () => void
}) {
  const [copied, setCopied] = useState(false)

  const shareUrl = useMemo(() => {
    if (!board.shareToken) return null
    if (typeof window === 'undefined') return null
    return `${window.location.origin}/board/${board.shareToken}`
  }, [board.shareToken])

  if (!open) return null

  const handleGenerate = () => {
    onGenerateLink()
    setCopied(false)
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard permissions can fail silently — not worth surfacing an error for
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-t-3xl bg-parchment p-5 shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">Share this board</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink/60 transition-colors hover:bg-ink/5"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-2 text-sm text-ink/55">
          Anyone with this link can view the items in this board.
        </p>

        {shareUrl ? (
          <div className="mt-4 flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink/70"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex-none rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              {copied ? <Check size={14} /> : 'Copy'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerate}
            className="mt-4 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-bold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            GENERATE LINK
          </button>
        )}

        {shareUrl && (
          <button
            type="button"
            onClick={onRevoke}
            className="mt-3 text-xs font-semibold text-red-600 hover:underline"
          >
            Revoke link
          </button>
        )}
      </div>
    </div>
  )
}