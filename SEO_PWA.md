# WishDrop — SEO & PWA

Everything search engines, social apps, and "install app" prompts read is
driven from one file: **`lib/seo.ts`**. Change site name, description,
keywords, social profiles, colours, or image paths there — nowhere else.

## Replacing the placeholder images

Every image below already exists as a branded placeholder, so nothing
404s today. **To replace one, overwrite the file at the same path with the
same pixel size.** No code changes needed. Larger placeholders are labelled
"PLACEHOLDER" with their path so they're easy to spot if one is missed.

After replacing, browsers may show the old image for up to a day (they are
cached for 24 h, then refreshed in the background). Social apps cache
harder — use the debuggers listed under "Testing" to force a refresh.

### App icons

| File | Size | Used for | Rules |
|---|---|---|---|
| `public/favicon.ico` | 16, 32, 48 (multi-size .ico) | Browser tab | Simple mark, no text |
| `public/icons/favicon-16x16.png` | 16×16 | Browser tab | |
| `public/icons/favicon-32x32.png` | 32×32 | Browser tab, bookmarks | |
| `public/icons/icon-192.png` | 192×192 | Installed app (Android), install card, offline page | Transparent corners allowed |
| `public/icons/icon-512.png` | 512×512 | Installed app, Android splash | Transparent corners allowed |
| `public/icons/icon-maskable-192.png` | 192×192 | Android adaptive icon | **Full-bleed, no transparency.** Keep the logo inside the centre 80% circle — Android crops to circles/squircles. Check at maskable.app |
| `public/icons/icon-maskable-512.png` | 512×512 | Android adaptive icon | Same as above |
| `public/icons/apple-touch-icon.png` | 180×180 | iPhone/iPad home screen | **Opaque, square corners** — iOS rounds them itself |
| `public/icons/shortcut-stores-96.png` | 96×96 | Long-press menu: Browse stores | |
| `public/icons/shortcut-request-96.png` | 96×96 | Long-press menu: Request a product | |
| `public/icons/shortcut-orders-96.png` | 96×96 | Long-press menu: Track my orders | |
| `public/icons/shortcut-cart-96.png` | 96×96 | Long-press menu: My cart | |

### Search & social

| File | Size | Used for | Rules |
|---|---|---|---|
| `public/images/seo/og-default.png` | 1200×630 | Link previews on WhatsApp, Facebook, LinkedIn, iMessage | Keep key text in the centre ~1000×500; under 1 MB |
| `public/images/seo/twitter-card.png` | 1200×630 | Link previews on X/Twitter | Can be the same artwork as og-default |
| `public/images/seo/logo-512.png` | 512×512 | Logo Google shows for the brand | Must look right on a white background |

Product pages automatically use the product's own photo for previews;
these defaults cover every other page.

### Install dialog screenshots

| File | Size | Used for |
|---|---|---|
| `public/images/pwa/screenshot-wide.png` | 1280×720 | Desktop Chrome/Edge install dialog |
| `public/images/pwa/screenshot-narrow.png` | 750×1334 | Android install sheet |

Use real screenshots of the app (e.g. a store page, order tracking). The
captions shown under them are in `app/manifest.ts` → `screenshots[].label`.

### iOS launch screens (`public/images/pwa/splash/`)

Shown for a moment when the app is opened from an iPhone/iPad home screen.
Each must be **exactly** its size or iOS ignores it and shows blank white.
Suggested design: parchment background (`#fbf6ec`) with the logo centred.

| File | Devices |
|---|---|
| `apple-splash-1320x2868.png` | iPhone 16 Pro Max |
| `apple-splash-1206x2622.png` | iPhone 16 Pro |
| `apple-splash-1290x2796.png` | iPhone 14/15 Pro Max, 15/16 Plus |
| `apple-splash-1179x2556.png` | iPhone 14/15 Pro, 15, 16 |
| `apple-splash-1284x2778.png` | iPhone 12/13 Pro Max, 14 Plus |
| `apple-splash-1170x2532.png` | iPhone 12/13/14, 12/13 Pro |
| `apple-splash-1125x2436.png` | iPhone X/XS/11 Pro, 12/13 mini |
| `apple-splash-1242x2688.png` | iPhone XS Max, 11 Pro Max |
| `apple-splash-828x1792.png` | iPhone XR, 11 |
| `apple-splash-750x1334.png` | iPhone SE (2nd/3rd gen), 8 |
| `apple-splash-2048x2732.png` | iPad Pro 12.9" |
| `apple-splash-1668x2388.png` | iPad Pro 11" |
| `apple-splash-1640x2360.png` | iPad Air |
| `apple-splash-1620x2160.png` | iPad 10.2" |

## Things to fill in

In **`lib/seo.ts`**:
- `SITE.contact.email` — support inbox (used in Google's brand data).
- `SITE.social.*` — official profile URLs; blanks are ignored.
- `SITE.twitterHandle` — e.g. `'@wishdrop'`, if you have one.

On **Vercel → Settings → Environment Variables** (all optional):

| Variable | Where to get it |
|---|---|
| `GOOGLE_SITE_VERIFICATION` | Search Console → Add property → HTML tag → the `content` value |
| `BING_SITE_VERIFICATION` | Bing Webmaster Tools → Meta tag → the `content` value |
| `FACEBOOK_DOMAIN_VERIFICATION` | Meta Business → Brand safety → Domains |
| `YANDEX_SITE_VERIFICATION` | Yandex Webmaster (only if needed) |
| `NEXT_PUBLIC_ENABLE_SW_IN_DEV` | Set `true` only to test the service worker on localhost |

`NEXT_PUBLIC_SITE_URL` (already set) must be the real production domain —
every canonical URL and social image URL is built from it.

## What's where

| File | Purpose |
|---|---|
| `lib/seo.ts` | Site identity, image paths, `pageMetadata()` / `noIndexMetadata()` helpers |
| `components/seo/JsonLd.tsx` | Google structured data: Organization, WebSite, BreadcrumbList, Product |
| `app/layout.tsx` | Site-wide defaults, icons, iOS web-app tags, verification, theme colour |
| `app/page.tsx` | Homepage metadata (UI moved to `components/landing/HomePageClient.tsx`) |
| `app/manifest.ts` | PWA manifest → `/manifest.webmanifest` |
| `app/robots.ts` | `/robots.txt` — blocks private areas; blocks everything on preview deploys |
| `app/sitemap.ts` | `/sitemap.xml` — public pages + all active stores, refreshed hourly |
| `app/offline/page.tsx` | Page shown when offline with nothing cached |
| `public/sw.js` | Service worker (caching + offline) |
| `components/pwa/ServiceWorkerRegister.tsx` | Registers the worker; `clearServiceWorkerCaches()` runs on logout |
| `components/pwa/InstallPrompt.tsx` | Floating "Add to home screen" card (Android/desktop button, iOS instructions) |
| `components/pwa/InstallAppButton.tsx` | Account sidebar's **Install app** row — native install dialog where the browser allows it, otherwise instructions |
| `components/pwa/InstallInstructions.tsx` | Per-browser install steps (iPhone/iPad, Mac Safari, Android, Chrome/Edge, Firefox) |
| `lib/pwa/install.ts` | Shared install state: captures the browser's one-time install prompt so every install button can use it |
| `next.config.mjs` → `headers()` | Service-worker headers, image cache rules, `noindex` on private areas |
| `middleware.ts` → `matcher` | Skips SEO/PWA files so they're never delayed by auth |

### Adding a new public page

```ts
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Gift cards',           // " | WishDrop" is added automatically
  description: 'One or two sentences, under ~155 characters.',
  path: '/gift-cards',           // becomes the canonical URL
})
```

Then add the path to `STATIC_ROUTES` in `app/sitemap.ts`. If the page is a
`'use client'` component, put the `metadata` export in a `layout.tsx` next
to it instead (see `app/seller/login/layout.tsx`).

### Private areas

`/account`, `/admin`, `/seller`, `/catalogue`, `/demo`, `/auth`, `/api` are
never indexed and never cached by the service worker (they contain personal
or staff data). If you add a new private top-level area, add it to
`PRIVATE_PATH_PREFIXES` (lib/seo.ts), `NOINDEX_PREFIXES` (next.config.mjs),
and `PRIVATE_PREFIXES` (public/sw.js).

## How the service worker behaves

- Build files (`/_next/static`): cached permanently (filenames change on deploy).
- Images, icons, fonts: served from cache, refreshed in the background.
- Public pages: always tries the network first; falls back to the last
  cached copy, then to `/offline`.
- Private pages, API calls, Supabase, other domains: never touched.
- On logout, cached pages and images are cleared.
- Only runs in production builds.

If you change the caching logic in `public/sw.js`, bump `VERSION` at the
top so old caches are deleted. Normal deploys don't need a bump.

## Testing after deploy

1. **Chrome DevTools → Application → Manifest**: no errors; icons and
   screenshots show. **Service workers**: status "activated and running".
2. **Lighthouse** (DevTools) → run *PWA* / *SEO* categories.
3. **Offline**: DevTools → Network → Offline, reload a visited page (loads
   from cache), then an unvisited one (shows the offline page).
4. **Install**: account sidebar → Install app (Chrome/Edge open the native dialog; Safari shows steps). Or Android Chrome → menu → Install app; iPhone Safari → Share →
   Add to Home Screen (check the icon and launch screen).
5. **Structured data**: search.google.com/test/rich-results on the
   homepage and a product page.
6. **Link previews**: developers.facebook.com/tools/debug (also refreshes
   WhatsApp's cache over time), and paste a link into WhatsApp itself.
7. **Search Console**: verify the domain, then submit
   `https://www.wishdrop.shop/sitemap.xml`.

## Known limits

- The sitemap lists store pages, not individual products — products are
  fetched live from each store, so Google finds them by crawling the store
  pages. Every product page has its own canonical URL and Product data.
- All hardcoded marketplaces in `data/stores/data.ts` are currently
  commented out, so the sitemap's store entries come only from active
  sellers in Supabase.
- The brand fonts in `app/globals.css` aren't wired to `next/font`
  correctly (see earlier review) — unrelated to SEO, but it affects how
  the offline page and install card render.
