// app/(public)/categories/page.tsx
//
// Shop by category: the same categories as the header's Shop menu
// (lib/store-categories.ts). Picking one filters the stores below to the
// ones that carry it — staff choose a store's categories when they create
// or edit it. /categories?category=<slug> opens with that one selected,
// which is where the header menu and the landing page tiles link.

import Link from 'next/link'
import { CtaEnvelope, PageHero, Section } from '@/components/public/PageKit'
import CategoryStoresClient from '@/components/public/CategoryStoresClient'
import { fetchAffiliatedStores } from '@/lib/supabase/affiliated-stores'
import { findStoreCategory } from '@/lib/store-categories'
import { pageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/categories',
  title: 'Shop by Category | Wishdrop',
  description: 'Browse Wishdrop stores by category — clothing, ethnic wear, jewellery, electronics, beauty and more.',
})

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>
}) {
  const { category } = await searchParams
  const initial = findStoreCategory(Array.isArray(category) ? category[0] : category)?.slug ?? null
  const stores = await fetchAffiliatedStores()

  return (
    <main>
      <PageHero
        eyebrow="Shop by category"
        title="Whatever you’re after,"
        accent="we’ll get it."
        intro={
          <>
            Pick a category to see the{' '}
            <Link href="/stores" className="font-semibold text-teal-deep underline underline-offset-2">
              stores
            </Link>{' '}
            that sell it, or send us a link to anything else.
          </>
        }
      />

      <Section>
        <CategoryStoresClient stores={stores} initialCategory={initial} />
      </Section>

      <CtaEnvelope
        title="Can’t find the"
        accent="right store?"
        text="Categories are a starting point, not a limit. Send us the link to anything from an Indian store."
        primary={{ href: '/account', label: 'Start a request' }}
        secondary={{ href: '/stores', label: 'Browse all stores' }}
      />
    </main>
  )
}
