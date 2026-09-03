// app/demo/scraper-qa/page.tsx
import { Suspense } from 'react'
import ScraperQaClient from './Scraperqaclient'

// Always live — this page exists to test the scraper against real
// upstream sites right now, so it must never serve a cached run.
export const dynamic = 'force-dynamic'

// useSearchParams() in the client component below opts this route out of
// static rendering, which Next requires to sit behind a Suspense boundary
// (otherwise: "useSearchParams() should be wrapped in a suspense boundary").
// The fallback only flashes for a frame — ScraperQaClient reads the initial
// ?url= synchronously on first client render.
export default function ScraperQaPage() {
  return (
    <Suspense fallback={null}>
      <ScraperQaClient />
    </Suspense>
  )
}