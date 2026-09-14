# WishDrop — status as of this zip

Supersedes the WISHDROP_STATUS.md from the previous zip. Same rule as
before: this isn't "done," it's an honest snapshot.

## What changed since the last zip

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
