# Wishlist Boards — Feature Spec

## 1. Purpose

A plain **wishlist** is one flat bucket: everything a user saves goes into a single undifferentiated list. It answers "what do I want to buy eventually?"

**Wishlist Boards** solve a different problem: *organizing intent by context*. Users save things for different reasons (a gift list, an outfit, a seasonal need, a mood/aesthetic), and a single flat list forces them to mentally re-sort everything every time they look at it. Boards let users pre-sort by giving each list a purpose, and — critically — boards are **shareable as a unit**, turning a personal save-list into a communicable artifact (e.g. "here's my birthday wishlist" or "here's the outfit I built").

**Core value props:**
- **Organization** — group saved items by theme/occasion instead of one long scroll
- **Intent capture** — a board name itself is a data signal ("Birthday," "Work Capsule," "Gift for Mom") useful for personalization/marketing
- **Shareability** — a board is a discrete, nameable, shareable object; a wishlist typically isn't
- **Purchase batching** — a board can be converted to a cart in bulk, turning planning into a checkout action

---

## 2. Wishlist vs. Wishlist Boards — Key Differences

| Dimension | Plain Wishlist | Wishlist Boards |
|---|---|---|
| Structure | Single flat list per user | Multiple named lists ("boards") per user |
| Cardinality | 1 list | N boards (0 or unlimited, per product decision) |
| Naming | None (implicit "My Wishlist") | User-defined name per board (editable) |
| Item movement | N/A | Items can move between boards |
| Sharing | Sometimes shares whole wishlist | Shares a *specific* board (finer granularity) |
| Purchase flow | "Add all to cart" acts on everything | "Add all to cart" acts on one board only |
| Use case | Generic save-for-later | Contextual/occasion-based curation |
| Data modeling | `wishlist_item(user_id, product_id)` | `board(id, user_id, name)` + `board_item(board_id, product_id, variant, qty, position)` |
| Guest support | Simple, often local-storage based | Harder for guests — boards imply persistence/identity, usually requires account or session continuity |
| Default state | Exists automatically | Usually needs a "Default" board auto-created, or empty state prompting first board creation |

**In short:** a board is a wishlist with a name, a scope, and a share/checkout boundary drawn around it.

---

## 3. Functional Requirements

### 3.1 Board Management (CRUD)
- Create a new board (name required, description optional)
- Rename a board
- Delete a board (with confirmation; decide: delete items too, or offer "move items first")
- Duplicate a board (nice-to-have)
- Reorder boards in the user's board list (nice-to-have)
- Set a board's visibility: private / shared-via-link / public (design decision)
- Optional: cover image (auto-generated from first N items, or user-uploaded)
- No hard limit on number of boards (per Shein's stated approach), but consider soft limits for abuse/performance (e.g. warn past 50)

### 3.2 Item Management within a Board
- Add item to a board (from PDP, search results, or category page — usually a heart/save icon with a board picker)
- Add item to **multiple** boards simultaneously (decide: allowed or not — most implementations allow it)
- Remove item from a board
- Move item from one board to another (single move, not copy)
- Save selected variant with the item (size, color) — not just the base product
- Save quantity per item (optional but expected for gifting/bulk use cases)
- Reorder items within a board (drag to reorder — supports "outfit" style curation)
- Show item availability status (in stock / out of stock / price changed since saved)

### 3.3 Cart Integration
- "Add to Cart" per individual item within a board
- **"Add All to Cart"** for the entire board in one action
  - Must respect saved variant + quantity
  - Must skip/flag unavailable items and report which ones were skipped
  - Post-action behavior: redirect to cart, redirect to checkout, or stay on board (make this configurable)
- Optionally: "Add selected items to cart" via checkboxes (partial board push)

### 3.4 Sharing
- Generate a shareable link/code for a specific board (not just the whole account wishlist)
- Shared board opens either:
  - A public read-only view (no login required), or
  - A flow where the recipient can import the board/cart into their own account
- Access control: decide if login is required to view, and whether it's required to interact (add-to-cart from someone else's board)
- Social share integrations (copy link, share to socials, share via message)
- Consider: does sharing reveal price, or just item info? (privacy/gifting consideration — a shared gift board shouldn't necessarily broadcast prices)

### 3.5 Notifications / Re-engagement (optional but valuable)
- Price-drop alerts for saved items
- Back-in-stock alerts
- Low-stock urgency indicators
- "Items in your board are trending" nudges

### 3.6 Guest & Auth Handling
- Decide: can boards exist for anonymous/guest users?
  - If yes: store board in local storage / session, and merge into account on login/signup
  - If no: creating a board requires login (simplest, but higher friction)

---

## 4. Data Model (minimum viable)

```
User
 └── id

Board
 ├── id
 ├── user_id (FK → User)
 ├── name
 ├── description (nullable)
 ├── visibility (private | link | public)
 ├── share_token (nullable, unique)
 ├── created_at / updated_at
 └── position (for board ordering)

BoardItem
 ├── id
 ├── board_id (FK → Board)
 ├── product_id (FK → Product)
 ├── variant_id (nullable — size/color/etc.)
 ├── quantity (default 1)
 ├── position (for item ordering within board)
 └── added_at

Product / Variant
 ├── availability status
 ├── current price (compare against price_at_save if tracking price drops)
```

**Notes:**
- Store `price_at_save` on `BoardItem` if you want price-drop notifications.
- `variant_id` is important — without it, "Add All to Cart" can't reliably know which size/color to add.
- `share_token` should be a random opaque string, not a sequential ID, to prevent board enumeration.

---

## 5. UX / UI Requirements

- **Save flow:** heart/bookmark icon on product card and PDP → opens a lightweight picker: "Add to board" with existing boards listed + "Create new board" inline
- **Board list view:** grid/list of the user's boards, each showing a thumbnail collage (first 3–4 item images), name, item count
- **Board detail view:** grid of items, each with image, name, price, variant, quantity stepper, remove button, individual "Add to Cart"
- **Bulk actions bar:** "Select All," "Add Selected to Cart," "Add All to Cart," "Share Board," "Delete Board"
- **Empty states:** first-time user sees a prompt to create their first board; empty board shows a "browse products" CTA
- **Move-item modal:** when moving an item, show a list of other boards to move it into (with option to create new)
- **Unavailable item handling:** visually gray out / badge "Sold Out" items so bulk add can clearly explain what got skipped

---

## 6. Edge Cases to Handle

- Item added to a board, then later removed from catalog entirely → should not crash "Add All to Cart"; show as unavailable
- Item's variant (e.g. saved size) goes out of stock while base product remains available → offer to pick a new variant instead of silently failing
- User shares a board, then deletes/renames it → shared link should degrade gracefully (show "this board is no longer available" rather than error)
- Duplicate items across boards → decide if that's allowed (usually yes, since boards represent different contexts)
- Guest board merge conflicts on login (same product already in an account board) → dedupe rather than duplicate
- Price changes between save and "Add to Cart" → decide whether to notify user of the new price before adding (good practice, avoids surprise at checkout)
- Rate limiting on "Add All to Cart" for very large boards to avoid backend overload

---

## 7. MVP vs. Later Phases

**MVP (v1):**
- Create/rename/delete boards
- Add/remove items to/from boards (with variant + qty)
- Move item between boards
- Add All to Cart per board
- Basic share link (read-only public view)

**Phase 2:**
- Price-drop / back-in-stock notifications
- Partial bulk-add (checkbox selection)
- Drag-to-reorder items
- Import shared board into your own account
- Board cover images / customization

**Phase 3:**
- Collaborative boards (multiple users editing one board — e.g. shared gift registry)
- Analytics for merchants (which boards/items are most saved — demand signal)
- AI-suggested boards/groupings based on browsing behavior

---

## Summary

A wishlist is a bucket. A **board is a bucket with a name, a boundary, and a door out to checkout and to other people**. The differentiator isn't the saving mechanic (that's identical) — it's the **grouping, sharing, and bulk-conversion-to-cart** layered on top. Build the data model around boards-containing-items (not items-with-a-board-tag) so an item can belong to multiple boards cleanly, and treat "Add All to Cart" and "Share" as first-class actions scoped to a single board, not the whole wishlist.
