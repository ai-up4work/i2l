# WishDrop — status as of this zip

Supersedes the WISHDROP_STATUS.md from the previous zip. Same rule as
before: this isn't "done," it's an honest snapshot.

## What changed in this pass

- **Real-time admin data.** `AdminDataContext` — the single shared store every admin queue page reads from (orders, purchases, QC, pack-label, export-bin, in-transit, shipped, requests) — only ever fetched once, on mount. Ops had no way to know a new Channel 3 request came in, another staff member advanced an order's stage, or a QC issue got flagged without manually refreshing the page. Added real-time subscriptions on `orders`, `order_items`, `purchases`, `order_item_issues`, and `requests` — any change on any of them triggers a debounced refetch (~400ms after the last change in a burst, so a bulk action touching 10 rows doesn't fire 10 separate refetches). Reused/exported the retry-and-log `subscribeWithDiagnostics` helper that was previously chat-only (`lib/supabase/chat.ts`) since the pattern is identical. New `data/wishdrop-admin-realtime-enable.sql` — these tables need to be added to Supabase's `supabase_realtime` publication or every subscription connects successfully but silently receives nothing, same gotcha already documented for the chat tables.
- Customer-facing pages deliberately left as one-time-fetch-on-mount, per the explicit decision that a manual refresh is an acceptable fallback there — only the admin/ops side needed this.

- **Fixed spurious refetching on tab focus across 5 contexts.** `AuthContext`'s `applyUser()` sets a brand-new `user` object on every Supabase auth event — including the session refresh Supabase's client automatically triggers on `visibilitychange` (tab regains focus, e.g. switching back to the WishDrop tab from another one). Any effect keyed on the whole `user` object (not `user?.id`) saw that as a real change and re-ran. `ChatContext.tsx` already avoided this; `Ordercontexts.tsx`, `Cartcontext.tsx`, `Wishlistcontext.tsx`, `Loyaltycontext.tsx`, and `Notificationcontext.tsx` (three separate effects) didn't — every one of them was silently refetching its full data set (or, for notifications' realtime subscription, tearing down and recreating the channel) every single time the user switched back to the tab, not just on an actual login/logout. Fixed all of them to key on `user?.id` instead.

- **Added an image lightbox to every chat surface at once.** `components/chat/AttachmentMedia.tsx` is the single component all three chat UIs (floating `ChatPanel`, `/account/messages`, admin `/admin/chat`) render attachments through — clicking an image now morphs it into a full-screen view via framer-motion's shared `layoutId` animation (already a project dependency), not just a plain fade. Escape key and backdrop click both close it. Since every consumer already goes through this one component, no other files needed changes.

- **Added image attachments to every auto-sent message.** `SendMessageModal` now supports an optional attachment: an "Attach image" button (uploads through the `products` folder, same as the request detail page's screenshot upload) plus preview/replace/remove. The QC-flagged trigger now auto-fills the attachment with the photo just taken during that QC check (`defaultAttachmentUrl`) — previously that photo only lived in `order_item_issues.photo_url`, never actually reaching the customer even though a "Quick update on..." message was sent right next to it. Threaded `attachmentUrl` through `sendChatMessage` (AdminDataContext) → `sendAdminChatMessage` → the real chat insert, and updated all five call sites (request detail, purchases, QC, in-transit, shipped) to pass it through.

- **Added real variant confirmation**, replacing the old tag-and-forget approach. Previously "[Confirm size/color with customer]" was just a note prefix with nowhere for the admin to actually record the answer once they'd confirmed it with the customer — it either leaked into customer-facing text (fixed last pass) or got silently stripped with the information lost. Now: `requests.needs_variant_confirmation` (a real boolean, replacing the old fragile `note?.startsWith(...)` string-match the admin requests list used) and `requests.confirmed_variant` (free text, e.g. "Size M, Black"). The request detail page shows a "confirm variant" input whenever an item needs it, and once saved, `confirmRequestReal` prepends it onto the order's item name (e.g. "Size M, Black - Everyday Seamless Racerback Tank") instead of leaving it unresolved. `VariantConfirmPill` on the admin requests list now hides itself once resolved, not just once flagged.

- **Fixed unbounded chat message fetching.** Every consumer of a thread's message history (customer `ChatPanel`, `/account/messages`, admin `/admin/chat`) was fetching the *entire* thread with no `.limit()`/`.range()` at all — harmless for a short conversation, but for a genuinely long-running thread this ran straight into Supabase's own project-level row cap (Max Rows, 1000 by default), which would silently truncate the query. Because the old query ordered oldest-first, that cap kept the *oldest* messages and silently dropped everything more recent — a customer with a long history could open their chat and be missing their most recent exchanges entirely, no error, nothing visibly wrong. Replaced with `fetchRecentThreadMessages` (newest 100 first, reversed for display) and `fetchOlderThreadMessages` (cursor-paginated on `created_at`, not offset — offset pagination breaks on a table that gets new rows in realtime). Wired "load older messages" into all three consumers: auto-triggered on scroll-to-top in `ChatPanel` and the admin inbox (both bounded scroll containers), a manual button in `/account/messages` (page-level scroll, so auto-detection is less reliable there). All three preserve scroll position when older messages get prepended, instead of the view jumping.

- **Fixed an internal tag leaking into customer-facing messages and the customer's own Orders page.** `requests.note` was always meant to be ops-only — `buildRequestNote()` (DashboardContext.tsx) bakes an internal `[Confirm size/color with customer]` tag plus a price estimate into it specifically so Sales & Purchase sees the flag while scanning the admin queue. `confirmRequestReal` was using that same composite string, tag and all, as the new order's `order_items.title` — which is customer-facing everywhere: their own Orders page, and every auto-sent chat message that mentions the item by name (QC flagged, replacement passed, etc.). Fixed with a new `requests.item_name` column (clean product name only, populated at request-creation time) that `confirmRequestReal` now uses instead of the raw note. Also added `data/wishdrop-requests-clean-item-name.sql`'s cleanup query for any order already created with the bad title baked in (safe to run any time, only touches rows that still match the pattern).

- **Fixed the profile page for real.** `app/account/profile/page.tsx` had, at some point, ended up as an exact duplicate of the admin QC detail page — a real route (`pathForView('profile')`, already wired to the account header) pointing at completely wrong content. Found that `components/dashboard/ProfilePage.tsx` already existed fully built and ready to receive real data, just with no page wrapping it. Built that wrapper: name edits write to both `auth.updateUser` (what the header actually reads) and `profiles.full_name`; avatar upload is wired to the `avatars` Storage folder (previously defined but never used by anything — see the earlier storage audit); address summary is pulled live from the address book.
- **Two more auto-messaging trigger points**, same review-before-send pattern as before: a replacement item passing QC after an earlier fault (`/admin/qc/[id]`), and an order arriving in Sri Lanka (`/admin/in-transit`'s "Mark shipped"). Both of these, plus the existing delivered-message wiring, needed `chatThreadId` added to a few more line types (`InTransitLine`, `ShippedLine`) that didn't have it yet — same plumbing as `PurchaseLine`/`QCLine` from before. Bulk actions (marking several orders shipped/delivered at once) queue their messages instead of trying to show several modals at once — the modal works through them one at a time.
- **Added an enthusiastic delivered message** (`/admin/shipped`'s "Mark delivered") — celebrates the delivery, invites the customer to flag anything wrong, and nudges them toward their next request/browsing the catalogue. Deliberately doesn't mention loyalty points, since that system isn't actually wired to real orders yet (see the loyalty-program gap noted earlier) — promising points that don't land would be worse than not mentioning them.

- **Fixed the same image-fallback bug, found again — this time on QC Issues.** `lib/supabase/qc-issues.ts`'s two context-fetchers (`fetchOpenQcIssuesWithContext` for the list, `fetchQcIssueWithContext` for the detail page) only ever checked `product_snapshots.image_url`, never `order_items.screenshot_url` — same root cause as the earlier orders/customer-order-list fix, just a spot that fix hadn't reached yet. A faulty Channel 3 item showed a blank `bg-parchment` placeholder block on `/admin/qc-issues/[issueId]` instead of its actual photo. Fixed both queries to select `screenshot_url` and fall back to it, matching the same `product snapshot → screenshot → placeholder` chain used everywhere else. Confirmed via a full-codebase sweep that no other spot still has this gap (Wishlist/Cart's own `product_snapshots.image_url` reads are unaffected — those items always have a real snapshot, unlike Channel 3 order items).
- **Fixed the purchase detail page not scrolling.** `/admin/purchases/[PurchaseId]` was missing the `h-full overflow-y-auto` wrapper every other admin page needs, since the admin layout's `main` is deliberately `overflow-hidden` (each page supplies its own scroll region). The loading state had it; the actual content and "not found" state didn't.
- **Removed the leftover app-side storage-cleanup dependency.** `lib/supabase/storage-cleanup.ts` was a real-time, per-action cleanup helper (delete-this-one-file-right-now), separate from the weekly DB-side sweep (`data/wishdrop-storage-reconciliation-views.sql`, pg_cron/pg_net) — the two were never the same thing, but having both was redundant now that the storage-cleanup direction is fully DB-side. `removeMessageAttachment` now just nulls `chat_messages.attachment_url`; the now-orphaned file gets picked up and deleted by the next scheduled sweep instead of being deleted inline. Deleted the now-fully-unused `storage-cleanup.ts` file.

- **Fixed a real enum mismatch crashing every staff-sent chat message.** This project's actual `chat_sender` Postgres enum is `('customer', 'ops')` — the code had `'staff'` hardcoded in several places (`lib/supabase/chat.ts`'s `ChatSender` type, the admin chat inbox page's send calls, and `requests-admin.ts`'s `sendAdminChatMessage`), which failed outright with `invalid input value for enum chat_sender: "staff"` the moment a real insert was attempted. Separately, `requests-admin.ts`'s read-side mapping (`fetchAdminChatThreads`) was checking `m.sender === 'staff'` against the raw DB value — since the enum never actually contained `'staff'`, this silently mis-mapped every real staff-authored message as if it came from the customer, throughout the whole admin chat inbox. Fixed both the write and read sides to use `'ops'` at the database boundary; the "Staff" label shown in the UI is unchanged, since that's just a display string unrelated to the stored enum value.

- **Converted auto-sent chat messages to review-before-send.** Instead of silently pushing a message the moment a quote is set, payment is confirmed, an order is confirmed, a request is declined, a purchase fails, or QC flags an issue, every one of these now opens a shared `SendMessageModal` with an editable draft — the admin can send as-is, edit the wording, or skip entirely. Added `components/admin/SendMessageModal.tsx` and `lib/chat/customerMessageTemplates.ts` (the draft text for each trigger, in one place). Wired into `/admin/requests/[requestId]` (quote, payment, order-confirm, decline), `/admin/purchases/[PurchaseId]` (purchase failed), and `/admin/qc/[id]` (QC flagged).
- **Fixed a real gap this surfaced: orders never carried their chat thread ID at all.** Needed for purchase-failed/QC-flagged messaging to reach the right thread. Added `chatThreadId` to `Order`/`PurchaseLine`/`QCLine`, wired it through the real-order mapping, and fixed `confirmRequestReal` to actually set `orders.chat_thread_id` at creation (it only ever set `request_id` before — the column existed and was already being read, just never written).

## What changed in the previous pass

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

## What changed three passes ago

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