# Wishdrop Mall — your own store as a sales channel

Wishdrop Mall is Wishdrop's own store, listed next to your affiliated sellers at
`/stores/wishdrop-mall`. You fill it from the admin panel with products picked
from any seller's live catalogue, or from any product link, and sell them under
the Wishdrop name at a price you set in rupees.

## Pricing (simple on purpose)

- You set each product's **price in LKR**. That price already covers
  everything (buying it, import, duty, your profit).
- The customer pays **your price + a flat delivery fee** (Rs 450). Nothing
  else: no tax, no customs/freight/postal charges, no service charge, no
  exchange-rate markup.
- A product can have an optional **"was" price** to show a discount.
- All sizes/colours of a product share the same price.

The delivery fee is `MALL_DELIVERY_FEE_LKR` in `lib/wishdrop-mall.ts`. It
reuses the site's existing flat delivery fee, so it changes if that does; set
a number there to give the Mall its own rate.

Your other stores are unaffected: they still use the normal import formula.
The Mall is recognised by store (not by currency), because some of your
affiliated sellers also price in LKR and must keep the import formula.

## Setting it up

1. Run `data/seller-status-values.sql`, then `data/wishdrop-mall.sql`, in the Supabase SQL editor (both safe to run twice).
2. In the admin panel, open **Super Admin → Wishdrop Mall**
   (`/admin/super-admin/wishdrop-mall`) and click **Set up
   Wishdrop Mall**. The store starts **hidden** from shoppers.
3. Open **Store settings** to set the name, description and logo.
4. Add products (below), then click **Go live**.

Who can use it: **Super Admin only.** Wishdrop's own store is run by the super
admin, so the page sits under `/admin/super-admin/` (blocked for other roles by
the middleware) and every Mall API route checks for super admin on the server.
The old `/admin/wishdrop-mall` address redirects there.

## Adding products

**Browse a store** — pick any active seller that has a live feed, search its
catalogue (the same one shoppers see) and click **Add**. Sizes/colours and their
individual prices come across too. Products already in the Mall show "In Mall".

**Paste a link** — any product URL. Links from your own sellers are read from
their feed; anything else (Amazon, Flipkart, Myntra…) goes through the existing
scraper. Scraped links come in as a single-price product with no size/colour
options, and the price is read from the page, so check the cost and currency in
the preview before adding.

In the preview you set the name, category and **price (Rs)**, plus an optional
"was" price. It also shows, for reference only, the source's price (with a rough
rupee equivalent) and what the same item would cost the customer through
Wishdrop's normal import channel, so you can see how your Mall price compares.

## Managing products

- **Price (Rs)**: edit it in the table and press Enter.
- **Live / Hidden**: click the status pill.
- **Refresh (↻)**: re-checks the product at the source and records its current
  price, stock and available sizes/colours. It **never changes your Mall price**;
  if the source price moved, it tells you so you can decide. It won't auto-hide a
  sold-out product (you get a warning instead).
- **Sourced from** links to the exact product page, so when an order comes in
  staff know where to buy it. Shoppers never see this.

## How it works (for developers)

- New store provider type `catalogue` (`lib/store-config.ts`). The Mall is a normal
  `sellers` row (`platform_slug = 'wishdrop-mall'`, `store_kind = 'local'`,
  `provider_type = 'catalogue'`), so it appears everywhere local stores do and uses
  the normal cart flow.
- `lib/store-providers/catalogue.ts` serves any `catalogue` store from the
  `products` / `product_variants` tables, wired into `/api/stores/[platform]`
  (list, categories) and `fetchStoreProduct` (product pages). It selects an explicit
  public column list, so source details are never sent to shoppers.
- `lib/pricing.ts` treats Mall items as fixed-price (`isFixedPriceItem`, keyed on
  the store slug): price as set + `MALL_DELIVERY_FEE_LKR`, no import formula. This
  covers catalogue cards, product pages, the mini-cart, the cart and checkout.
  Product pages show a single price + delivery instead of the Economy/Express
  comparison.
  The storefront cache for this store is 60s instead of 24h so edits show quickly.
- Admin API: `app/api/admin/wishdrop-mall/**` (store, sources, preview, products,
  refresh). Sourcing logic: `lib/wishdrop-mall/sourcing.ts`. Shared price maths:
  `lib/wishdrop-mall.ts`.
- The Mall is excluded from the regular **Sellers** list so it can't be edited
  through the third-party seller wizard.

## Known limits / next steps

- **Delivery is charged per item, not per order**, matching how the rest of the
  site works today (each unit's price includes its delivery, and orders have no
  separate delivery field). So 2 Mall items = 2 × Rs 450. Charging it once per
  order needs an order-level delivery field; that's a separate change.
- Products added before rupee pricing existed show **"Needs a rupee price"** in
  the table; type a price to fix them.

- **Order fulfilment isn't linked yet.** An order for a Mall product shows up like
  any other store order; staff find the source link on the Mall page. A "buy from
  source" link on the order page would be a good follow-up.
- **Seller status values**: run `data/seller-status-values.sql` first, or setup fails with *invalid input value for enum seller_status: "inactive"*.
- Prices aren't auto-refreshed on a schedule; use ↻ per product.
