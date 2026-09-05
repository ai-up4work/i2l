// app/wishlist/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Heart, ImageOff, Plus, ShoppingBagIcon, X } from 'lucide-react'

import { useWishlist, type WishlistEntry } from '@/contexts/Wishlistcontext'
import { useCart, type CartProduct } from '@/contexts/Cartcontext'
import { useBoards, type BoardProduct } from '@/contexts/Boardscontext'

const promoItem = { label: 'Layered Pendant Necklace', price: 'US$5.00' }

// ---------------------------------------------------------------------------
// Shared thumbnail — mirrors Header.tsx's ProductThumb: falls back to a
// plain icon tile when there's no image instead of a broken <img>.
// ---------------------------------------------------------------------------

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
// Component
// ---------------------------------------------------------------------------

type Tab = 'items' | 'boards'

export default function WishlistPage() {
  const router = useRouter()
  const wishlist = useWishlist()
  const cart = useCart()
  const boardsCtx = useBoards()

  const [tab, setTab] = useState<Tab>('items')
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // Newest first — same ordering used in Header's preview dropdown/sheet.
  const items = wishlist.items.slice().sort((a, b) => b.addedAt - a.addedAt)
  const boards = boardsCtx.boards

  const addWishlistEntryToBag = (entry: WishlistEntry) => {
    const product: CartProduct = {
      id: entry.id,
      url: entry.url,
      site: entry.site,
      title: entry.title,
      image: entry.image,
      currencyCode: entry.currencyCode,
      sourcePrice: entry.price,
    }
    cart.addItem(product, 1)
  }

  // Confirm callback from the modal: creates the board pre-seeded with
  // whichever wishlist items were checked, then jumps straight into it.
  const handleCreateBoard = (name: string, selectedIds: string[]) => {
    const selectedProducts: BoardProduct[] = items
      .filter((entry) => selectedIds.includes(entry.id))
      .map((entry) => ({
        id: entry.id,
        url: entry.url,
        site: entry.site,
        title: entry.title,
        image: entry.image,
        currencyCode: entry.currencyCode,
        price: entry.price,
      }))

    const board = boardsCtx.createBoard(name, selectedProducts)
    setCreateModalOpen(false)
    router.push(`/account/wishlist/boards/${board.id}`)
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <div className="mt-6 text-center">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">My Wishlist</h1>
      </div>

      {/* Items / Boards tabs */}
      <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-16 border-b border-ink/10">
        <button
          type="button"
          onClick={() => setTab('items')}
          className={`relative pb-3 text-sm font-semibold tracking-wide transition-colors ${
            tab === 'items' ? 'text-ink' : 'text-ink/40 hover:text-ink/60'
          }`}
        >
          ITEMS({items.length})
          {tab === 'items' && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-ink" />}
        </button>
        <button
          type="button"
          onClick={() => setTab('boards')}
          className={`relative pb-3 text-sm font-semibold tracking-wide transition-colors ${
            tab === 'boards' ? 'text-ink' : 'text-ink/40 hover:text-ink/60'
          }`}
        >
          BOARDS({boards.length})
          {tab === 'boards' && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-ink" />}
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ITEMS TAB                                                          */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'items' && (
        <>
          {items.length === 0 ? (
            <>
              <div className="mt-12 flex flex-col items-center text-center">
                <p className="max-w-md text-sm text-ink/55">
                  You currently have nothing saved to your Wishlist. Personalize your shopping
                  experience with your Wishlist.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="mt-5 rounded-none border border-ink px-10 py-3 text-sm font-bold tracking-wide text-ink transition-colors hover:bg-ink hover:text-white"
                >
                  SHOP NOW
                </button>
              </div>

              <div className="mt-12 border-t border-ink/10" />

              {/* Heart It promo */}
              <div className="mt-10 flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-2xl text-ink">Heart It.</h2>
                  <p className="mt-2 text-sm text-ink/55">Store everything you love on one page.</p>
                  <ul className="mt-4 flex flex-col gap-2 text-sm text-ink/70">
                    <li className="flex items-center gap-2">
                      <Heart size={13} fill="currentColor" className="text-ink" />
                      Think about it before purchasing it.
                    </li>
                    <li className="flex items-center gap-2">
                      <Heart size={13} fill="currentColor" className="text-ink" />
                      Get notification about out-of-stock items.
                    </li>
                  </ul>
                </div>

                <div className="w-full max-w-[220px] flex-none rounded-xl border border-ink/10 bg-card p-3">
                  <div className="aspect-square w-full rounded-lg bg-gold/10" />
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-sm font-bold text-ink">{promoItem.price}</span>
                    <Heart size={16} className="text-ink/35" />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {items.map((item) => (
                <WishlistCard
                  key={item.id}
                  item={item}
                  onRemove={() => wishlist.removeItem(item.id)}
                  onAddToBag={() => addWishlistEntryToBag(item)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* BOARDS TAB                                                         */}
      {/* ------------------------------------------------------------------ */}
      {tab === 'boards' && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl bg-ink/[0.04] px-5 py-6 text-left transition-colors hover:bg-ink/[0.06]"
          >
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-ink text-white">
              <Plus size={16} />
            </span>
            <span className="font-semibold text-ink">Create a new board</span>
          </button>

          {boards.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              {boards.map((board) => (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => router.push(`/account/wishlist/boards/${board.id}`)}
                  className="text-left"
                >
                  <BoardThumbGrid items={board.items} />
                  <p className="mt-3 font-display text-base text-ink">{board.name}</p>
                  <p className="mt-0.5 text-sm text-ink/50">
                    {board.items.length} {board.items.length === 1 ? 'Item' : 'Items'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <CreateBoardModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        wishlistItems={items}
        onCreate={handleCreateBoard}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create board modal — name the board, optionally pick wishlist items to
// seed it with. Skipping selection just creates an empty board.
// ---------------------------------------------------------------------------

function CreateBoardModal({
  open,
  onClose,
  wishlistItems,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  wishlistItems: WishlistEntry[]
  onCreate: (name: string, selectedIds: string[]) => void
}) {
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  if (!open) return null

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleCreate = () => {
    onCreate(name.trim(), selectedIds)
    setName('')
    setSelectedIds([])
  }

  const handleClose = () => {
    setName('')
    setSelectedIds([])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40" onClick={handleClose} />

      <div className="relative flex max-h-[85vh] w-full flex-col rounded-t-3xl bg-parchment shadow-xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="font-display text-lg text-ink">Create a new board</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={handleClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink/60 transition-colors hover:bg-ink/5"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="block text-sm font-semibold text-ink">Board name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summer Wishlist"
            className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-teal focus:outline-none"
          />
          <p className="mt-1 text-xs text-ink/45">Leave blank to auto-name it.</p>

          {wishlistItems.length > 0 && (
            <>
              <p className="mt-5 text-sm font-semibold text-ink">
                Add items from your wishlist <span className="font-normal text-ink/45">(optional)</span>
              </p>
              <div className="mt-2 flex flex-col gap-1">
                {wishlistItems.map((item) => {
                  const checked = selectedIds.includes(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleSelected(item.id)}
                      className={`flex items-center gap-3 rounded-xl border px-2 py-2 text-left transition-colors ${
                        checked ? 'border-teal/50 bg-teal/10' : 'border-transparent hover:bg-ink/[0.04]'
                      }`}
                    >
                      <span
                        className={`grid h-5 w-5 flex-none place-items-center rounded-md border transition-colors ${
                          checked ? 'border-teal-deep bg-teal-deep text-white' : 'border-ink/25 bg-white'
                        }`}
                      >
                        {checked && <Check size={13} />}
                      </span>
                      <span className="h-10 w-10 flex-none overflow-hidden rounded-lg border border-ink/10 bg-white">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image} alt={item.title} className="h-full w-full object-contain p-1" />
                        ) : (
                          <div className="grid h-full w-full place-items-center bg-gold/10">
                            <ImageOff size={14} className="text-ink/25" />
                          </div>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                        {item.price && (
                          <p className="text-xs text-ink/50">
                            {item.currencyCode ?? ''} {item.price}
                          </p>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/10 px-5 py-4">
          <span className="text-xs text-ink/50">
            {selectedIds.length > 0 ? `${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'} selected` : ''}
          </span>
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-lg bg-ink px-6 py-2.5 text-sm font-bold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            CREATE BOARD
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Board cover thumbnails
// ---------------------------------------------------------------------------

function BoardThumbGrid({ items }: { items: { image?: string | null; title: string }[] }) {
  const cover = items.slice(-3).reverse() // most recently added, up to 3

  return (
    <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-lg">
      <BoardThumbCell item={cover[0]} />
      <div className="col-span-1 row-span-2">
        <BoardThumbCell item={cover[1]} tall />
      </div>
      <BoardThumbCell item={cover[2]} />
    </div>
  )
}

function BoardThumbCell({ item, tall }: { item?: { image?: string | null; title: string }; tall?: boolean }) {
  if (!item) {
    return <div className={tall ? 'aspect-auto h-full bg-ink/[0.06]' : 'aspect-square bg-ink/[0.06]'} />
  }
  return (
    <div className={`${tall ? 'aspect-auto h-full' : 'aspect-square'} overflow-hidden bg-card`}>
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-ink/[0.06]" />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function WishlistCard({
  item,
  onRemove,
  onAddToBag,
}: {
  item: WishlistEntry
  onRemove: () => void
  onAddToBag: () => void
}) {
  return (
    <div className="group relative flex flex-col rounded-2xl border border-ink/10 bg-card p-3">
      <div className="relative">
        <ProductThumb image={item.image} alt={item.title} />

        <button
          type="button"
          aria-label="Remove from wish list"
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

      {item.price && (
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-ink">
            {item.currencyCode ?? ''} {item.price}
          </span>
        </div>
      )}
    </div>
  )
}