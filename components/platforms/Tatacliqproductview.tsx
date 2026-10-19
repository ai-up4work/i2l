'use client'

// components/platforms/Tatacliqproductview.tsx
//
// Tata CLiQ, on the shared store-view frame (ThemedProductView): CLiQ's
// navy for selections and Add to Bag, its red "FLAT X% OFF" tag and Get
// Quote, navy rating pill, "Sold by" line.

import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ThemedProductView, { type PlatformTheme } from './ThemedProductView'

const TATA_CLIQ: PlatformTheme = {
  logo: 'tatacliq',
  name: 'Tata CLiQ',
  logoWidth: 80,
  logoHeight: 18,
  accent: '#0B1E48',
  accentSoft: '#EEF1F8',
  price: '#0B1E48',
  rating: { kind: 'pill', bg: '#0B1E48' },
  discount: { color: '#E33121', badge: true, format: (p) => `FLAT ${p}% OFF` },
  stock: '#2E7D32',
  primary: { label: 'ADD TO BAG', color: '#0B1E48', icon: 'bag' },
  quote: { color: '#E33121' },
  showSeller: true,
  priceNote: 'Inclusive of all taxes',
}

export default function TataCliqProductView(props: PlatformViewProps) {
  return <ThemedProductView {...props} theme={TATA_CLIQ} />
}
