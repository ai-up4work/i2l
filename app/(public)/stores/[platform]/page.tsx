// app/(public)/stores/[platform]/page.tsx
import { notFound } from 'next/navigation'
import { fetchAffiliatedStore } from '@/lib/supabase/affiliated-stores'
import StoreCatalogClient from '@/components/stores/StoreCatalogClient'

// No generateStaticParams — sellers are added/edited through the admin
// panel at any time now, so the valid platform list can't be known at
// build time the way the hardcoded affiliatedStores array could. This
// route renders on demand instead.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ platform: string }>
}) {
  const { platform } = await params
  const store = await fetchAffiliatedStore(platform)
  if (!store) return {}

  return {
    title: `${store.name} | Shop on WishDrop`,
    description:
      store.description ||
      `Browse ${store.name} products and have WishDrop buy, quality-check, and deliver them to your door in Sri Lanka.`,
  }
}

export default async function StoreLandingPage({
  params,
}: {
  params: Promise<{ platform: string }>
}) {
  const { platform } = await params

  const store = await fetchAffiliatedStore(platform)
  if (!store) notFound()

  return <StoreCatalogClient store={store} />
}