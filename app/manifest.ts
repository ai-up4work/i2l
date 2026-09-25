// app/manifest.ts
//
// Served at /manifest.webmanifest; Next adds <link rel="manifest"> to every
// page automatically. Icon/screenshot paths come from lib/seo.ts — replace
// the placeholder files in /public, not these paths.

import type { MetadataRoute } from 'next'
import { PWA_ICONS, PWA_SCREENSHOTS, SITE } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.shortName,
    description: SITE.description,
    lang: 'en-LK',
    dir: 'ltr',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'portrait',
    theme_color: SITE.themeColor,
    background_color: SITE.backgroundColor,
    categories: ['shopping', 'lifestyle', 'business'],
    prefer_related_applications: false,
    icons: [
      { src: PWA_ICONS.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: PWA_ICONS.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: PWA_ICONS.maskable192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: PWA_ICONS.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    screenshots: [
      {
        src: PWA_SCREENSHOTS.wide,
        sizes: '1280x720',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Browse Indian stores and see the delivered price in rupees',
      },
      {
        src: PWA_SCREENSHOTS.narrow,
        sizes: '750x1334',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Track your order from purchase to your door',
      },
    ],
    // Long-press the app icon (Android) / right-click (desktop) menu.
    shortcuts: [
      {
        name: 'Browse stores',
        short_name: 'Stores',
        description: 'Shop affiliated Indian stores',
        url: '/stores?source=pwa-shortcut',
        icons: [{ src: PWA_ICONS.shortcutStores, sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Request a product',
        short_name: 'Request',
        description: 'Paste a link and we buy it for you',
        url: '/account/requests/new?source=pwa-shortcut',
        icons: [{ src: PWA_ICONS.shortcutRequest, sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Track my orders',
        short_name: 'Orders',
        description: 'See where your orders are',
        url: '/account/orders/track?source=pwa-shortcut',
        icons: [{ src: PWA_ICONS.shortcutOrders, sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'My cart',
        short_name: 'Cart',
        url: '/account/cart?source=pwa-shortcut',
        icons: [{ src: PWA_ICONS.shortcutCart, sizes: '96x96', type: 'image/png' }],
      },
    ],
  }
}
