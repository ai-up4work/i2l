# Custom seller storefront (Instagram / Facebook shops)

Custom sellers (no feed; they add products, photos and videos in the
seller portal) get their own storefront design. Feed stores (Shopify,
WooCommerce and so on), marketplaces and Wishdrop Mall are unchanged.

A store counts as "custom" when its seller row is `type = 'manual'` with
a `mock` provider config (`isSocialSellerRow` in
`lib/supabase/affiliated-stores-shared.ts`) — the same rule that already
serves these stores from the database.

## Setup

Run `data/wishdrop-social-stores.sql` in Supabase (after
`data/wishdrop-seller-media.sql`). It adds the store profile columns and
makes sure the `store_follows` table exists. Safe to run twice.

## What shoppers see

**Stores listing (`/stores`)** — a "Shops from Instagram & Facebook"
section: one tile per custom seller with their cover (or newest product
photos), logo, name, tagline, item count and video count. Hidden while no
custom seller has products.

**Store page (`/stores/<slug>`)**
- Cover photo, round logo, name, tagline, about text, item and video
  counts, Instagram / Facebook links, Follow and Share.
- "Watch and shop": the store's product videos in a row. Tapping one
  opens a full-screen, swipe-up viewer with the product's name, price and
  a "View product" button.
- Sticky category chips, search and sort.
- Photo-first product grid (2 per row on phones, 4 on desktop) with the
  price first, a wishlist heart that is always tappable, discount, "Only
  N left", "Sold out" and "Video" badges. "Show more" loads the next page.

**Product page**
- Store block with logo, tagline and Follow, linking back to the store.
- One clear price, with the service charge and delivery added at checkout
  spelled out, delivery time, and the "checked before it ships" promise.
- Videos play in the gallery after the photos.
- "More from <store>" under the details.
- On phones, a bar pinned to the bottom with the price and Add to bag
  (or "Choose options" when the product has sizes/colours) whenever the
  real buttons are off screen.

## What sellers do

**Seller portal → Store profile** (`/seller/account`): upload a logo and
cover photo, write a tagline and "about" text, add Instagram and Facebook
(a name like `@myshop` or a full link). Name, web address and margin stay
with staff.

## Files

| File | Purpose |
|---|---|
| `data/wishdrop-social-stores.sql` | Profile columns on `sellers`, `store_follows` |
| `lib/supabase/affiliated-stores-shared.ts`, `data/stores/data.ts` | `isSocial`, cover, tagline, social links on a store |
| `lib/social-stores.ts`, `app/api/stores/social/route.ts` | Tiles for the stores listing |
| `app/api/stores/[platform]/reels/route.ts`, `lib/store-providers/catalogue.ts` | Products with videos |
| `app/api/seller/profile/route.ts` | Seller reads/updates their store profile |
| `app/seller/(dashboard)/account/*` | Store profile form |
| `components/stores/social/SocialStoreClient.tsx` | Store page |
| `components/stores/social/SocialProductCard.tsx` | Product card |
| `components/stores/social/ReelsRow.tsx` | Video row and full-screen viewer |
| `components/stores/social/FollowButton.tsx` | Follow a store |
| `components/stores/social/SocialStoreTiles.tsx` | Section on `/stores` |
| `components/stores/social/SocialProductExtras.tsx` | "More from store", sticky buy bar |
| `components/stores/ProductPurchasePanel.tsx` | `social` prop: store block and single price |
| `app/(public)/stores/[platform]/page.tsx`, `.../product/[productId]/page.tsx`, `app/(public)/stores/page.tsx` | Switch to the new design for custom stores |

## Not included yet

- Follower counts, ratings and reviews (nothing real to show yet).
- Staff editing a seller's cover/tagline/social links from the admin
  seller page (sellers do it themselves in the portal).
- "My Following" in the account area still shows sample data; it isn't
  reading `store_follows` yet.
