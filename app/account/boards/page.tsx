"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Check, ImageOff, X } from "lucide-react"

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
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [boardPendingDelete, setBoardPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [boardPendingAdd, setBoardPendingAdd] = useState<{ id: string; name: string; existingIds: string[] } | null>(
    null,
  )

  const boards = wishlist.boards.slice().sort((a, b) => a.position - b.position)
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
          <h1 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">My Boards</h1>
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
          <NewBoardSlot onClick={() => setCreateModalOpen(true)} />
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

      {boards.length === 0 && (
        <p className="mt-8 max-w-md text-[13px] text-ink/45">
          No boards yet — create one to start grouping items for a trip, an outfit, or a gift list.
        </p>
      )}

      <CreateBoardModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        wishlistItems={wishlistItems}
        onCreate={handleCreateBoard}
      />

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
          <h2 className="text-base font-semibold text-ink">Add items to “{board.name}”</h2>
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
            <h2 className="text-base font-semibold text-ink">Delete board?</h2>
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
// Create board modal
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
  const [name, setName] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  if (!open) return null

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleCreate = () => {
    onCreate(name.trim(), selectedIds)
    setName("")
    setSelectedIds([])
  }

  const handleClose = () => {
    setName("")
    setSelectedIds([])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40" onClick={handleClose} />

      <div
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-card shadow-[0_8px_30px_rgba(32,36,43,0.15)] sm:max-w-lg sm:rounded-2xl"
        style={{ border: "1px solid rgba(32, 36, 43, 0.08)" }}
      >
        <div className="flex items-center justify-between border-b border-ink/[0.06] px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Create a new board</h2>
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
          <label className="block text-[13px] font-medium text-ink/70">Board name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summer Wishlist"
            className="mt-1.5 w-full rounded-lg border border-ink/10 bg-ink/[0.04] px-3 py-2 text-sm text-ink placeholder:text-ink/25 focus:border-teal focus:outline-none"
          />
          <p className="mt-1 text-xs text-ink/30">Leave blank to auto-name it.</p>

          {wishlistItems.length > 0 && (
            <>
              <p className="mt-5 text-[13px] font-medium text-ink/70">
                Add items from your wishlist <span className="font-normal text-ink/30">(optional)</span>
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
            </>
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
              onClick={handleCreate}
              className="rounded-full bg-teal-deep px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-teal"
            >
              Create board
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}