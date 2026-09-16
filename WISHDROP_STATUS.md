# WishDrop — status as of this zip

Supersedes the WISHDROP_STATUS.md from the previous zip. Same rule as
before: this isn't "done," it's an honest snapshot.

## What changed in this pass

- **Auto-sent chat messages for quote and payment.** Setting (or revising) a quote on `/admin/requests/[requestId]` now automatically messages the customer with the price, so they can confirm before anything is charged. Confirming payment sends its own message too. The order-confirmation message already existed and is unchanged.
- **Fixed the Channel 3 product-photo bug.** An OG-scraped (or now, admin-uploaded) photo was captured on `requests.screenshot_url` but never made it onto the resulting order — `confirmRequestReal` never copied it onto the new `order_items` row, and both the admin and customer order-image mapping (`orders-admin.ts`, `Ordercontexts.tsx`) only ever checked `product_snapshots.image_url` (always null for Channel 3), falling straight through to the hardcoded placeholder. Fixed both: the photo now carries over onto the order, and the image fallback chain is `product snapshot → screenshot → placeholder` everywhere.
- **Added a manual photo-upload option** on `/admin/requests/[requestId]` for when the OG scrape finds no image at all (or the wrong one) — uses the previously-unused `products` upload folder. Whatever's set there is what the order uses; a placeholder shows until then.

## What changed two passes ago

- **Fixed the real chat-threading bug**: `DashboardContext.confirmRequest`
  was inserting a brand-new `chat_threads` row on every Channel 3 request
  instead of reusing the customer's existing thread — that's why admin
  saw the same customer several times in `/admin/chat`, and why a
  customer's chat view could appear to "lose" older messages once a
  newer per-request thread became the most-recently-active one. Now
  reuses the customer's one thread via `getOrCreateGeneralThread`;
  per-request context still lives on `chat_messages.request_id`.
- **Added Channel 3 payment confirmation** to `/admin/requests/[requestId]`:
  new `payment_amount`/`payment_method`/`payment_reference`/
  `payment_confirmed_at`/`payment_confirmed_by` columns on `requests`
  (see `data/wishdrop-requests-payment-confirmation.sql`), a "Payment"
  panel on the request detail page, and `confirmRequestReal` now refuses
  to create the order until payment is on record.
- **Implemented the delete policy that was previously just a comment**:
  added `permissions.canDelete` (Manager only) to `AdminDataContext`,
  wired a real "Delete order" action on `/admin/orders/[orderId]`, and a
  real "Delete" action (alongside the existing Deactivate) on
  `/admin/sellers/[sellerId]` with a new `DELETE` handler on
  `/api/admin/sellers/[platform]`. That endpoint refuses to delete a
  seller that still has product listings, since `products.seller_id`
  cascade-deletes and an unguarded delete would silently wipe the
  seller's whole catalogue with it.
- **Dropped the order age / SLA-breach page from the spec.** Nothing was
  ever actually built at `orders/[orderId]/age` or a sibling `orders/age`
  — removed from both route-spec docs rather than left as an open
  nesting question.
- Confirmed (no code change needed) that delivery confirmation already
  matches the intended policy: `confirmDelivery` is warehouse/manager-
  manual, not customer-self-confirm or carrier-API — a Manager or
  Warehouse account checks in with the customer over chat/WhatsApp and
  marks the order Delivered once they confirm.

## What changed in the previous pass

- **Fixed a real crash**: `app/account/cart/page.tsx` had no default
  export at all (a rename left `CartPage` orphaned) — "The default export
  is not a React Component," 500 on every visit. Fixed.
- **Fixed the seller-login redirect loop**: `app/(seller)/...` was a route
  *group* (no `/seller` URL prefix) with the auth-gating layout wrapping
  its own login page — every visit to login re-triggered the "not logged
  in, redirect to login" check. Restructured to `app/seller/(dashboard)/`
  (gate only the dashboard) + `app/seller/login/` (public). Also fixed two
  imports that only worked once the layout moved to the right level.
- **Fixed a real data-loss-looking bug**: `Cartcontext.tsx`,
  `Wishlistcontext.tsx`, `RecentlyViewedContext.tsx`, and
  `Loyaltycontext.tsx` all had a "sync from DB once per session" guard
  that, once satisfied, never checked the database again for the rest of
  the session — even if local state later ended up empty. Fixed in all
  four. (Real reloads always worked; this fixed the narrower case of local
  storage getting cleared without a full page reload.)
- **Admin chat page** (`/admin/chat`) was a literal WhatsApp-dark-theme
  clone with its own redundant icon rail, ignoring that it's embedded in
  the admin shell's own sidebar. Restructured to a stacked layout
  (horizontal conversation-card strip on top, thread below) using the
  app's real design tokens (`parchment`/`card`/`ink`/`teal-deep`/`gold`
  from `app/globals.css`), not WhatsApp's palette.
- **Marketplaces**: added Myntra, eBay, AliExpress, Tata CLiQ, Nykaa,
  Ajio, and HopScotch as hardcoded entries in `data/stores/data.ts`
  (`marketplaceStores`, deliberately NOT database rows — a marketplace
  needs a code change to add regardless, per your call). Wired that list
  into both `useAffiliatedStores` (client) and `fetchAffiliatedStores`/
  `fetchAffiliatedStore` (server) — these were 100% DB-only before, which
  is why adding to the static file alone wouldn't have shown up anywhere.
  Also extended `InfoRail.tsx`'s partner quick-links to all 11 platforms.
- **WhatsApp number verification**: this mostly already existed
  (`AuthContext`'s real OTP flow, `WelcomeBanner` gated on
  `phoneVerified`) but had real bugs: the banner's "Details" link was
  dead (called the same handler as dismiss — there was even an unactioned
  code comment already flagging this), and verifying a number never
  synced to `profiles.phone`/`phone_verified` (only Supabase Auth's
  internal field), which is what your WhatsApp integration actually
  reads. Both fixed. Relabeled "Phone Number" to "WhatsApp Number" with
  copy explaining why, and restyled `/account/settings` to match the
  card-based look of Profile/Address Book (it was a visually distinct
  uppercase-heading list before).

## Still real, from before

Catalogues, sellers admin + login provisioning, seller portal, cart/
wishlist/recently-viewed/loyalty sync, My Orders + Track Order, cart
checkout, the Add Request flow, and `lib/supabase/types.ts`'s real
Database types. See the previous status doc's detail if you still have
it — none of that got re-litigated here, only extended or bug-fixed.

## Known gaps, still open

- No shipping address collection on checkout (`orders.recipient_address_id`
  stays null — the form never asks for a street address).
- A confirmed Channel-3 request (no price, needs a manual quote) has
  nowhere to show up yet — no "pending requests" page.
- Order numbers are a client-side random-with-retry, not a DB sequence.
- New marketplace logos reference `/logos/<slug>-squared.png` — those
  image files need to actually exist; this project has no `public/`
  folder in what's been shared with me to verify against.
- Clearing storage via DevTools without reloading the page still can't be
  detected by any app code — a browser limitation, not a bug (real reloads
  already work correctly).

## Still fully mock — untouched

**Account:** boards, community, my-following, credits, promo-codes,
coupons, gift-card, wallet, points, referrals, messages (+ service
records), wishdrop-vip.

**Admin:** orders queue, dashboards (common/manager/sales), chat's
*underlying data* (the page now looks right, but still reads from
`ChatContext`'s localStorage-based mock, not real `chat_threads`/
`chat_messages` rows), requests intake, staff + warehouses, reports,
warehouse queue pages, purchases, scrape-health, discounts, collections.
Almost all of it still runs off one shared mock context,
`contexts/AdminDataContext.tsx`.

**Super-admin:** all 18 pages, untouched.

**Also still open:** no staff-role gating anywhere in `/api/admin/**`.