// components/stores/StoreCover.tsx
//
// Shared cover banner for every store page (social + affiliated catalogue).
// Shows the store's cover photo, or a brand-coloured placeholder when the
// store has none, so both layouts look the same from the top of the page.
//
// `actions` is an optional slot pinned to the banner's top-right
// (the catalogue page puts its Bag button there).
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { imageThumb } from '@/lib/media'

export default function StoreCover({
  name,
  cover,
  actions,
  compact = false,
}: {
  name: string
  cover?: string | null
  actions?: ReactNode
  /** A shorter banner (store pages where the content matters more). */
  compact?: boolean
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6">
      <div className={`relative w-full overflow-hidden rounded-3xl bg-indigo ${compact ? 'h-36 sm:h-56 lg:h-72' : 'h-56 sm:h-80 lg:h-[26rem]'}`}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageThumb(cover, 1600)} alt="" className="h-full w-full object-cover object-center" />
        ) : (
          <div
            aria-hidden="true"
            className="h-full w-full bg-[radial-gradient(120%_140%_at_0%_0%,var(--color-teal)_0%,var(--color-indigo)_55%,var(--color-indigo-deep)_100%)]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />

        <nav
          aria-label="Breadcrumb"
          className="absolute left-4 top-3 flex min-w-0 max-w-[60%] items-center gap-1.5 font-body text-[11px] font-medium text-white/85 sm:left-10"
        >
          <Link href="/" className="shrink-0 hover:text-white">
            Home
          </Link>
          <ChevronRight size={10} className="shrink-0" />
          <Link href="/stores" className="shrink-0 hover:text-white">
            Stores
          </Link>
          <ChevronRight size={10} className="shrink-0" />
          <span className="truncate">{name}</span>
        </nav>

        {actions && <div className="absolute right-4 top-3 sm:right-10">{actions}</div>}
      </div>
    </div>
  )
}