# India2Lanka — landing page

A restyled, componentized rebuild of the landing page: Tailwind utility
classes only (no bespoke CSS files), one component per section, and a
design system pulled from postal/customs ephemera instead of a generic
brand palette.

## Design system

| Token | Value | Use |
|---|---|---|
| `ink` | `#1C1A17` | primary text, dark surfaces |
| `paper` | `#F7F3EA` | page background |
| `card` | `#FCFAF5` | raised surfaces |
| `blue` / `blue-deep` | `#1E3A5F` / `#122A47` | secondary ink, dark bands |
| `rust` | `#C1272D` | accent, eyebrows |
| `gold` | `#D98E2B` | primary CTA accent |

**Type:** `Fraunces` (display/headlines, incl. italics), `Inter` (body/UI),
`IBM Plex Mono` (tracking-number style eyebrows/labels). All three load via
`next/font/google` in `app/layout.tsx` — no extra `<link>` tags needed.

**Signature motif:** a repeating diagonal red/blue "airmail" stripe
(inlined as an arbitrary-value gradient in `Header.tsx`) used as the
header's top bar, plus dashed "flight route" and perforated "ticket
stub" details throughout, echoing the parcel-forwarding subject matter
instead of decorating it.

## Tailwind v4

This project uses Tailwind v4, which moved config out of
`tailwind.config.ts` and into CSS. All design tokens (colors, fonts,
shadows) live in the `@theme` block at the top of `app/globals.css` —
there's no separate config file, and no `content` array to maintain
since v4 auto-detects source files. The PostCSS plugin also moved
packages, so `postcss.config.js` points at `@tailwindcss/postcss`
rather than `tailwindcss` directly.

The three `next/font` variables in `app/layout.tsx` are named
`--font-serif-display`, `--font-sans-body`, and `--font-mono-label`
(not `--font-display` etc.) so they don't collide with the
identically-named Tailwind utility variables defined in `@theme`.

## File structure

```
app/
  layout.tsx        fonts + metadata
  page.tsx           landing page, assembles all sections
  account/
    layout.tsx       shared shell: Sidebar + Topbar + banner + item modal + chat button
    page.tsx         /account            Member Centre (home)
    community/
      page.tsx       /account/community  Shopping Community
    requests/
      page.tsx       /account/requests           Buying requests list
      new/page.tsx   /account/requests/new        Add request (paste a link)
      preview/page.tsx /account/requests/preview  Request preview / quote
    shipments/
      page.tsx       /account/shipments          Shipment orders list
      new/page.tsx   /account/shipments/new      Add shipment
    warehouses/page.tsx    /account/warehouses    Warehouse addresses
    bidding/page.tsx       /account/bidding       Bidding requests
    promo-codes/page.tsx   /account/promo-codes   Promo codes
    credits/page.tsx       /account/credits       Credits balance + history
    referrals/page.tsx     /account/referrals     Invite & earn
  api/
    scrape/route.ts  POST endpoint: fetches a product URL, returns name/image/price
  globals.css        Tailwind v4 import + @theme design tokens
components/landing/
  data.ts            all copy/content, typed
  Header.tsx
  Hero.tsx
  SignupCard.tsx
  PromoStrip.tsx
  TopChoices.tsx
  Partners.tsx        uses logo.dev
  Destinations.tsx
  HowItWorks.tsx
  Deals.tsx
  StatsBand.tsx
  Community.tsx
  Testimonials.tsx
  GiftBanner.tsx
  LinkCta.tsx
  Footer.tsx
  ChatButton.tsx
components/dashboard/
  types.ts           every dashboard type: View, Draft, ItemRequest, NavItem, ...
  routes.ts           View <-> URL mapping (pathForView / viewForPath)
  data.ts             nav groups, offers, warehouses, orders, bids, promos, posts, credits, referrals
  Sidebar.tsx          grouped nav, mobile slide-in, active state keyed off `view`
  Topbar.tsx           mobile menu toggle, back button, invite/bell/avatar
  WelcomeBanner.tsx    dismissible phone-verification banner
  HomePage.tsx         greeting, stats (clickable), service cards, exclusive offers
  ServiceCard.tsx      "Parcel forwarding" / "Global shopping" cards
  InfoRail.tsx         official partner card (logo.dev) + info links
  HelpRail.tsx         used on add-request / preview / add-shipment pages
  AddRequestPage.tsx   hero banner + paste-a-link form (triggers auto-scrape)
  ItemInfoModal.tsx    name / image / qty / price entry, shows scrape status
  RequestPreviewPage.tsx  item, promo, fee, and shipping detail cards
  RequestsPage.tsx     tabbed list of buying requests
  RequestCard.tsx      single request card + payment bar
  AddShipmentPage.tsx  declare a parcel arriving at a warehouse
  WarehouseAddressesPage.tsx  per-region address cards with copy-to-clipboard
  ShipmentOrdersPage.tsx      status-coded list of forwarded parcels
  BiddingRequestsPage.tsx     auction items with current bid vs. your max
  PromoCodesPage.tsx          ticket-stub styled promo code list
  ShoppingCommunityPage.tsx   compose box + member post feed
  CreditsPage.tsx             balance, ways to earn, transaction history
  ReferralsPage.tsx           referral link/code, stats, reward tiers, referred friends
contexts/
  DashboardContext.tsx  cross-page state: requests, draft, promo code, scrape status
hooks/
  useProductLookup.ts  client hook wrapping /api/scrape (loading/error/result)
lib/
  logo.ts            logo.dev URL helper
  scrape.ts           server-only: fetches a URL, extracts JSON-LD/OG product data
  quote.ts            calculateQuote() — single source of truth for fee math
  currency.ts          ISO code (USD) -> display symbol (US$) mapping
```

## Dashboard architecture: real routes, not one page with a state machine

Every sidebar destination is now its own URL under `app/account/`, not a
`view` string switched inside one giant client component. This matters in
practice: the browser back/forward buttons work, a page can be linked to
or refreshed directly, and each route's file only contains what that
screen needs.

```
/account                    Member Centre (home)
/account/community          Shopping Community
/account/requests           Buying requests (tabs: Requested, Ready to Pay, ...)
/account/requests/new       Add request — paste a link
/account/requests/preview   Item details, promo code, fee breakdown, quote
/account/shipments          Shipment orders
/account/shipments/new      Add shipment
/account/warehouses         Warehouse addresses (copy-to-clipboard)
/account/bidding            Bidding requests
/account/promo-codes        Promo codes
/account/credits            Credits balance + history
/account/referrals          Invite & earn
```

**`app/account/layout.tsx`** is the one shared shell — Sidebar, Topbar,
the welcome banner, the item-info modal, and the chat button all render
here exactly once, wrapping whichever page is active as `{children}`.
Individual `page.tsx` files are intentionally thin: each one just reads
whatever context/router state it needs and hands it to the matching
presentational component in `components/dashboard/`.

**`contexts/DashboardContext.tsx`** holds the state that has to survive
*navigating between routes* — the in-progress item draft, the committed
requests list, the promo code field, and the scrape loading/error state.
Because it's provided once in `app/account/layout.tsx` (which doesn't
remount on client-side navigation within `/account/*`), a value set on
`/account/requests/new` is still there when the router pushes to
`/account/requests/preview`. Anything that's local to a single screen
(e.g. the "copied!" flash on a warehouse address, the community post
compose box) just uses local `useState` inside that page's component —
it doesn't need to live in the shared context.

**`components/dashboard/routes.ts`** is the single source of truth
mapping each `View` to its URL (`pathForView`) and back (`viewForPath`).
`Sidebar` and `Topbar` navigate/highlight by `View`, so they don't need
to know route strings directly, and the whole URL scheme can be changed
in one file if needed.

Styling follows the same postal design system as the landing page — no
new colors or fonts were introduced here, only the layout/content from
the reference screenshots plus the additional destinations (Shopping
Community, Add shipment, Warehouse addresses, Shipment orders, Bidding
requests, Promo codes, Credits, Referrals) built out as real pages with
mock data in `data.ts`, ready to swap for live API calls.

## Scrollbar

`app/globals.css` styles scrollbars globally (thin, transparent track,
translucent ink thumb that turns rust on hover) via `scrollbar-color` /
`scrollbar-width` (Firefox) and `::-webkit-scrollbar` (Chrome/Safari/Edge)
applied to `*`, so it's consistent everywhere something scrolls — the
account content pane, the desktop sidebar's nav list, any future
`overflow-auto` container — without needing a utility class on each one.

## Mobile navigation: bottom tab bar, not a slide-in sidebar

On screens below the `lg` breakpoint, `components/dashboard/Sidebar.tsx`
is hidden entirely and `components/dashboard/MobileBottomNav.tsx` takes
over — a fixed 5-tab bar (Home / Addresses / Orders / Promo codes /
Account) with a filled icon badge on the active tab. Two new pages exist
purely to make 5 tabs enough to reach everything the full desktop sidebar
can:

- **`OrdersHubPage.tsx`** (`/account/orders`) — "Global shopping" (Buying
  requests, Bidding requests, with a `+` to Add request) and "Parcel
  forwarding" (Manage shipments, with a `+` to Add shipment), plus
  Relevant Information links. This *is* what "Orders" means on mobile.
- **`AccountHubPage.tsx`** (`/account/settings`) — profile summary plus
  a menu to Shopping Community, Credits, Referrals, and Add a shipment,
  with a Log out button. Catches everything that doesn't have its own
  bottom-nav slot.

`Sidebar.tsx` no longer takes `open`/`onClose` props — it's always
either fully hidden (mobile) or fully shown (desktop, `lg:sticky`), so
there's no slide-in state to manage. `Topbar.tsx` lost its hamburger
button for the same reason; its back button is now visible on all screen
sizes instead of desktop-only, since mobile has no other way to step
back out of a flow like the item-request preview.

## Scroll behavior: sidebar and content scroll independently

`app/account/layout.tsx`'s `<main>` is `flex h-screen overflow-hidden` —
pinned to exactly the viewport height, so there's no page-level scroll.
`Sidebar.tsx` is `lg:sticky lg:top-0` with an explicit `h-screen` at every
breakpoint. The content `<section>` gets `overflow-y-auto` and scrolls
entirely on its own — the sidebar's height and position never move
regardless of how tall the current page's content is. (`pb-20 lg:pb-0`
on that same section clears the fixed mobile bottom nav, and the chat
button sits at `bottom-24 lg:bottom-6` for the same reason.)

## Automatic price lookup ("paste a link" → filled-in quote)

Pasting a product link on **`/account/requests/new`** does three things
in sequence:

1. `DashboardContext`'s `startItemInfo` opens the item-info modal
   immediately with just the URL filled in, so there's no dead time
   waiting on a network call.
2. `hooks/useProductLookup.ts` POSTs the URL to `/api/scrape` and tracks
   `loading` / `error` / `result` state. `ItemInfoModal` reads that state
   to show a spinner, a "couldn't auto-fill" notice, or a success banner.
3. `app/api/scrape/route.ts` validates the URL (http/https only, and
   blocks localhost/private-IP targets so the endpoint can't be used as
   an open proxy), then calls `lib/scrape.ts` server-side.

## Coupons & Rewards

The sidebar's **Coupons & Rewards** group now has all three destinations
the home page's stats row points at:

- **`/account/promo-codes`** — each code renders as a perforated ticket
  stub (fits the postal motif nicely), with Available/Used/Expired
  states and a copy-to-clipboard button.
- **`/account/credits`** — balance card, a "ways to earn" grid (refer a
  friend, leave a review, complete your profile), and a transaction
  history list.
- **`/account/referrals`** — a copyable referral link/code, share
  buttons, invited/joined/credits-earned stats, reward tiers, and a list
  of referred friends.

The home page shows **0** for both credits and referrals for a fresh
account — `creditTransactions` and `referredFriends` in `data.ts` are
intentionally empty arrays to match, and both pages render a proper
empty state (icon + message) rather than looking broken. Both stat
numbers on the home page, and the "Promo codes" one, are real buttons
that route to their respective pages — see `Stat` inside `HomePage.tsx`.

`lib/scrape.ts` has no site-specific parsers to maintain — it reads the
same structured data search engines and chat-app link previews already
rely on:

1. **JSON-LD `Product` schema** (`offers.price`, `offers.priceCurrency`) — most reliable, most modern storefronts (Shopify, WooCommerce, many custom sites) include this.
2. **Open Graph / product meta tags** (`og:title`, `og:image`, `product:price:amount`, `product:price:currency`) as a fallback.
3. `<title>` as a last-resort name if neither of the above has one.

None of this guarantees a price — some stores render everything via
client-side JavaScript with no structured data, in which case the scrape
returns `null` fields and the person fills the form in by hand, same as
today. Treat every scraped value as a **starting point**, never as final —
that's exactly what `ItemInfoModal`'s success/error banners communicate.

Once a price is in the form (scraped or typed), `lib/quote.ts` is the one
place the fee math lives:

```ts
calculateQuote({ unitPrice: 275, qty: 1 })
// -> { subtotal: 275, localShippingFee: 16, serviceFee: 17.44,
//      estimatedFeeUsd: 308.44, estimatedTotalLkr: 251083 }
```

`RequestPreviewPage` and `ItemInfoModal` both call this instead of
duplicating the formula, so the subtotal shown while editing an item and
the final quote on the preview page can never drift apart. Swap the
constants at the top of `lib/quote.ts` (`EXCHANGE_RATE`,
`SERVICE_FEE_RATE`, `FLAT_LOCAL_SHIPPING_FEE`) for a live FX-rate lookup
and a real rules engine whenever those exist — every caller already goes
through `calculateQuote()`, so nothing downstream needs to change.

**Note on scaling this to production:** `lib/scrape.ts` does a plain
server-side `fetch` + regex/JSON-LD parse, which is fast and dependency-free
but won't execute JavaScript. Sites that render price/title purely
client-side (no SSR, no structured data) will come back empty. If that
turns out to matter for the stores your members actually use, the natural
upgrade path is swapping the body of `scrapeProduct()` for a headless
browser (Playwright) call behind the same function signature — nothing
else in the app needs to change, since every caller goes through
`scrapeProduct()` / `useProductLookup()`.

## Shared components

`components/shared/` holds pieces used by *both* the landing page and the
dashboard — currently just:

- **`PromoCodeCard.tsx`** — the ticket-stub promo code card (tag pill,
  offer text, expiry, and a code/copy stub separated by a perforated
  dashed line). Used by `components/landing/PromoCodesSection.tsx`
  ("Trending Promo Codes", public-facing, no `status`) and
  `components/dashboard/PromoCodesPage.tsx` (member's own codes, adds
  `statusLabel`/`disabled` for Used/Expired codes). Both call sites pass
  their own data shape into the same four core props (`tag`, `title`,
  `code`, `expiresOn`) — see either page for the mapping.

## Partner logos

`components/landing/Partners.tsx` now renders local files via
`next/image` instead of fetching from logo.dev (logo.dev is still used
by `components/dashboard/InfoRail.tsx` for the eBay partner card — the
two aren't linked). Add the actual PNGs to `public/logos/` — see
`public/logos/README.md` for the exact filenames the `partners` array in
`components/landing/data.ts` expects.

## Logo.dev

`components/landing/Partners.tsx` pulls live partner logos through
[logo.dev](https://www.logo.dev):

```ts
logoUrl('ebay.com', { size: 96 })
// -> https://img.logo.dev/ebay.com?size=96
```

Add your own token so requests aren't rate-limited:

```
# .env.local
NEXT_PUBLIC_LOGO_DEV_TOKEN=pk_your_token_here
```

Swap the `partners` array in `data.ts` for any other domain and the logo
updates automatically — no image files to source or host yourself.

## Running it

```bash
npm install
npm run dev
```

This assumes a Next.js 14 App Router project (the `'use client'` directives
and `@/` import alias match that setup). If you're dropping this into a
plain Vite/CRA React app instead, remove `next/font` and `next/link` usage
in `Header.tsx` and `layout.tsx` and swap in your router's equivalents.
