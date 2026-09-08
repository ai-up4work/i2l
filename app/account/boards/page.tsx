'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ImageOff, Plus, X } from 'lucide-react'

import { useWishlist, type BoardProduct, type WishlistEntry } from '@/contexts/Wishlistcontext'

// ---------------------------------------------------------------------------
// Loading skeleton — mirrors this page's actual shape: centered title +
// subtitle, the "create a new board" bar, then the board grid (each tile
// matching BoardThumbGrid's 2-col/tall-middle layout).
// ---------------------------------------------------------------------------

function BoardsPageSkeleton() {
  return (
    <>
      <div className="mt-6 flex flex-col items-center gap-2">
        <div className="h-8 w-40 animate-pulse rounded bg-ink/10 sm:h-9 sm:w-48" />
        <div className="h-3.5 w-full max-w-md animate-pulse rounded bg-ink/10" />
        <div className="h-3.5 w-2/3 max-w-sm animate-pulse rounded bg-ink/10" />
      </div>

      <div className="mt-8">
        <div className="h-[76px] w-full animate-pulse rounded-xl bg-ink/[0.04]" />

        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col">
              <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-lg">
                <div className="aspect-square animate-pulse bg-ink/10" />
                <div className="col-span-1 row-span-2 h-full animate-pulse bg-ink/10" />
                <div className="aspect-square animate-pulse bg-ink/10" />
              </div>
              <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-ink/10" />
              <div className="mt-1.5 h-3.5 w-1/3 animate-pulse rounded bg-ink/10" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export default function BoardsPage() {
  const router = useRouter()
  const wishlist = useWishlist()
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const boards = wishlist.boards.slice().sort((a, b) => a.position - b.position)
  // Wishlist items are still offered as an optional seed when creating a
  // board from this page.
  const wishlistItems = wishlist.items.slice().sort((a, b) => b.addedAt - a.addedAt)

  const handleCreateBoard = (name: string, selectedIds: string[]) => {
    const selectedProducts: BoardProduct[] = wishlistItems
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

    const board = wishlist.createBoard(name, selectedProducts)
    setCreateModalOpen(false)
    router.push(`/account/boards/${board.id}`)
  }

  if (!wishlist.hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
        <BoardsPageSkeleton />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <div className="mt-6 text-center">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">My Boards</h1>
        <p className="mt-2 text-sm text-ink/55">
          Group your saved items by occasion, outfit, or gift list — then share or check out a
          whole board in one go.
        </p>
      </div>

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

        {boards.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <p className="max-w-md text-sm text-ink/55">
              You don't have any boards yet. Create one to start grouping items for a trip, an
              outfit, or a gift list.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => router.push(`/account/boards/${board.id}`)}
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

      <CreateBoardModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        wishlistItems={wishlistItems}
        onCreate={handleCreateBoard}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Board cover thumbnails (inlined here rather than a separate component file)
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
// Create board modal (inlined here rather than a separate component file)
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