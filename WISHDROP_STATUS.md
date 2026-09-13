# WishDrop — real status as of this zip

Calling this "final" would overstate it. Here's exactly what's real and
what's still mock, so nothing gets shipped by assumption.

## Genuinely real (Supabase-backed, verified against your actual schema)

- **Catalogues** (`/admin/catalogues`, `/admin/catalogues/[catalogueId]`) —
  real `products`/`sellers` queries, margin-only edit, soft delete.
- **Sellers admin** (`/admin/sellers`, `/admin/sellers/[sellerId]`) —
  including the seller-login provisioning panel and the "Add manual
  store" shortcut on the catalogues page.
- **Seller portal** (`/seller/login`, `/seller/products`) — self-service
  product CRUD, fixed from the route-group/redirect-loop bug.
- **Cart, Wishlist, Recently Viewed, Loyalty** (`contexts/Cartcontext.tsx`,
  `Wishlistcontext.tsx`, `RecentlyViewedContext.tsx`, `Loyaltycontext.tsx`)
  — real Supabase sync, with the one-time-sync-guard bug fixed in all
  four so a later empty-local-state doesn't get stuck ignoring the DB.
- **My Orders + Track Order** (`contexts/Ordercontexts.tsx`) — real
  `orders`/`order_items`/`product_snapshots`/`addresses` fetch.
- **Cart checkout** (`app/account/cart/page.tsx` + `DashboardContext`'s
  `confirmCartOrder`) — writes a real `orders` + `order_items` row.
- **Add Request flow** (`DashboardContext`'s `confirmRequest`) — priced
  items become a real order; unpriced items become a real `requests` +
  `chat_threads` row.
- `lib/supabase/types.ts` — hand-written real Database types for all 44
  tables in your schema (not a substitute for `supabase gen types`, but
  real column names/shapes instead of `any`).

## Known gaps introduced/left open during this pass

- **No shipping address is collected on checkout.** `orders.recipient_address_id`
  is left null — the cart form doesn't collect a street address at all
  today, only country/city/state/zip. Wiring this to the real
  `addresses` table (or letting the customer pick a saved one) is a
  separate, undone feature.
- **A confirmed Channel-3 request (no price, needs a manual quote) has
  nowhere to show up.** It writes correctly to `requests`, but there's no
  "my pending requests" page yet, so the customer gets redirected to
  Orders where it won't appear until an admin quotes it and it becomes a
  real order.
- **Order number generation is a client-side random retry loop**
  (`WD-#####`, retried on collision), not a DB sequence. Fine at low
  volume, worth a real Postgres sequence/function later.
- The one thing that's structurally *not fixable from app code*: clearing
  browser storage via DevTools without reloading the page can't be
  detected by any JS — browsers don't fire a `storage` event in the same
  tab that made the change. A real reload (new device, cleared browser
  data, private mode) already restores correctly; that's a browser
  limitation, not a bug.

## Still fully mock — not touched in this pass

**Account pages:** boards, community, my-following, credits, promo-codes,
coupons, gift-card, wallet, points, referrals, messages (+ serviceRecords),
wishdrop-vip.

**Admin (all of it):** orders queue, dashboards (common/manager/sales),
chat, requests intake, staff + warehouses, reports, warehouse queue pages
(qc/pack-label/export-bin/in-transit/shipped), purchases, scrape-health,
discounts, collections, settings. Almost all of this runs off one shared
mock context, `contexts/AdminDataContext.tsx` — that's the next real
lever to pull for the admin side, the same way `Ordercontexts.tsx` was
for the customer side.

**Super-admin:** all 18 pages — analytics, audit log, roles, settings,
staff. Untouched.

**Also still open, unrelated to any specific page:** no staff-role
gating anywhere in `/api/admin/**` (every route checks "is someone
logged in," not "is this a Manager") — that needs solving before the
admin panel is exposed beyond your own team, regardless of which pages
get real data next.
