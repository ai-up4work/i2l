// app/page.tsx — the landing page.
//
// A thin server component so the homepage can export metadata (canonical
// URL, social cards). All UI lives in components/landing/HomePageClient.tsx.

import HomePageClient from '@/components/landing/HomePageClient'
import { pageMetadata, SITE } from '@/lib/seo'

export const metadata = pageMetadata({
  title: SITE.name, // renders as the full default title
  description: SITE.description,
  path: '/',
})

export default function Home() {
  return <HomePageClient />
}
