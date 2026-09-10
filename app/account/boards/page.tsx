"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Check, ImageOff, LayoutGrid, Plus, X } from "lucide-react"

import { useWishlist, type BoardProduct, type WishlistEntry } from "@/contexts/Wishlistcontext"
import { BoardFolder } from "@/components/boards/board-folder"
import { NewBoardSlot } from "@/components/boards/new-board-slot"

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

function BoardsPageSkeleton() {
  return (
    <>
      <div className="mt-10 flex items-center justify-between">
        <div className="h-6 w-28 animate-pulse rounded bg-ink/[0.06]" />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[272px] w-full max-w-[288px] animate-pulse rounded-2xl bg-ink/[0.04]" />
        ))}
      </div>
    </>
  )
}

export default function BoardsPage() {
  const router = useRouter()
  const wishlist = useWishlist()
  const [boardPendingDelete, setBoardPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [boardPendingAdd, setBoardPendingAdd] = useState<{ id: string; name: string; existingIds: string[] } | null>(
    null,
  )

  const boards = wishlist.boards.slice().sort((a, b) => a.position - b.position)
  const wishlistItems = wishlist.items.slice().sort((a, b) => b.addedAt - a.addedAt)

  // DESIGN PASS: same change as the Wishlist page's "New board" button —
  // no more name-it-first modal. The "+" tile creates an empty, auto-named
  // board immediately and drops you straight into it. Naming happens
  // inline on the board itself; adding items happens via the existing
  // "Add items" action once you're there.
  const handleQuickCreateBoard = () => {
    const board = wishlist.createBoard('', [])
    router.push(`/account/boards/${board.id}`)
  }

  const handleConfirmDelete = () => {
    if (!boardPendingDelete) return
    wishlist.deleteBoard(boardPendingDelete.id)
    setBoardPendingDelete(null)
  }

  const handleAddItems = (selectedIds: string[]) => {
    if (!boardPendingAdd) return
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

    selectedProducts.forEach((product) => {
      wishlist.addItemToBoard(boardPendingAdd.id, product)
    })

    setBoardPendingAdd(null)
  }

  if (!wishlist.hydrated) {
    return (
      <div className="mx-auto max-w-6xl px-6 pb-16 lg:px-10">
        <BoardsPageSkeleton />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 lg:px-10">
      <div className="mt-10 flex items-end justify-between">
        <div>
          {/* DESIGN PASS: was a plain sans-serif heading — every other
              page-level title in the app (Hello, My Orders, Track your
              order, My Wishlist) uses font-display, so this one stood out
              as slightly off-brand next to them. */}
          <h1 className="font-display text-xl text-ink sm:text-2xl">My Boards</h1>
          <p className="mt-1 text-[13px] text-ink/40">
            Group saved items by occasion, outfit, or gift list.
          </p>
        </div>
      </div>

      {/* gap-y is intentionally larger than gap-x: BoardFolder cards let their
          image stack peek up above the card edge on hover, so single-column
          mobile layouts need extra vertical room between rows or the peeking
          artwork visually collides with the card above it. */}
      <div className="mt-8 grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.05, ease: EASE_OUT_EXPO }}
          className="flex justify-center sm:block"
        >
          <NewBoardSlot onClick={handleQuickCreateBoard} />
        </motion.div>

        {boards.map((board, idx) => (
          <motion.div
            key={board.id}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{
              duration: 0.25,
              delay: Math.min(idx * 0.03, 0.3) + 0.05,
              ease: EASE_OUT_EXPO,
            }}
            className="flex justify-center sm:block"
          >
            <BoardFolder
              name={board.name}
              items={board.items}
              onClick={() => router.push(`/account/boards/${board.id}`)}
              onAddItems={() =>
                setBoardPendingAdd({
                  id: board.id,
                  name: board.name,
                  existingIds: board.items.map((item) => item.id),
                })
              }
              onDelete={() => setBoardPendingDelete({ id: board.id, name: board.name })}
            />
          </motion.div>
        ))}
      </div>

      {boards.length === 0 && <WhyBoardsExplainer onCreateFirstBoard={handleQuickCreateBoard} />}

      <DeleteBoardModal
        board={boardPendingDelete}
        onCancel={() => setBoardPendingDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      <AddItemsModal
        board={boardPendingAdd}
        wishlistItems={wishlistItems}
        onClose={() => setBoardPendingAdd(null)}
        onAdd={handleAddItems}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// "Why Boards?" explainer — first-time users land on an empty grid with
// just a "+" tile and no idea what a board actually is or why they'd
// want one. Mirrors the "Heart It." explainer at the bottom of the
// Wishlist page: a short pitch, a perks list, and a visual example —
// rather than a single line of gray helper text. Only shown when there
// are no boards yet; once someone has made one, they already get it.
// ---------------------------------------------------------------------------

function WhyBoardsExplainer({ onCreateFirstBoard }: { onCreateFirstBoard: () => void }) {
  return (
    <div className="mt-12">
      <div className="border-t border-ink/10" />

      <div className="mt-10 flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl text-ink">Why Boards?</h2>
          <p className="mt-2 max-w-sm text-sm text-ink/55">
            Your wishlist is everything you've saved. Boards let you group that into smaller,
            themed collections — so it stays useful instead of turning into one long list.
          </p>
          <ul className="mt-4 flex flex-col gap-2 text-sm text-ink/70">
            <li
              className="flex items-center gap-2 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
              style={{ animationDelay: '80ms' }}
            >
              <LayoutGrid size={13} className="text-teal-deep" />
              Group items by trip, outfit, or occasion
            </li>
            <li
              className="flex items-center gap-2 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
              style={{ animationDelay: '160ms' }}
            >
              <Plus size={13} className="text-teal-deep" />
              Add items from your wishlist anytime, not just when it's created
            </li>
            <li
              className="flex items-center gap-2 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
              style={{ animationDelay: '240ms' }}
            >
              <X size={13} className="text-teal-deep" />
              Rename or delete a board whenever your plans change
            </li>
          </ul>

          <button
            type="button"
            onClick={onCreateFirstBoard}
            className="mt-5 flex items-center gap-1.5 rounded-full bg-teal-deep px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <Plus size={14} />
            Create your first board
          </button>
        </div>

        <BoardExampleCard />
      </div>
    </div>
  )
}

// A stand-in board — not a real BoardFolder (which expects real board
// data/images), just enough visual shorthand to show what one looks like:
// a folder-style card, a name, an item count, and a few tinted squares
// peeking out like photos, using the app's own accent colors instead of
// placeholder imagery that might not exist in every environment.
function BoardExampleCard() {
  return (
    <div className="w-full max-w-[240px] flex-none rounded-2xl border border-ink/10 bg-card p-4 motion-safe:[animation:floatSlow_5s_ease-in-out_infinite]">
      <div className="relative flex h-28 items-end justify-center gap-1.5 rounded-xl bg-ink/[0.03] p-3">
        <div className="h-16 w-14 rounded-lg bg-teal/20" />
        <div className="h-20 w-14 rounded-lg bg-gold/25" />
        <div className="h-16 w-14 rounded-lg bg-indigo/15" />
        <span className="absolute right-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
          Example
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-ink">Summer Trip</p>
      <p className="text-xs text-ink/45">3 items</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add items to an existing board
// ---------------------------------------------------------------------------

function AddItemsModal({
  board,
  wishlistItems,
  onClose,
  onAdd,
}: {
  board: { id: string; name: string; existingIds: string[] } | null
  wishlistItems: WishlistEntry[]
  onClose: () => void
  onAdd: (selectedIds: string[]) => void
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  if (!board) return null

  const existingSet = new Set(board.existingIds)
  const availableItems = wishlistItems.filter((item) => !existingSet.has(item.id))

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleClose = () => {
    setSelectedIds([])
    onClose()
  }

  const handleAdd = () => {
    onAdd(selectedIds)
    setSelectedIds([])
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40" onClick={handleClose} />

      <div
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-card shadow-[0_8px_30px_rgba(32,36,43,0.15)] sm:max-w-lg sm:rounded-2xl"
        style={{ border: "1px solid rgba(32, 36, 43, 0.08)" }}
      >
        <div className="flex items-center justify-between border-b border-ink/[0.06] px-5 py-4">
          <h2 className="font-display text-lg text-ink">Add items to “{board.name}”</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={handleClose}
            className="grid h-8 w-8 place-items-center rounded-md text-ink/40 transition-colors hover:bg-ink/[0.08] hover:text-ink/70"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {availableItems.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink/40">
              Everything in your wishlist is already on this board.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {availableItems.map((item) => {
                const checked = selectedIds.includes(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleSelected(item.id)}
                    className={`flex items-center gap-3 rounded-xl border px-2 py-2 text-left transition-colors ${
                      checked ? "border-teal/50 bg-teal/10" : "border-transparent hover:bg-ink/[0.04]"
                    }`}
                  >
                    <span
                      className={`grid h-5 w-5 flex-none place-items-center rounded-md border transition-colors ${
                        checked ? "border-teal-deep bg-teal-deep text-white" : "border-ink/20 bg-card"
                      }`}
                    >
                      {checked && <Check size={13} />}
                    </span>
                    <span className="h-10 w-10 flex-none overflow-hidden rounded-lg border border-ink/10 bg-ink/[0.02]">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image} alt={item.title} className="h-full w-full object-contain p-1" />
                      ) : (
                        <div className="grid h-full w-full place-items-center">
                          <ImageOff size={14} className="text-ink/15" />
                        </div>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink/80">{item.title}</p>
                      {item.price && (
                        <p className="text-xs text-ink/40">
                          {item.currencyCode ?? ""} {item.price}
                        </p>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/[0.06] px-5 py-4">
          <span className="text-xs text-ink/45">
            {selectedIds.length > 0 ? `${selectedIds.length} item${selectedIds.length === 1 ? "" : "s"} selected` : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 rounded-full text-[13px] text-ink/50 hover:text-ink hover:bg-ink/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={selectedIds.length === 0}
              className="rounded-full bg-teal-deep px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add to board
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

function DeleteBoardModal({
  board,
  onCancel,
  onConfirm,
}: {
  board: { id: string; name: string } | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <AnimatePresence>
      {board && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center" role="dialog" aria-modal="true">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-ink/40"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
            className="relative w-full max-w-sm rounded-2xl bg-card p-5 shadow-[0_8px_30px_rgba(32,36,43,0.15)]"
            style={{ border: "1px solid rgba(32, 36, 43, 0.08)" }}
          >
            <h2 className="font-display text-lg text-ink">Delete board?</h2>
            <p className="mt-1.5 text-[13px] text-ink/50">
              This will permanently delete <span className="font-medium text-ink/70">“{board.name}”</span> and
              remove it from your account. Items already saved in your wishlist won't be affected.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 rounded-full text-[13px] text-ink/50 hover:text-ink hover:bg-ink/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-full bg-red-500 px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Create board modal — REMOVED. The "+" tile now creates an empty,
// auto-named board immediately (see handleQuickCreateBoard above) and
// navigates straight into it, rather than asking for a name/items first.
// ---------------------------------------------------------------------------