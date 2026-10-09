// app/(public)/stores/[platform]/page.tsx
import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchAffiliatedStore, fetchAffiliatedStoreAnyStatus } from '@/lib/supabase/affiliated-stores'
import { canPreviewStore } from '@/lib/store-preview'
import HiddenStoreBanner from '@/components/stores/social/HiddenStoreBanner'
import StoreUnavailable from '@/components/stores/StoreUnavailable'
import StoreCatalogClient from '@/components/stores/StoreCatalogClient'
import SocialStoreClient from '@/components/stores/social/SocialStoreClient'
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd'
import { pageMetadata } from '@/lib/seo'

// generateMetadata and the page both need the store; cache() makes that
// one DB/lookup per request instead of two.
const getLiveStore = cache(fetchAffiliatedStore)

// A hidden store (deactivated / not live yet) is "not found" for shoppers
// and for its own seller. Staff who manage stores see it as a preview.
// A hidden store (deactivated / not live yet): staff and the store's own
// seller see it as a preview; shoppers get a friendly "not open" page.
const getStore = cache(async (platform: string) => {
  const live = await getLiveStore(platform)
  if (live) return { store: live, preview: false as const, viewer: null, unavailable: false }
  const hidden = await fetchAffiliatedStoreAnyStatus(platform)
  if (!hidden) return null
  const viewer = await canPreviewStore(platform)
  return { store: hidden, preview: Boolean(viewer), viewer, unavailable: !viewer }
})

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
  const found = await getStore(platform)
  if (!found) return { title: 'Store not found', robots: { index: false, follow: true } }
  const store = found.store
  if (found.preview || found.unavailable) return { title: found.unavailable ? `${store.name} isn’t open right now` : `Preview: ${store.name}`, robots: { index: false, follow: false } }

  return pageMetadata({
    title: `Shop ${store.name} from Sri Lanka`,
    description:
      store.description ||
      `Browse ${store.name} products and have Wishdrop buy, quality-check, and deliver them to your door in Sri Lanka.`,
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

  const found = await getStore(platform)
  if (!found) notFound()
  const { store, preview, viewer } = found
  if (found.unavailable) return <StoreUnavailable name={store.name} logo={store.logo} kind="paused" />

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Stores', path: '/stores' },
          { name: store.name, path: `/stores/${store.platform}` },
        ])}
      />
      {preview && viewer && <HiddenStoreBanner slug={store.platform} isSocial={store.isSocial} viewer={viewer} />}
      {/* Custom (Instagram / Facebook) sellers get the photo-and-video
          storefront; every other store keeps the standard catalogue page. */}
      {store.isSocial ? <SocialStoreClient store={store} /> : <StoreCatalogClient store={store} />}
    </>
  )
}