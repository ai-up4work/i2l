# Store types, local stores, category images, Social Stores redesign

Run `data/wishdrop-store-types-and-location.sql` in Supabase first (row 13
in SUPABASE_MIGRATIONS_TO_RUN.md), then mark your Sri Lanka warehouse:
`update public.sites set country = 'LK' where name = '…';`

## 1. Store types are saved, not guessed

`sellers.store_source` is one of `feed`, `extractor`, `social`, `mall`
(`lib/catalogue-stores.ts`).

- **Seller wizard "mock" = extractor store.** Custom page + extractor in
  code. Lives only in Admin → Sellers and uses the standard store page.
- **Social store.** Created and managed only in Admin → Social Stores and
  uses the social store page.
- The old guess (any wizard "mock" store counted as social) is gone, so the
  two no longer show up in each other's places. The migration moves old
  mock stores that already have products in our database over to social
  stores properly. Every other mock store becomes an extractor store.
- Custom extractors are listed in `lib/store-providers/sellers/index.ts`
  (`CUSTOM_EXTRACTOR_SLUGS`) instead of `'anishka-creation'` being
  hardcoded in several places.

## 2. Local Sri Lankan stores

Any store type can be set to **Store location: Sri Lanka (local)**. It's in
the seller wizard (Profile step) and on the Social Store page.
`sellers.store_origin`, default `IN`. Numbers are in `lib/store-origin.ts`.

| | India store | Local store |
|---|---|---|
| Price | import formula | store price (LKR) + margin (30% for feed/extractor stores; social stores use their own margin, already in the price) |
| Service charge | Rs 250 | none |
| Delivery | as before | Rs 450 per item (same as Wishdrop Mall) |
| Pickup | — | **Rs 500 once per local shop per order**, shown to shoppers as the **service charge** (split across that shop's items in the cart), the same label imported items use |

**Currency of social store prices.** The store decides it, not each
product: LKR for a local store, INR otherwise. Every save writes the
store's currency. Switching a store's location converts all its products.
The storefront, cart, wishlist, boards and admin pages read the currency
from the store, so a row saved the old way can't show the wrong price. The
migration also fixes existing rows (section 4 of
`data/wishdrop-store-types-and-location.sql`). Saved items (wishlist,
boards, header cart) now show the price the shopper actually pays in LKR,
not the seller's raw price.

**Shoppers are never told a store is local.** No flag, country or "local"
wording appears on the customer side. A local product's page uses the same
layout and words as any other ("At checkout: Rs 500 service charge + Rs 450
delivery"). In the cart, the handling fee is part of the "Service charge"
line, never its own line. Local labels (🇱🇰 Local) appear only
in admin.

**Checkout.** A bag with both Indian and local items is placed as two
orders, one per journey. The handling fee goes on the local order.
`orders.store_origin = 'LK'`, `orders.pickup_fee_lkr`. The local order goes
to the site marked `country = 'LK'`, or to the default site if none is.

**Local order steps.**
- Purchases: collect from the shop.
- Quality check at the Sri Lanka warehouse. Once every item passes, the
  order goes straight to **Shipped** (ready for delivery).
- Delivered.

Pack & label, Export bin and In transit are skipped. Purchases, QC,
Shipped and the order page show a "Local shop" badge.

## 3. Category images for affiliated stores

- **Seller wizard → Test & verify.** After the checklist passes, every
  category is shown with its image:
  - the store's own image (Shopify collection image or WooCommerce
    category image), or else
  - a random product photo from that category, picked automatically.
  Click a photo to choose another one, or untick a category to hide it.
- **Extractor stores** (code extractors) get the same panel through the
  saved store: "Find category images".
- **Saving.** Choices are saved as `provider_config.categoryTiles`: with
  the store on Finish, or with "Save category images" when editing.
- **Store page.** Affiliated stores now show a round **Shop by category**
  row, like social stores. Tapping a tile filters the store.
- Logic: `lib/category-tiles.ts`. Routes: `test-extractor`
  (`categoryImages: true`) and `/api/admin/sellers/[platform]/category-images`.

## 4. Social Stores admin redesign

The list, store and product pages share one kit
(`components/admin/catalogue/ui.tsx`) that follows the Sellers page:
- icon header with a stat strip
- pill tabs with counts
- rounded-full buttons
- one style for Live/Hidden/Active pills
- one style for empty and loading states

The list has a **Stores** view (cards) and a **Products** view (filterable
table). The store page has an edit column with a sticky save bar, and a
side column with setup progress, products and the seller login.
