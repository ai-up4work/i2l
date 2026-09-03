# WishDrop — landing page

A restyled, componentized rebuild of the landing page: Tailwind utility
classes only (no bespoke CSS files), one component per section, and a
design system built around the brand itself — "wish" (aspirational,
wishlist-driven) meets "drop" (the excitement of international-brand
releases landing in Sri Lanka first) — instead of a generic brand
palette or the earlier postal/customs motif.

## What this product actually is

WishDrop is a **concierge shopping + delivery service**, not a package
forwarder. Customers never ship anything themselves. The flow is:

1. **Select** — the customer either pastes a link to a product from any
   store, or browses/selects a product directly from WishDrop's
   **affiliated Indian stores** inside the app.
2. **We buy it** — WishDrop places the order on the customer's behalf.
3. **We quality-check it** — the product arrives at a WishDrop facility
   in India, where it's inspected before it goes any further.
4. **We ship & deliver** — WishDrop consolidates and ships the item to
   Sri Lanka and delivers it to the customer.

The customer's own involvement stops at "pick the product." Everything
from purchase through QC through final delivery is owned by WishDrop,
not the customer — there is no customer-facing warehouse address to copy,
and no "declare an inbound parcel" step, because the customer never has
possession of the item until it's delivered.

## Brand identity

The name does double duty, and the design system leans into both
halves rather than picking one:

- **"Wish"** — soft, aspirational, wishlist-driven. Carried by the
  Fraunces italic in the wordmark's "ish" and warm, editorial headline
  moments.
- **"Drop"** — the excitement of exclusive releases and new arrivals
  from international brands. Carried by the bold "drop" in the
  wordmark and the teal motion color used across CTAs and links.

**Wordmark:** a continuous teal "W"-swoosh that reads as both a wave and
a search mark, rising into an arrow that resolves the line — "the
wanting, then the arrival," as one unbroken stroke. "ish" sits in gold
Fraunces italic; "drop" sits in bold sans and is the only part of the
lockup that changes color — white on indigo grounds, indigo on light
grounds — so the mark stays legible either way. The swoosh and the gold
"ish" never change. Don't recolor the mark, don't place it on teal (it
disappears), don't squash the proportions.

## Design system

| Token | Value | Use |
|---|---|---|
| `parchment` | `#FBF6EC` | page background, light surfaces |
| `ink` | `#20242B` | primary text on light backgrounds |
| `card` | `#FFFFFF` | raised surfaces — cards, modals, inputs |
| `indigo` | `#08274F` | dark surfaces — header, footer, hero bands, wordmark weight, app-icon tile |
| `indigo-deep` | `#081228` | darkest ground — icon badges on indigo/gold strips, deepest contrast moments |
| `teal` | `#0E8C9C` | motion — CTAs, links, order-progress states, the wordmark's "W" swoosh |
| `teal-deep` | `#0B7280` | hover/active states for teal elements, active nav text |
| `gold` | `#F0A93A` | delight moments only — "new drop" badges, wishlist star, the wordmark's "ish" — never used as a fill or background |
| `gold-deep` | `#C98A2A` | hover/active states for gold elements (e.g. the copy-confirmation check icon) |

**Type:**
- **Fraunces** (light/italic) — display & voice: the "ish" in the
  wordmark, headlines, taglines, and any copy that wants a soft or
  editorial feel. Italic reserved for emotional/tagline moments only.
  Available as `font-display`.
- **Space Grotesk** — UI & body: the "drop" half of the wordmark, all
  app UI, body copy, numbers, prices, order statuses, and buttons.
  Never italicized. Available as `font-body`.

Two families only — there's no third/mono family in the current system.
If a future component needs a monospace treatment (order IDs, SKUs,
tracking numbers), add it deliberately rather than defaulting label
copy into `font-body`.

All fonts load via `next/font/google` in `app/layout.tsx` — no extra
`<link>` tags needed.

**Voice & tone:** plain, warm, and honest — "the way you'd explain it to
a friend or a parent," never logistics jargon in customer-facing copy
("your order left India yesterday," not "shipment status: in transit").
Never promise a date that might slip; if something's delayed, say so
plainly and early. Tagline family:
- Primary — *Wish it. We'll drop it — right at your door.*
- Payment trust — *Pay when it lands. Not before.*
- Pricing trust — *Your wish list, priced in rupees you know.*
- Short form — *Every wish, one drop away.*

**Signature motifs:**
- The teal "W"-swoosh doubles as a search/wave motif — carries into
  loaders, dividers, and section breaks, not just the wordmark.
- A recurring **gold spark** mark — next to "New," on wishlist toggles,
  on product cards when a drop goes live. Because gold is reserved
  strictly for delight moments, it's never used for large surfaces or
  button fills; teal carries CTAs and buttons instead.
- A thin **"drop" ticker/marquee strip** for limited releases or
  countdowns.
- Product cards styled like **gift tags** (rounded corner, small ribbon
  fold).
- A functional **wishlist heart/star toggle** on every product card,
  in gold — reinforces the "wish" half of the brand, not just
  decoratively.
- Indigo sections (footer, dark hero bands, app-icon tile, header) act
  as the "night sky," with gold accents standing in for the moment a
  wish lands.

## Tailwind v4

This project uses Tailwind v4, which moved config out of
`tailwind.config.ts` and into CSS. All design tokens (colors, fonts,
shadows) live in the `@theme` block at the top of `app/globals.css` —
there's no separate config file, and no `content` array to maintain
since v4 auto-detects source files. The PostCSS plugin also moved
packages, so `postcss.config.js` points at `@tailwindcss/postcss`
rather than `tailwindcss` directly.

The two `next/font` variables in `app/layout.tsx` are named
`--font-serif-display` and `--font-sans-body` (not `--font-display`
etc.) so they don't collide with the identically-named Tailwind utility
variables defined in `@theme`.

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
      new/page.tsx   /account/requests/new        Add request (paste a link or pick a product)
      preview/page.tsx /account/requests/preview  Request preview / quote
    orders/
      page.tsx       /account/orders             Order tracking (Ordered → QC → Shipped → Delivered)
    stores/page.tsx        /account/stores        Affiliated store catalog / browse products
    warehouses/page.tsx    /account/warehouses    Warehouse addresses (exists in routes/View, not in navGroups — see "Nav-to-route mapping" below)
    bidding/page.tsx       /account/bidding       Bidding requests
    promo-codes/page.tsx   /account/promo-codes   Promo codes
    credits/page.tsx       /account/credits       Credits balance + history
    referrals/page.tsx     /account/referrals     Invite & earn
  api/
    scrape/route.ts  POST endpoint: fetches a product URL, returns name/image/price
  globals.css        Tailwind v4 import + @theme design tokens
components/landing/
  data.ts            all copy/content, typed
  Header.tsx          indigo header, teal nav/CTA states, gold reserved for badges only
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
components/shared/
  BrandMark.tsx       the wave/ish/drop lockup — "drop" recolors per ground (indigo/light), swoosh + gold "ish" stay fixed
  PromoCodeCard.tsx    gift-tag promo code card, shared by landing + dashboard
components/dashboard/
  types.ts           every dashboard type: View, Draft, ItemRequest, NavItem, ...
  routes.ts           View <-> URL mapping (pathForView / viewForPath)
  data.ts             nav groups, offers, affiliated stores, orders, bids, promos, posts, credits, referrals
  Sidebar.tsx          grouped nav, active state keyed off `view` — see navGroups in data.ts for the exact View each item maps to; nav list uses .nav-scroll + .scrollbar-none (scrolls, no visible scrollbar)
  Topbar.tsx           mobile menu toggle, back button, invite/bell/avatar
  WelcomeBanner.tsx    dismissible phone-verification banner
  HomePage.tsx         greeting, stats (clickable), service cards, exclusive offers
  ServiceCard.tsx      "Buy for me" / "Browse affiliated stores" cards
  InfoRail.tsx         official partner card (logo.dev) + info links
  HelpRail.tsx         used on add-request / preview pages
  AddRequestPage.tsx   hero banner + paste-a-link OR pick-a-product form (triggers auto-scrape)
  ItemInfoModal.tsx    name / image / qty / price entry, shows scrape status
  RequestPreviewPage.tsx  item, promo, fee, and delivery detail cards
  RequestsPage.tsx     tabbed list of buying requests
  RequestCard.tsx      single request card + payment bar
  OrderTrackingPage.tsx      status-coded list of orders (Ordered / QC / Shipped / Delivered)
  StoresPage.tsx              /account/stores — affiliated-store catalog, built from platformLogos
  WarehouseAddressesPage.tsx  /account/warehouses — warehouse address list; not linked from navGroups (see "Nav-to-route mapping")
  BiddingRequestsPage.tsx     auction items with current bid vs. your max
  PromoCodesPage.tsx          gift-tag styled promo code list
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

Every sidebar destination is its own URL under `app/account/`, not a
`view` string switched inside one giant client component. This matters in
practice: the browser back/forward buttons work, a page can be linked to
or refreshed directly, and each route's file only contains what that
screen needs.

```
/account                    Member Centre (home)
/account/community          Shopping Community
/account/requests           Buying requests (tabs: Requested, Ready to Pay, ...)
/account/requests/new       Add request — paste a link or pick a product
/account/requests/preview   Item details, promo code, fee breakdown, quote
/account/orders             Order tracking (Ordered → QC → Shipped → Delivered)
/account/stores             Affiliated store catalog / browse products
/account/bidding             Bidding requests
/account/promo-codes         Promo codes
/account/credits             Credits balance + history
/account/referrals           Invite & earn
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
(e.g. the "copied!" flash on a promo code, the community post compose
box) just uses local `useState` inside that page's component — it
doesn't need to live in the shared context.

**`components/dashboard/routes.ts`** is the single source of truth
mapping each `View` to its URL (`pathForView`) and back (`viewForPath`).
`Sidebar` and `Topbar` navigate/highlight by `View`, so they don't need
to know route strings directly, and the whole URL scheme can be changed
in one file if needed. `pathForView` falls back to `home` and logs a
warning if a `View` has no matching entry, rather than passing
`undefined` to `router.push`.

## Nav-to-route mapping (`View` type)

`Sidebar.tsx` renders `navGroups` from `data.ts`; each item's `view` key
must exist in `viewRoutes` (`routes.ts`) or navigation throws at
runtime. Current mapping:

| Nav label | `View` | Route |
|---|---|---|
| Member Centre | `home` | `/account` |
| Shopping Community | `shoppingCommunity` | `/account/community` |
| Add request | `addRequest` | `/account/requests/new` |
| Affiliated stores | `affiliatedStores` | `/account/stores` |
| Buying requests | `requests` | `/account/requests` |
| Order tracking | `ordersHub` | `/account/orders` |
| Promo codes | `promoCodes` | `/account/promo-codes` |
| My credits | `credits` | `/account/credits` |
| My referrals | `referrals` | `/account/referrals` |

`warehouseAddresses` also exists as a `View` and a route
(`/account/warehouses`, `WarehouseAddressesPage.tsx`) but has no
`navGroups` entry, so it isn't reachable from the sidebar or mobile nav.
Two non-sidebar views (`confirmRequest`, `preview`) are reached via the
requests flow rather than nav, and `account` is reached via Topbar/
`AccountHubPage`, not `navGroups`.

## Order lifecycle: Ordered → QC → Shipped → Delivered

Because WishDrop buys, quality-checks, and ships on the customer's
behalf, every buying request follows one lifecycle rather than a
warehouse-drop-off model:

1. **Requested** — customer submits a link or picks a product from an
   affiliated store; the item-info modal captures name/image/price/qty.
2. **Ready to Pay / Paid** — customer confirms the quote and pays.
3. **Ordered** — WishDrop places the order with the store on the
   customer's behalf.
4. **Quality Check** — the item arrives at a WishDrop facility in India
   and is inspected before onward shipping. This is the step that
   doesn't exist in a pure forwarding model — it's the core of the
   value proposition here (customer satisfaction / defect screening
   before the item leaves the country of origin).
5. **Shipped** — the item is consolidated and shipped to Sri Lanka.
6. **Delivered** — the item reaches the customer in Sri Lanka.

`OrderTrackingPage.tsx` (`/account/orders`) renders this status chain
per order; `RequestsPage.tsx` (`/account/requests`) covers the earlier,
pre-purchase tabs (Requested, Ready to Pay). There is intentionally no
customer-facing "warehouse address" concept anywhere in this flow —
customers never ship anything themselves, so there's nothing for them to
address a package to.

## Scrollbar

`app/globals.css` styles scrollbars globally (thin, transparent track,
translucent teal thumb that deepens on hover) via `scrollbar-color` /
`scrollbar-width` (Firefox) and `::-webkit-scrollbar` (Chrome/Safari/
Edge), applied per-container via the `.nav-scroll` class (e.g. the
account content pane, the mobile nav overlay's scrollable list) so it's
consistent everywhere something scrolls without needing extra utility
classes. `.nav-scroll` also sets `scrollbar-gutter: stable` so content
doesn't shift when a scrollbar appears/disappears.

Where a container needs to scroll but show no scrollbar at all (e.g. the
desktop `Sidebar.tsx` nav list), pair `.nav-scroll` with the
`.scrollbar-none` utility instead — `scrollbar-width: none` (Firefox),
`-ms-overflow-style: none` (legacy Edge/IE), and a hidden
`::-webkit-scrollbar` (Chrome/Safari/Edge Chromium). Both classes live
in `globals.css` rather than styled-jsx so they load with the initial
stylesheet instead of flashing default-then-styled.

## Mobile navigation: bottom tab bar, not a slide-in sidebar

On screens below the `lg` breakpoint, `components/dashboard/Sidebar.tsx`
is hidden entirely and `components/dashboard/MobileBottomNav.tsx` takes
over — a fixed 5-tab bar (Home / Stores / Orders / Promo codes /
Account) with a filled icon badge on the active tab. Two new pages exist
purely to make 5 tabs enough to reach everything the full desktop sidebar
can:

- **`OrdersHubPage.tsx`** (`/account/orders`) — order tracking across
  the full lifecycle (Ordered / QC / Shipped / Delivered) for both
  linked-product requests and affiliated-store purchases, with a `+` to
  Add request, plus Relevant Information links. This *is* what "Orders"
  means on mobile.
- **`AccountHubPage.tsx`** (`/account/settings`) — profile summary plus
  a menu to Shopping Community, Credits, Referrals, and Browse
  affiliated stores, with a Log out button. Catches everything that
  doesn't have its own bottom-nav slot.

`Sidebar.tsx` no longer takes `open`/`onClose` props — it's always
either fully hidden (mobile) or fully shown (desktop, `lg:sticky`), so
there's no slide-in state to manage. `Topbar.tsx` lost its hamburger
button for the same reason; its back button is now visible on all screen
sizes instead of desktop-only, since mobile has no other way to step
back out of a flow like the item-request preview. The landing page's
own `Header.tsx` mobile menu is a separate, full-viewport overlay (see
component notes below) rather than the dashboard's bottom tab bar —
they solve different navigation problems (marketing nav vs. in-app hub).

## Scroll behavior: sidebar and content scroll independently

`app/account/layout.tsx`'s `<main>` is `flex h-screen overflow-hidden` —
pinned to exactly the viewport height, so there's no page-level scroll.
`Sidebar.tsx` is `lg:sticky lg:top-0` with an explicit `h-screen` at every
breakpoint. The content `<section>` gets `overflow-y-auto` and scrolls
entirely on its own — the sidebar's height and position never move
regardless of how tall the current page's content is. (`pb-20 lg:pb-0`
on that same section clears the fixed mobile bottom nav, and the chat
button sits at `bottom-24 lg:bottom-6` for the same reason.)

## Two ways to start a buying request

Pasting a product link *or* selecting a product from an affiliated store
on **`/account/requests/new`** both feed the same downstream flow:

1. `DashboardContext`'s `startItemInfo` opens the item-info modal
   immediately — either with just the pasted URL filled in (link path),
   or pre-filled from the selected store product (catalog path) — so
   there's no dead time waiting on a network call either way.
2. **Link path only:** `hooks/useProductLookup.ts` POSTs the URL to
   `/api/scrape` and tracks `loading` / `error` / `result` state.
   `ItemInfoModal` reads that state to show a spinner, a "couldn't
   auto-fill" notice, or a success banner.
3. **Link path only:** `app/api/scrape/route.ts` validates the URL
   (http/https only, and blocks localhost/private-IP targets so the
   endpoint can't be used as an open proxy), then calls `lib/scrape.ts`
   server-side.
4. **Catalog path:** product data (name/image/price) comes directly from
   the affiliated-store listing in `StoresPage.tsx` / `data.ts` — no
   scrape is needed since WishDrop already has clean data for its own
   partner stores.

Either way, the customer lands in the same `ItemInfoModal` →
`RequestPreviewPage` → quote flow, and the same order then moves through
Ordered → QC → Shipped → Delivered.

## Coupons & Rewards

The sidebar's **Coupons & Rewards** group has all three destinations the
home page's stats row points at:

- **`/account/promo-codes`** — each code renders as a gift-tag style
  card (fits the "wish" motif nicely), with Available/Used/Expired
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
(This only applies to the paste-a-link path — the affiliated-store
catalog path always has clean, pre-verified data.)

Once a price is in the form (scraped, typed, or pulled from the
affiliated-store catalog), `lib/quote.ts` is the one place the fee math
lives:

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
turns out to matter for the stores your members actually paste links
from, the natural upgrade path is swapping the body of `scrapeProduct()`
for a headless browser (Playwright) call behind the same function
signature — nothing else in the app needs to change, since every caller
goes through `scrapeProduct()` / `useProductLookup()`.

## Shared components

`components/shared/` holds pieces used by *both* the landing page and the
dashboard:

- **`BrandMark.tsx`** — the wave/"ish"/drop lockup used in `Header.tsx`
  and the dashboard's mobile overlay header. Takes a `ground` (or
  equivalent) prop so "drop" can render white-on-indigo or
  indigo-on-light depending on where it's placed; the teal swoosh and
  gold "ish" stay fixed either way.
- **`PromoCodeCard.tsx`** — the gift-tag promo code card (tag pill,
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
