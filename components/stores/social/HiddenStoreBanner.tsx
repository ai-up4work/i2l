// components/stores/social/HiddenStoreBanner.tsx
//
// Shown on a hidden store's pages to the people allowed to preview it
// (see lib/store-preview.ts): staff, and the store's own seller.

import Link from 'next/link'
import { EyeOff } from 'lucide-react'

export default function HiddenStoreBanner({
  slug,
  isSocial,
  viewer,
}: {
  slug: string
  isSocial?: boolean
  viewer: 'staff' | 'seller'
}) {
  const manageHref = viewer === 'seller' ? '/seller' : isSocial ? `/admin/catalogues/stores/${slug}` : `/admin/sellers/${slug}`
  return (
    <div className="border-b border-gold/40 bg-gold/15">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm text-ink sm:px-10">
        <EyeOff size={15} className="flex-none text-gold-deep" />
        <span className="font-semibold">{viewer === 'seller' ? 'Your store isn’t live yet.' : 'Preview: this store is hidden.'}</span>
        <span className="text-ink/65">
          {viewer === 'seller'
            ? 'Only you and Wishdrop can see this page. Shoppers will see it once Wishdrop makes your store live.'
            : 'Only staff and the store’s seller can see it.'}
        </span>
        <Link href={manageHref} className="ml-auto font-semibold text-teal-deep underline">
          {viewer === 'seller' ? 'Back to my seller portal' : 'Manage store'}
        </Link>
      </div>
    </div>
  )
}
