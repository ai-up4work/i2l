// app/demo/scraper-qa/page.tsx
import { Suspense } from 'react'
import ScraperQaClient from './Scraperqaclient'
import { fetchAffiliatedStores } from '@/lib/supabase/affiliated-stores'
import {
  affiliatedStores,
  buildScraperTestLinks,
  type AffiliatedStore,
} from '@/data/stores/demo'

// Always live — this page exists to test the scraper against real
// upstream sites right now, so it must never serve a cached run.
export const dynamic = 'force-dynamic'

export default async function ScraperQaPage() {
  // DB sellers are optional extras. If the fetch fails, the static
  // list from demo.ts still renders.
  let dbStores: AffiliatedStore[] = []
  try {
    dbStores = await fetchAffiliatedStores()
  } catch (e) {
    console.error('[scraper-qa] fetchAffiliatedStores failed:', e)
  }

  // Static entries from demo.ts first (they carry sampleProductUrl /
  // sampleProductLabel), then whatever the DB returned. De-duplicated
  // by URL, so the stale marketplace copies coming back from
  // fetchAffiliatedStores() don't create doubles.
  const all = buildScraperTestLinks([...affiliatedStores, ...dbStores])
  const links = [...new Map(all.map((l) => [l.url, l])).values()]

  return (
    <Suspense fallback={null}>
      <ScraperQaClient presetLinks={links} />
    </Suspense>
  )
}