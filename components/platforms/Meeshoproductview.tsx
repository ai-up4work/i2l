'use client'

// components/platforms/Meeshoproductview.tsx
//
// Meesho, on the shared store-view frame (ThemedProductView): Meesho's
// purple for selections and Add to Cart, its pink for Get Quote, the
// green rating pill and green "% off".
//
// Replaces the old scraper-QA version, which had a permanently disabled
// Add to Cart, no Get Quote and no quantity — so Meesho items couldn't be
// ordered from the item screen — and showed a "source: via ScraperAPI"
// debug line to customers.

import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ThemedProductView, { type PlatformTheme } from './ThemedProductView'

const MEESHO: PlatformTheme = {
  logo: 'meesho',
  name: 'Meesho',
  logoWidth: 70,
  logoHeight: 16,
  accent: '#9F2089',
  accentSoft: '#FCEBFA',
  price: '#333333',
  rating: { kind: 'pill', bg: '#038D63' },
  discount: { color: '#038D63' },
  stock: '#038D63',
  primary: { label: 'ADD TO CART', color: '#9F2089', icon: 'cart' },
  quote: { color: '#F43397' },
  priceNote: 'Inclusive of all taxes',
}

export default function MeeshoProductView(props: PlatformViewProps) {
  return <ThemedProductView {...props} theme={MEESHO} />
}
