// app/account/wishlist/boards/[id]/page.tsx
'use client'

import { useRouter } from 'next/navigation'
import { Shirt } from 'lucide-react'

// ---------------------------------------------------------------------------
// Stub — wire this up to your real board/wishlist data.
// ---------------------------------------------------------------------------

type BoardDetailPageProps = {
  boardName?: string
  itemCount?: number
}

export default function BoardDetailPage({
  boardName = 'Board 1123',
  itemCount = 0,
}: BoardDetailPageProps) {
  const router = useRouter()

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
        / {boardName}
      </p>

      <h1 className="mt-3 text-center font-display text-2xl uppercase tracking-wide text-ink">
        {boardName} ({itemCount})
      </h1>

      {itemCount === 0 ? (
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
          {/* Map real board items here once populated. */}
        </div>
      )}
    </div>
  )
}