// app/demo/scraper-qa/page.tsx
import { Suspense } from 'react'
import ScraperQaClient from './Scraperqaclient'
import { fetchAffiliatedStores } from '@/lib/supabase/affiliated-stores'
import { buildScraperTestLinks } from '@/data/stores/demo'

// Always live — this page exists to test the scraper against real
// upstream sites right now, so it must never serve a cached run.
export const dynamic = 'force-dynamic'

// useSearchParams() in the client component below opts this route out of
// static rendering, which Next requires to sit behind a Suspense boundary
// (otherwise: "useSearchParams() should be wrapped in a suspense boundary").
export default async function ScraperQaPage() {
  // Static marketplaces + active DB sellers that have a sample product set,
  // de-duplicated by URL.
  const all = buildScraperTestLinks(await fetchAffiliatedStores())
  const links = [...new Map(all.map((l) => [l.url, l])).values()]

  return (
    <Suspense fallback={null}>
      <ScraperQaClient presetLinks={links} />
    </Suspense>
  )
}