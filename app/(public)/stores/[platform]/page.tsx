// app/(public)/stores/[platform]/page.tsx
import { notFound } from 'next/navigation'
import { affiliatedStores } from '@/components/dashboard/data'
import StoreCatalogClient from '@/components/stores/StoreCatalogClient'

export function generateStaticParams() {
  return affiliatedStores.map((s) => ({ platform: s.platform }))
}

export default async function StoreLandingPage({
  params,
}: {
  params: Promise<{ platform: string }>
}) {
  const { platform } = await params

  const store = affiliatedStores.find((s) => s.platform === platform)
  if (!store) notFound()

  return <StoreCatalogClient store={store} />
}