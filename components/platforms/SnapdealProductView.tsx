'use client'

// components/platforms/SnapdealProductView.tsx
//
// Snapdeal, on the shared store-view frame (ThemedProductView): Snapdeal
// red for the price, selections and Get Quote, its charcoal Add to Cart,
// red rating pill. Colour/size pickers now show when the scrape has them
// (the old view never rendered variants at all).

import type { PlatformViewProps } from '@/lib/scrape/platform-view-props'
import ThemedProductView, { type PlatformTheme } from './ThemedProductView'

const SNAPDEAL: PlatformTheme = {
  logo: 'snapdeal',
  name: 'Snapdeal',
  logoWidth: 80,
  logoHeight: 18,
  accent: '#E40046',
  accentSoft: '#FDEBF0',
  price: '#E40046',
  rating: { kind: 'pill', bg: '#E40046' },
  discount: { color: '#E40046', format: (p) => `${p}% Off` },
  stock: '#2E7D32',
  primary: { label: 'ADD TO CART', color: '#333333', icon: 'cart' },
  quote: { color: '#E40046' },
  showSeller: true,
}

export default function SnapdealProductView(props: PlatformViewProps) {
  return <ThemedProductView {...props} theme={SNAPDEAL} />
}
