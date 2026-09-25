// app/(public)/stores/[platform]/page.tsx
import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchAffiliatedStore } from '@/lib/supabase/affiliated-stores'
import StoreCatalogClient from '@/components/stores/StoreCatalogClient'
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd'
import { pageMetadata } from '@/lib/seo'

// generateMetadata and the page both need the store; cache() makes that
// one DB/lookup per request instead of two.
const getStore = cache(fetchAffiliatedStore)

// No generateStaticParams — sellers are added/edited through the admin
// panel at any time now, so the valid platform list can't be known at
// build time the way the hardcoded affiliatedStores array could. This
// route renders on demand instead.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ platform: string }>
}): Promise<Metadata> {
  const { platform } = await params
  const store = await getStore(platform)
  if (!store) return { title: 'Store not found', robots: { index: false, follow: true } }

  return pageMetadata({
    title: `Shop ${store.name} from Sri Lanka`,
    description:
      store.description ||
      `Browse ${store.name} products and have WishDrop buy, quality-check, and deliver them to your door in Sri Lanka.`,
    path: `/stores/${store.platform}`,
    // Store logos are usually small squares, so the default 1200×630 card
    // stays in place; set a store-specific banner here if you add one.
  })
}

export default async function StoreLandingPage({
  params,
}: {
  params: Promise<{ platform: string }>
}) {
  const { platform } = await params

  const store = await getStore(platform)
  if (!store) notFound()

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Stores', path: '/stores' },
          { name: store.name, path: `/stores/${store.platform}` },
        ])}
      />
      <StoreCatalogClient store={store} />
    </>
  )
}