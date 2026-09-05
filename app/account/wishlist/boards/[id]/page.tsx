// app/account/wishlist/boards/[id]/page.tsx
'use client'

import { useParams, useRouter } from 'next/navigation'
import { Heart, ImageOff, Shirt, ShoppingBagIcon } from 'lucide-react'

import { useBoards, type BoardItem } from '@/contexts/Boardscontext'
import { useCart, type CartProduct } from '@/contexts/Cartcontext'

// ---------------------------------------------------------------------------
// Shared thumbnail — same fallback pattern used across Header/Wishlist.
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

export default function BoardDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const boardId = params.id

  const boardsCtx = useBoards()
  const cart = useCart()

  const board = boardsCtx.getBoard(boardId)

  // Board id doesn't exist (bad link, or board was deleted in another tab) —
  // don't crash, just tell the person and send them back.
  if (!board) {
    return (
      <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
        <p className="mt-6 text-sm text-ink/45">
          <button type="button" onClick={() => router.push('/')} className="hover:text-ink/70">
            Home
          </button>{' '}
          /{' '}
          <button type="button" onClick={() => router.push('/wishlist')} className="hover:text-ink/70">
            My Wishlist
          </button>
        </p>

        <div className="mt-16 flex flex-col items-center text-center">
          <Shirt size={40} className="text-ink/25" strokeWidth={1.25} />
          <p className="mt-4 text-lg font-semibold text-ink">Board Not Found</p>
          <p className="mt-2 max-w-md text-sm text-ink/55">
            This board may have been deleted, or the link is no longer valid.
          </p>
          <button
            type="button"
            onClick={() => router.push('/wishlist')}
            className="mt-6 rounded-none bg-ink px-6 py-3 text-sm font-bold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            GO TO WISHLIST
          </button>
        </div>
      </div>
    )
  }

  const items = board.items.slice().sort((a, b) => b.addedAt - a.addedAt)

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
    cart.addItem(product, 1)
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <p className="mt-6 text-sm text-ink/45">
        <button type="button" onClick={() => router.push('/')} className="hover:text-ink/70">
          Home
        </button>{' '}
        /{' '}
        <button type="button" onClick={() => router.push('/wishlist')} className="hover:text-ink/70">
          My Wishlist
        </button>{' '}
        / {board.name}
      </p>

      <h1 className="mt-3 text-center font-display text-2xl uppercase tracking-wide text-ink">
        {board.name} ({items.length})
      </h1>

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
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <BoardItemCard
              key={item.id}
              item={item}
              onRemove={() => boardsCtx.removeItemFromBoard(board.id, item.id)}
              onAddToBag={() => addToBag(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BoardItemCard({
  item,
  onRemove,
  onAddToBag,
}: {
  item: BoardItem
  onRemove: () => void
  onAddToBag: () => void
}) {
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