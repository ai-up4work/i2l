# WishDrop — Requirements & Discussion Summary

*Paste this whole doc into a new chat to continue where this conversation left off.*

---

## 1. Platform overview

WishDrop is a concierge shopping and cross-border delivery platform helping customers in Sri Lanka buy from affiliated Indian stores, or request products from other online stores, without handling international purchasing, warehousing, customs, or shipping themselves.

**Core journey:** Discover → Request → Quote → Purchase → Quality check → Ship → Track → Support.

**Order pipeline stages:** `Ordered → Quality check → Shipped → Delivered`

**Success criteria (from original spec):**
1. Understand what the platform does within seconds.
2. Find a product or submit a request without confusion.
3. See a believable total before committing.
4. Know what happens next after placing a request.
5. Track the order without contacting support for routine updates.
6. Reach wishlist, cart, account, logout from the header.
7. Find every account destination from the sidebar.
8. Get clear help when something is delayed or unavailable.

**Tone/language rule:** customer-facing language only — "Buy for me" not "procurement workflow," "Quality check" not "warehouse inspection event," etc.

**Tech stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, pnpm.

**Design language:** Parchment backgrounds, Indigo (trust/structure), Teal (actions/links/progress), Gold (wishlist/new-drop moments), Fraunces (headlines), Space Grotesk (UI/transactional text).

**Key existing files:**
- `app/account/cart/page.tsx` — real in-platform checkout (shipping form, terms, delivery method, order confirm → creates order via `dashboard.confirmCartOrder()`)
- `components/shared/Header.tsx` — public header
- `contexts/Cartcontext.tsx`, `contexts/DashboardContext.tsx`
- `lib/pricing.ts`, `lib/quote.ts` — single source of truth for all displayed pricing (catalog grid, PDP, mini-cart, cart page all call the same helpers)
- `app/api/scrape/route.ts` — product-link lookup endpoint

---

## 2. SWOT (as discussed)

**Strengths**
- Real, felt pain point (customs/shipping friction) — not vague convenience.
- Full-lifecycle ownership (purchase + QC + delivery) is a genuine moat vs. plain freight-forwarders.
- Dual acquisition paths (affiliated catalog + open link requests) cover both impulse and specific-item shoppers.
- Trust-oriented design language matches a business handling people's money sight-unseen.
- Pricing math (`lib/pricing.ts` / `lib/quote.ts`) is genuinely centralized — catalog, PDP, and cart never disagree on cost. *(Correction from earlier in this discussion: checkout is NOT WhatsApp-based — `app/account/cart/page.tsx` is a real in-platform checkout with its own order-creation flow. WhatsApp is only used as a lightweight order-inquiry shortcut on the storefront mini-cart, not the transaction path.)*

**Weaknesses**
- **Possible cart fragmentation**: the affiliated-store catalog page was reading/writing its own `sessionStorage['store_cart_${platform}']` directly, while the real cart/checkout uses `useCart()` / `CartLineItem[]` context. Needs verification that these are reconciled into one source of truth, or a customer's catalog-added items may not appear at checkout.
- No error handling in `handleConfirm()` on the cart page — if `confirmCartOrder()` throws, `confirming` state never resets and the user gets no feedback.
- `detailsComplete` only checks for non-empty fields, not valid email/phone format — worth tightening before payment gateway integration (OTP/receipt needs will require it anyway).
- Payment is not yet wired in — "You will not be charged now" copy will need to change once the Indian payment gateway lands, and the decision of *when* payment happens (at confirm vs. after manual quote) determines where order status states need to live.

**Opportunities**
- Keep WhatsApp as a *notification/inquiry* channel, not a *transaction* channel, as volume grows.
- Unify carts fully (account-level, not per-tab/session) to support multi-store checkout cleanly.
- Make the Quality Check step a visible trust asset (photo/note per item) — differentiates from generic forwarders.
- Referral/community features are already scoped — cross-border shopping in Sri Lanka is word-of-mouth driven; worth prioritizing.

**Threats**
- Local proxy-buying competitors and generic global forwarders both compete on price; WishDrop competes on trust/convenience, so any visibly manual/janky step undermines positioning faster than it would for a bare-bones competitor.
- Currency/customs volatility outside WishDrop's control can break the "believable total" promise if quotes aren't kept current.
- Dependency on affiliated stores' own feeds (Shopify/WooCommerce APIs) — feed downtime or delisted products directly erodes the "reliable" success criterion.

---

## 3. Header cart/wishlist redesign (already implemented)

Replaced the old desktop hover-dropdown + mobile bottom-sheet split in `Header.tsx` with a single `SlideOverPanel` component used at every breakpoint — full-height panel pinned right, backdrop blur, slides in from the edge (same visual language as the store catalog page's `MiniCart`).

- Wishlist panel: item list + "View wishlist (n)" link. No footer/CTA — nothing to check out.
- Cart panel: item list + "View cart (n)" link + a footer **Checkout** button styled identically to the product page's CHECKOUT CTA (`bg-teal … hover:bg-teal-deep`), linking to `/account/cart`. No WhatsApp button in the header cart — the header cart spans multiple stores, so it hands off to the real in-platform checkout rather than trying to build a per-seller WhatsApp message.
- Delivered as a full updated `Header.tsx` (artifact/file already generated in the prior session).

---

## 4. Three product-acquisition channels

### Channel 1 — Affiliated stores *(built)*
Browse catalog → product detail page → add to bag → real in-platform checkout (`app/account/cart/page.tsx`) → order created → tracked through `Ordered → Quality check → Shipped → Delivered`.

### Channel 2 — Scrapeable link *(planned)*
Customer pastes a URL from a store WishDrop has an extractor for (Shopify, Amazon, Flipkart, etc.) → scraper/extractor pulls structured data (title, price, images, variants) → customer is redirected into a PDP-style page to select variants → flows into cart the same way as Channel 1.

### Channel 3 — Unscrapeable link *(planned, design agreed)*
For links with no extractor (e.g. Instagram product posts, small boutique sites):

- Scrape attempt fails → falls into a **manual request form**: link + note field + optional screenshot upload. No price field, no variant picker — there's no structured data yet to make those meaningful.
- Submitting creates a **request record** (not a cart line) with a status like `sent_for_review` / `pending_quote` — this happens regardless of which channel the actual conversation uses, so the customer always has something to check in Account → Requests even before a human has replied.
- **Chat design (agreed):**
  - **In-platform chat is the source of truth.** One thread per `request_id` (not one global inbox per customer).
  - Rolling **30-day display window** in the UI; full history retained in the database indefinitely (or per data-retention policy) — never hard-deleted at 30 days, since disputes/support may need older context.
  - **WhatsApp side, one-way only, manual-send (agreed as the near-term approach):**
    - Platform → WhatsApp: when ops replies in-platform, a "Send via WhatsApp" button opens a prefilled `wa.me` link (same pattern as the existing mini-cart WhatsApp button); **ops manually clicks send** — this is what keeps it $0 cost, since a human is the one actually sending, not an automated backend push.
    - WhatsApp → platform: **not synced.** If the customer replies on WhatsApp directly, that reply does not need to appear in-platform (per explicit decision).
  - **Pricing decision on submission:** none shown at submission time — goes to manual WhatsApp/chat review by a dedicated ops person first. This is intentionally different from Channels 1–2, since there's no structured product data to run through `lib/pricing.ts` yet.
  - **After ops prices it:** stays a separate request with its own confirm/pay step (does not merge into the structured-data cart, since it never went through the same pricing math as catalog/scraped items).
  - **Scaling signal:** log the domain on every fallback submission; when one domain crosses a manual-request volume threshold, that's the trigger to either build a proper extractor for it or pursue an affiliate deal with that store — turning ops pain into a prioritized backlog automatically instead of relying on someone noticing anecdotally.

---

## 5. WhatsApp Business API cost research (findings, Sept 2026)

- **Platform/API access itself is free** — no subscription fee to use Meta's WhatsApp Business Platform / Cloud API.
- **Business-initiated messages are not free.** They require a pre-approved template and are billed per message by category (Marketing / Utility / Authentication) and recipient country. WishDrop's "platform message → push to WhatsApp" design counts as business-initiated (the customer isn't the one opening the conversation), so this would not be free under true API automation.
- **Free-form replies inside the 24-hour customer-service window are currently free** (as are utility templates sent inside that window) — **but this free tier is scheduled to end October 1, 2026**, after which even in-window service replies become chargeable. (Today's date at time of this discussion: Sept 8, 2026 — this change is imminent.)
- Routing through a Business Solution Provider (Twilio, Gupshup, 360dialog, AiSensy, etc.) is typically required for real API integration, and BSPs may add their own fees on top of Meta's per-message rate.
- **Decision made:** do not build Cloud API integration yet. Use the manual-send `wa.me` deep-link approach (Section 4) instead — genuinely $0, no approval process, fits the fact that a dedicated person is already handling Channel 3 manually. Revisit true API automation only once manual-send volume becomes a real bottleneck for ops — by then Meta's post-Oct-1 pricing will be settled and utility-category volume-tier rates should be knowable.

---

## 6. Open items / decisions still needed

- [ ] Confirm whether the affiliated-store catalog page's per-platform `sessionStorage` cart has been reconciled with the real `Cartcontext`, or if it needs to be migrated/removed.
- [ ] Add try/catch + user-facing error state around `confirmCartOrder()` in `app/account/cart/page.tsx`.
- [ ] Tighten `detailsComplete` validation (email format, phone format) before payment gateway integration.
- [ ] Decide exact point payment occurs once the Indian payment gateway is wired in (at confirm vs. after manual quote/availability check) — this determines order status states (e.g. `pending_payment` vs `ordered`).
- [ ] Build Channel 2 (scrapeable-link → PDP redirect flow) — extractor/scraper logic + redirect target page.
- [ ] Build Channel 3 fallback request form + request record + in-platform chat thread (30-day display window, permanent storage) + ops "Send via WhatsApp" manual-send button.
- [ ] Set an internal SLA (e.g. "reply within X hours") for Channel 3 requests and surface it in the fallback form's confirmation copy.
- [ ] Add per-domain logging on failed scrape attempts to build the "which store should we build an extractor/affiliate for next" backlog.
