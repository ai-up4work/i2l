'use client'

// Hands the server's saved pricing settings to the browser, so every
// price computed client-side (cards, cart, checkout) uses exactly the
// numbers the server used. Rendered once in the root layout.
//
// The settings are installed synchronously during render — before any
// child renders — so there's never a first paint with the old defaults.
// See lib/pricing-settings.ts.

import type { ReactNode } from 'react'
import { setPricingSettings, type PricingSettings } from '@/lib/pricing-settings'

export default function PricingSettingsProvider({ settings, children }: { settings: PricingSettings; children: ReactNode }) {
  setPricingSettings(settings)
  return <>{children}</>
}
