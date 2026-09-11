# WishDrop Admin — Route Specifications (v2, matches built folder structure)

*Rewritten to match the actual `app/admin` tree after absorbing several standalone "new"/sub-action routes into their parent pages. No database/schema details here — this is purely actions, features, and layout per page. Use as the build checklist for UI/UX and interaction logic.*

---

## How to read this doc

For every route: **Purpose**, **Who reaches it**, **Layout** (the panels/components the page is built from), **Actions & features** (everything a user can click/do on this page), and **Notes** (behavior rules, edge cases, anything that would silently break if built wrong).

---

# `(common)` — shared across Manager + Sales & Purchase (Warehouse excluded except where noted)

## `/admin/orders`

**Purpose:** Single lifecycle view of every order across all 3 channels — "where is this order right now," independent of warehouse queue.

**Who reaches it:** Manager (write, all sites) · Warehouse (write, own site only) · Sales & Purchase (read-only).

**Layout:**
- Filter/search bar: channel, stage, site, date range, "delayed" toggle.
- Data table: Order ID, customer name, channel badge (1/2/3), pipeline stage, warehouse site, order age, total value, delayed flag icon.
- A distinct visual tag (e.g. colored chip) on Channel 3 rows so anyone scanning the list can tell a price wasn't system-generated.

**Actions & features:**
- Manager: change pipeline stage inline or via row action, reassign order to a different site, toggle delayed flag.
- Warehouse: change pipeline stage for their own site's rows only — no site reassignment control rendered.
- Sales & Purchase: no mutation controls rendered at all (not disabled — absent). Clicking a row still opens the detail page for read-only viewing.
- Row click → `/admin/orders/[orderId]`.

**Notes:**
- Delayed is a flag, not a stage — an order can be "Quality check + delayed" simultaneously.
- Reassigning an order mid-QC to a new site should restart QC at the new site by default.
- Channel 3 order totals shown here must reflect the final confirmed quote, not the initial estimate.

---

## `/admin/orders/[orderId]`

**Purpose:** Full detail and control surface for one order.

**Who reaches it:** Same roles as the list, scoped to one record.

**Layout:**
- Header: order ID, customer, current stage, site, total.
- Item list panel — channel-aware: catalog SKU (Ch.1), scraped snapshot (Ch.2), original request link/screenshot (Ch.3).
- Stage history timeline (each transition with timestamp + who made it).
- Internal notes panel (ops-only, never customer-visible).
- Linked chat thread shortcut, if one exists for this customer/request.

**Actions & features:**
- Manager/Warehouse: advance/roll back stage, add an internal note.
- Manager only: reassign warehouse site.
- Sales & Purchase: view everything including the linked chat thread and quote history, but no mutation controls.
- "Open chat thread" button/link scrolls to or opens the relevant conversation on `/admin/chat` (see below — chat is absorbed into one page, so this should deep-link/expand the right thread rather than navigate to a separate URL).

**Notes:**
- Internal notes vs. chat thread is a hard boundary — nothing typed as an internal note should ever be able to leak into the customer-facing chat, and there should be no shared input component between the two that could make that mistake easy.
- If multi-seller/multi-channel single-cart orders ship, stage tracking may need to become per-line-item — flag if not resolved.

---

## `/admin/orders/[orderId]/age`

**Purpose:** Time-in-stage / SLA-breach view, filtered from the orders list, purpose-built for spotting a stuck order before the customer complains.

**Who reaches it:** Manager (bulk-flag), Warehouse (own site, view + act), Sales & Purchase (view only).

**Layout:**
- Default sort: oldest-in-current-stage first.
- Visual threshold marker per stage (a different "too long" threshold for QC vs. transit vs. shipped — don't use one global number).
- Two age columns per row: **total order age** (since placement) and **current-stage age** (since last transition) — shown separately, not merged into one number.

**Actions & features:**
- Manager: multi-select rows → bulk "flag for review" action.
- Warehouse: act on their own site's aged orders (advance/roll back stage directly from this view).
- Sales & Purchase: view only.

**Notes:**
- ⚠️ This page currently sits nested under `[orderId]` in the folder tree, which would scope it to one order rather than being the cross-order aged view described above. If that's intentional (e.g. it's meant to show "how has *this* order's age trended," not a global aged-orders dashboard), the purpose/layout above needs to be rewritten to match. If it's meant to be the global view, the route needs to be a sibling of `[orderId]`, not a child. Worth a quick confirm before building the page logic, since the two versions have almost nothing in common.

---

## `/admin/chat`

**Purpose:** Single page for all customer chat — thread list AND the conversation surface, combined (no separate `[customerId]` route; clicking a thread renders it inline/expanded on the same page).

**Who reaches it:** Manager, Sales & Purchase. Warehouse excluded.

**Layout:**
- Left/top panel: thread list — customer name, unread count, last message preview, last activity time, related request/order tag(s). Search/filter by customer or request status.
- Right/expanded panel (renders on click, same page — no navigation): full thread within the 30-day display window, message timestamps, sender name (not "admin"), attachments, a visible tag on any message tied to a specific `requestId`.
- "Load older messages" affordance to reveal anything past the 30-day window without leaving the page.

**Actions & features:**
- Click a thread row → expands/loads the conversation panel in place.
- Send a reply (text + optional image/video attachment).
- Tag a reply to a specific `requestId`.
- "Send via WhatsApp" button — opens a prefilled `wa.me` deep link; human clicks send inside WhatsApp itself. Prefilled copy must explicitly tell the customer to reply in-app.
- Indicator for threads that have gone quiet past the internal reply SLA.
- Indicator for "last platform reply not acknowledged" (since WhatsApp-side replies aren't synced back).

**Notes:**
- Because this is one page instead of list + detail route, state management matters: switching threads should not lose an unsent draft in the other thread without at least a warning.
- 30-day window is a display default only — full history stays queryable via "load older," never hard-deleted at 30 days.

---

## `/admin/requests`

**Purpose:** Queue of incoming Channel 3 (unscrapeable-link) requests — the manual-review funnel.

**Who reaches it:** Manager, Sales & Purchase.

**Layout:**
- Table: Request ID, customer, submitted link, submission time, status (`sent_for_review` / `pending_quote` / `quoted` / `confirmed` / `rejected`), time since submission (SLA indicator).

**Actions & features:**
- Sales & Purchase: open a request to begin pricing.
- Manager: everything above, plus reassign a request to a different Sales & Purchase account, or close a request outright.
- Row click → `/admin/requests/[requestId]`.

**Notes:**
- Every submission (including failed-scrape fallbacks) should log its source domain even before a human opens it — this feeds `/admin/scrape-health`.

---

## `/admin/requests/[requestId]`

**Purpose:** Work one Channel 3 request through to a priced, confirmable state.

**Who reaches it:** Manager, Sales & Purchase.

**Layout:**
- Original link, customer's note, uploaded screenshot (if any).
- Quote field — **empty by default**, no pre-fill, since there's no structured price to seed it with.
- Revision history panel for the quote (if it's been edited more than once).
- Shortcut into the linked chat thread (expands/jumps to it on `/admin/chat`).

**Actions & features:**
- Set a manual quote (entered directly, not run through the catalog pricing helper).
- "Retry scrape" action, in case the link actually turns out to be extractor-compatible.
- Move status: `quoted` → `confirmed` (customer accepted) or `rejected` (declined/unavailable).
- Edit an already-set quote, with the edit tracked in the revision history panel.

**Notes:**
- A confirmed Channel 3 request becomes its own distinct order — it must never silently merge into the structured-data cart. The "confirm" action should create a separate order record that still shows up in `/admin/orders` (flagged as Channel 3) but is understood to be traceable to a manual quote, not `lib/pricing.ts`.

---

# `(manager)` — Manager only

## `manager-dashboard`

**Purpose:** Manager's landing page — cross-site operational rollup and launchpad.

**Layout:**
- Per-site breakdown grid/cards (not a single flat number): orders by stage, QC pass/fail rate, shipping SLA hits/misses, open Channel 3 requests, unread chat threads, staff headcount — one block per site.

**Actions & features:**
- Every number/card is a link into the relevant full page (orders, reports, staff, etc.) — no inline editing here at all.

**Notes:**
- If site count grows, the per-site grid should become filterable/paginated rather than a long flat scroll.

---

## `/admin/reports`

**Purpose:** Historical/analytical operational reporting across all sites (distinct from the real-time dashboard above, and distinct from Super Admin's business-oversight analytics elsewhere).

**Layout:**
- Date range + site + metric filters.
- Charts/tables: order age trends, QC pass rate over time, shipping SLA hit/miss rate.

**Actions & features:**
- Filter, drill into a specific site → `/admin/reports/[siteId]`.

---

## `/admin/reports/[siteId]`

**Purpose:** Same report, scoped to one site.

**Layout:** Same metric set as the parent page, plus site context (staff headcount, which Warehouse accounts are assigned there).

**Actions & features:** Same filters as parent, pre-scoped to this site.

---

## `/admin/staff`

**Purpose:** Roster of all Sales & Purchase and Warehouse accounts, across every site.

**Layout:**
- Single combined table (not split by role) — name, role, site assignment (Warehouse only), status, last login.

**Actions & features:**
- "Add staff" → `/admin/staff/new`.
- Row click → `/admin/staff/[staffId]`.

**Notes:**
- Manager account creation is never available here — only via Super Admin.

---

## `/admin/staff/new`

**Purpose:** Create a Sales & Purchase or Warehouse account.

**Layout:**
- Role selector (Sales & Purchase / Warehouse only — Manager/Super Admin never appear as options).
- Site-assignment field — shown **only** if Warehouse is selected, hidden entirely (not blank) otherwise.

**Actions & features:**
- Submit → creates the account, presumably triggers an invite/credential-setup flow (flag as open detail — not specified how).

---

## `/admin/staff/warehouses`

**Purpose:** Reference list of registered warehouse sites — the source list used when assigning a Warehouse account to a site.

**Layout:**
- Table: site name, location, headcount, active-order count.

**Actions & features:**
- Likely CRUD on sites themselves (add/edit/deactivate a site) — natural home for this even though not explicitly scoped elsewhere.

**Notes:**
- Deactivating a site with active orders routed to it should be blocked or require reassignment first.

---

## `/admin/staff/[staffId]`

**Purpose:** Edit one staff account.

**Layout:**
- Account details, role, site assignment (if Warehouse), status, activity history.

**Actions & features:**
- Edit details, reassign a Warehouse account to a different site, deactivate.
- No hard-delete UI — deactivate is the only destructive action exposed.

**Notes:**
- Deactivating a Warehouse account with in-progress orders assigned to their site shouldn't orphan those orders — require reassignment first, or auto-flag them for review.

---

# `(sales)` — Sales & Purchase only

## `sales-dashboard`

**Purpose:** "What needs my attention today" — not a full operational rollup.

**Layout:**
- Cards: pending purchases awaiting execution, open Channel 3 requests awaiting quote, incomplete catalogue entries, discounts nearing expiry, unread chat threads relevant to this person's leads/orders.

**Actions & features:**
- Launchpad only — every card links out, nothing edits inline.

**Notes:**
- Zero QC/pack/shipping data belongs here, even in summary form — that's Warehouse's domain.

---

## `/admin/sellers`

**Purpose:** List of all affiliated sellers, feed-integrated and manual-mode, tagged by type.

**Layout:**
- Table: seller name, type badge, status, last sync (feed) or last edit (manual).
- "Add seller" action available directly from this list (see below — absorbed, no separate route).

**Actions & features:**
- **Add seller** — opens as a modal/drawer directly on this list page (absorbed `sellers/new`): form asks for type up front; manual-mode shows branding/contact fields, feed-integrated transitions to a connection flow (API key / OAuth) plus a "test connection" step before saving. On submit, either closes the modal and adds the row, or redirects straight into the new seller's `[sellerId]` page.
- Row click → `/admin/sellers/[sellerId]`, and **the click destination branches by type**: feed-integrated opens the read-only synced list section of that page; manual-mode opens the Catalogue section of the same page.

**Notes:**
- Getting the type tag right at creation is what makes this branching work later — no separate "seller detail" component that ignores type.

---

## `/admin/sellers/[sellerId]`

**Purpose:** One seller's full profile — now the single page that also absorbs scrape-config (for feed-integrated sellers), since those were folded in rather than kept as a separate route.

**Layout (feed-integrated seller):**
- Profile/contact section.
- Read-only synced product list, feed connection health indicator (should be impossible to miss if down — not a quiet log line), last sync time.
- **Scrape-config section/tab** (absorbed): current extractor field mappings (title/price/images/variants), a "test extraction against a sample URL" action usable any time, extraction failure history.

**Layout (manual-mode seller):**
- Profile/contact section.
- Full Catalogue section: product CRUD (title, price inputs, images, variants, stock) — this is effectively the catalogues page, scoped to this seller.
- **"Add product" action lives here too** (absorbed `catalogues/new` for this seller's context — see catalogues section below for the standalone list version).

**Actions & features:**
- Edit profile/contact.
- Deactivate seller (soft only — hard delete is Manager/Super Admin territory, and even then likely never exposed in UI).
- Feed-integrated: edit field mappings, run test extraction, review failure history.
- Manual-mode: create/edit/deactivate individual products inline.

**Notes:**
- Deactivating a seller with open orders tied to their listings should block or warn first, same pattern as staff/site deactivation.
- Don't hardcode the assumption that a Catalogue belongs to exactly one seller in how this page fetches its product data — if catalogues get decoupled from sellers later, this section should read as "catalogues currently assigned to this seller."

---

## `/admin/catalogues`

**Purpose:** Standalone view of all catalogue entries across all manual-mode sellers (separate from the per-seller Catalogue section above — this is the full cross-seller list).

**Layout:**
- Table: product title, price, seller, stock status, active/inactive.
- "By seller" filter facet.
- "Add product" action available directly here (absorbed `catalogues/new`) — opens a modal/drawer with the same create form used inside `[sellerId]`, just seller-selectable instead of pre-scoped.

**Actions & features:**
- Search/filter, click into `/admin/catalogues/[catalogueId]` to edit.

---

## `/admin/catalogues/[catalogueId]`

**Purpose:** Edit one catalogue entry's full details.

**Layout:**
- Title, description, pricing **inputs** (cost/margin fields that feed the shared pricing helper — never a directly-typed final display price), images, variants, stock.

**Actions & features:**
- Edit all fields, deactivate/remove from active listing (soft delete only).

**Notes:**
- This is the page most likely to accidentally break platform-wide pricing consistency if it ever lets someone type a final price directly instead of the underlying cost/margin inputs.

---

## `/admin/discounts`

**Purpose:** View all discount rules.

**Layout:**
- Table: name/code, type (%/fixed), eligible scope, validity window, usage count, status.
- "New discount" action available directly here (absorbed `discounts/new`) — modal/drawer form: percentage or fixed amount, eligible products/collections, start/end date.

**Actions & features:**
- Create inline via modal, or click into `/admin/discounts/[discountId]` to edit an existing one.

**Notes:**
- This internal tool must stay logically separate from any future seller-facing coupon tool — internal discounts can be platform-wide, seller coupons must stay locked to that seller's own products.

---

## `/admin/discounts/[discountId]`

**Purpose:** Edit or pause a discount; view usage.

**Layout:**
- Same fields as creation, plus usage analytics (redemption count, revenue impact if trackable).

**Actions & features:**
- Edit, pause/resume, end early.

---

## `/admin/collections`

**Purpose:** View all storefront collections (curated, cross-seller merchandising groups).

**Layout:**
- Table: name, description, item count, active/inactive, filter type (auto/manual/both).
- "New collection" action available directly here (absorbed `collections/new`) — modal/drawer: name, description, initial filter rule (optional).

**Actions & features:**
- Create inline, or click into `/admin/collections/[collectionId]`.

**Notes:**
- Product picker/filter logic must never implicitly scope by seller type — collections are explicitly sourcing-independent.

---

## `/admin/collections/[collectionId]`

**Purpose:** Edit a collection's name/description/auto-filter rules **and** manually curate its contents — curation is now a section/tab on this same page rather than a separate `/curate` route.

**Layout:**
- Rule editor: current auto-filter definition (e.g. "tagged 'festive' under ₹X") with a live "preview matches" list.
- **Curation section (absorbed):** current manually-added/removed product list, shown separately from what the auto-filter alone would produce, so it's clear *why* a product is in or out of the collection.

**Actions & features:**
- Edit rule + preview matches before saving.
- Manually add/remove individual products by search, independent of the rule.

**Notes:**
- Needs an explicit, visible answer to "does a manual removal override a rule match permanently, or only until the rule re-evaluates" — otherwise "I removed it but it came back" becomes a guaranteed complaint.

---

## `/admin/purchases`

**Purpose:** View all purchases made on customers' behalf from source stores.

**Layout:**
- Table: purchase ID, linked order/request, status (pending/purchased/failed), source store, amount, originating channel.

**Actions & features:**
- Filter by status, click into `/admin/purchases/[purchaseId]` to execute/update.

---

## `/admin/purchases/[purchaseId]`

**Purpose:** Execute a purchase and update its status — payment recording is folded into this same page rather than a separate `/payment` route, since actual customer-facing payment will run through the payment gateway later and doesn't need its own dedicated ops screen right now.

**Layout:**
- Full order context, source store link, item details.
- Simple inline field/section for recording that the outbound purchase amount was paid to the source store (reference/amount/timestamp) — lightweight, not a full separate flow for now.

**Actions & features:**
- Mark as bought, attach a receipt/reference number.
- Mark as failed, with a **required** reason note.
- Record the outbound payment inline (amount, method/reference, timestamp).

**Notes:**
- A failed purchase after customer confirmation needs a defined downstream path (refund flow / chat notification / re-quote) — at minimum, force the reason note so ops and the customer both have a record of why.
- Keep the outbound "we paid the supplier" field visually distinct from anything customer-payment-related, even though it now lives on one page — conflating the two makes reconciliation error-prone later when the gateway is wired in.

---

## `/admin/scrape-health`

**Purpose:** Monitoring view for scrape/extraction reliability across feed-integrated sellers and Channel 2/3 fallback attempts — the backlog-generation page.

**Layout:**
- Per-domain failed-scrape counts, success/failure rate per configured extractor, sellers with stale/broken feed syncs.
- Sortable by failure volume (the "build an extractor for this next" signal).

**Actions & features:**
- Sort/filter by domain, failure count, seller.

**Notes:**
- Only useful if the scrape endpoint and the Channel 3 fallback form both actually log into whatever this page reads from — confirm that wiring exists before considering this page "done."

---

# `(warehouse)` — Warehouse only, scoped to the account's own site

## `warehouse-dashboard`

**Purpose:** This site's own queue at a glance.

**Layout:** Counts for QC queue, pack & labeling queue, export bin, in-transit, delayed/aged orders — all server-side filtered to the logged-in account's site.

**Actions & features:** Launchpad only, no editing.

---

## `/admin/qc`

**Purpose:** Quality Check queue for this site.

**Layout:** Orders awaiting QC, sorted by age, with what-was-ordered detail to inspect against.

**Actions & features:** Click into `/admin/qc/[id]` to log results. Should visually flag which orders still need photo documentation, not just pass/fail status.

---

## `/admin/qc/[id]`

**Purpose:** Log QC results for one order.

**Layout:** Item-by-item checklist, photo upload + notes field per item.

**Actions & features:**
- Mark pass/fail per line item (recommended over whole-order, so a partial defect doesn't block the rest of the order).
- Flag a defect for follow-up — must actually route somewhere (linked chat thread or internal note), never a dead-end status change with no notification.

**Notes:**
- If 2 of 5 items fail, decide whether the order splits into two downstream fulfillment paths (pack/ship separately) or the whole order waits.

---

## `/admin/pack-label`

**Purpose:** Pack & labeling queue for this site.

**Layout:** Orders that passed QC, awaiting packing, sorted by age.

**Actions & features:** Click into `/admin/pack-label/[orderId]` to pack.

---

## `/admin/pack-label/[orderId]`

**Purpose:** Pack an order and generate its shipping label.

**Layout:** Order contents, destination address, special handling notes carried over from QC.

**Actions & features:** Enter package weight/dimensions, generate/print shipping label, mark packed (advances to export bin).

---

## `/admin/export-bin`

**Purpose:** Staging view of packed orders queued for the next outbound export batch.

**Layout:** Currently staged orders, batch/shipment grouping if relevant.

**Actions & features:** Add/remove an order from the current bin (e.g. pull one that needs to be held back).

**Notes:**
- Decide what happens if an order needs pulling after its batch is already marked exported — reopen the batch, or track it as an outside-normal-flow exception.

---

## `/admin/in-transit`

**Purpose:** Orders currently in cross-border transit.

**Layout:** In-transit orders, current tracking status if available.

**Actions & features:** Manually update tracking info (unless/until a carrier API is integrated).

---

## `/admin/shipped`

**Purpose:** Confirm final shipped status and mark delivered — completes the pipeline.

**Layout:** Orders marked shipped, awaiting delivery confirmation.

**Actions & features:** Mark an order delivered.

**Notes:**
- Decide the source of truth for "delivered" — Warehouse-confirmed vs. customer self-confirmed from their account page. If both exist, this page needs to reconcile with customer-side confirmation rather than assume it's the only source.

---

# Shared, outside any group

## `/admin/login`

**Purpose:** Single sign-in entry point for all three internal roles.

**Layout:** Credential form only — no role selector.

**Actions & features:** Sign in → server determines role → redirect to the correct dashboard (`manager-dashboard` / `sales-dashboard` / `warehouse-dashboard`) via explicit role-to-URL mapping, not "last visited page."

---

## `/admin/settings/profile`

**Purpose:** Self-service account settings.

**Layout:** Name, password, notification preference shortcuts.

**Actions & features:** Edit own details only — no access to any other account from here.

---

## `/admin/settings/notifications`

**Purpose:** Personal notification preferences.

**Layout:** Toggle list — new request, order delayed, chat message, etc.

**Actions & features:** Per-account toggles only, not a platform-wide setting.

---

# Absorbed / removed since v1 — quick reference

| Was a separate route | Now lives |
|---|---|
| `chat/[customerId]` | Inline expand panel on `/admin/chat` |
| `sellers/new` | Modal/drawer on `/admin/sellers` |
| `sellers/[sellerId]/scrape-config` | Section/tab inside `/admin/sellers/[sellerId]` |
| `catalogues/new` | Modal/drawer on `/admin/catalogues` (and inline inside a manual seller's page) |
| `discounts/new` | Modal/drawer on `/admin/discounts` |
| `collections/new` | Modal/drawer on `/admin/collections` |
| `collections/[collectionId]/curate` | Section/tab inside `/admin/collections/[collectionId]` |
| `purchases/[purchaseId]/payment` | Inline field/section inside `/admin/purchases/[purchaseId]` |

# Still open / worth a quick decision

1. **`orders/[orderId]/age` nesting** — as built this scopes age-tracking to a single order, not the cross-order SLA-breach dashboard the original spec describes. Confirm intent before building.
2. Chat threading model, QC granularity, delivery confirmation source, payment timing, Catalogue 1:1-vs-decoupled — all still open per the original discussion, unaffected by this absorption pass.