# Wishdrop Mall — your own store as a sales channel

Wishdrop Mall is Wishdrop's own store, listed next to your affiliated sellers at
`/stores/wishdrop-mall`. You fill it from the admin panel with products picked
from any seller's live catalogue, or from any product link, and sell them under
the Wishdrop name at a price you set in rupees.

**The Mall sells stock Wishdrop already holds** (bought in bulk), not
drop-shipping. So it runs on your own data: products, prices and quantities
live in your database, and nothing is fetched from the supplier while
shoppers browse or buy. (Images you paste as links still load from where they
are hosted; see Images.)

## Inventory

- Every Mall product has a **quantity in stock**, per variant if it has variants
  (the product total is then their sum). You enter it in the editor; it's required.
- **0 = sold out** on the storefront, and that variant can't be chosen.
- **Checkout checks stock first**: if a customer wants more than you hold, the
  order is stopped with "Only N left of …".
- **Stock goes down automatically** when an order is placed. The server reads the
  order's own items (never quantities sent by the browser) and deducts through the
  `mall_deduct_stock` database function, which can't deduct the same order item
  twice. If two people buy the last unit at the same moment, stock stops at 0 and
  the shortage is recorded for you.
- **Every change is logged** in `mall_stock_movements`: sales (`order`) and edits
  you make in the editor (`manual_edit`), with the quantity after each change.
- **Cancellations/returns**: add the units back in the editor (logged as a manual edit).

## Images

- **Pasted or imported image links are saved as links.** They keep loading from the
  supplier's site; nothing is copied. If the supplier ever removes or changes a
  photo, replace that link in the editor.
- **Photos you upload** (editor → Images → **Upload from computer**) are stored in
  your own Supabase Storage (`uploads` bucket), e.g. photos of your own stock.
- You can mix both on one product; the first image is the primary photo.

## Pricing (simple on purpose)

- You set each product's **price in LKR**. That price already covers
  everything (buying it, import, duty, your profit).
- The customer pays **your price + a flat delivery fee** (Rs 450). Nothing
  else: no tax, no customs/freight/postal charges, no service charge, no
  exchange-rate markup.
- A product can have an optional **"was" price** to show a discount.
- Variants use the product's price unless you give one its own price.

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

Three ways, all ending in the same **product editor**:

- **Browse a store**: pick any seller with a live feed, search, click **Add**.
  Loaded with the same code the storefront product pages use.
- **Paste a link**: Amazon, Flipkart, Myntra, Shopify/WooCommerce stores, your own
  sellers. Uses the same scraper as `/api/product-lookup`, with variants on. If a
  page can't be read, you can continue by entering details manually.
- **Add manually**: an empty editor.

### The product editor

Everything the extractors found is filled in and editable before you save:

- **Basics**: title, brand, category, who it's for, SKU/model number, tags.
- **Images**: the first is the primary photo, the rest are the gallery. Reorder,
  "Make primary", remove, or paste more links.
- **Price**: your price in Rs and an optional "was" price. It shows what the
  customer pays (price + delivery) and, for reference, the source price and what
  the item would cost through normal import.
- **Description, highlights and specifications**: highlights come from Amazon's
  "About this item"; specs from its product details or from a spec table inside a
  store's description. On the product page they show as bullets plus the Details
  table.
- **Inventory & supplier (staff only)**: quantity in stock, weight, supplier link
  and supplier price (for reordering).
- **Variants**: up to 3 options (e.g. Color, Size). Type values and click
  **Create all combinations**, or add rows one by one. When a supplier lists sizes
  separately from its designs (e.g. Anishka Creation), the editor offers **Add sizes**:
  one click turns 12 designs into 12 × 4 design-and-size variants, each keeping its
  design's photo and supplier link, with its own quantity. Imported products also get
  every variant's photo in the gallery. Each variant has its own
  **quantity in stock**, and optionally its own price (blank = product price),
  image, supplier link and supplier price. Amazon colour/size groups are turned into these rows automatically, each
  with its own link, price and image.

## Categories

Open the **Categories** tab on the Mall page.

- **Create** a category by name (e.g. Sarees, Home & Kitchen). Optionally give it a
  description and image (pencil icon).
- **Order**: the up/down arrows set the order shoppers see.
- **Hide** a category (eye icon) to take it off the storefront without deleting it.
- **Delete**: its products become uncategorized; they are never deleted.
- **Rename**: every product in it follows automatically.

Putting products in a category (a product is in one category at a time):

- In the **product editor**, pick it from the Category dropdown, or choose
  **+ New category…** to create one on the spot. When importing, if the supplier's
  category matches one of yours it's pre-selected; otherwise it's shown as a hint
  with a **Create it** button.
- On a category, **Manage products**: tick exactly which products belong to it
  (you can show only uncategorized products to sort them quickly).
- In the **Products** table: select products, then **Move to category…**.
  The table can also be filtered by category.

On the storefront, the category filter lists your categories in your order, but
only ones with at least one visible product. Uncategorized products still show
under "All".

## Managing products

- **Edit (pencil)**: reopens the full editor for any product.
- **Price (Rs)**: quick edit in the table; press Enter. Variants with their own price
  keep it.
- **Live / Hidden**: click the status pill.
- **Check supplier price (↻)**: re-reads the supplier's page and records their
  current price per product/variant, handy before reordering. It **never changes
  anything shoppers see**: not your price, stock, or which variants are for sale.
  It tells you if the supplier is sold out or has added/dropped options.
- **Stock column**: quantity on hand; "Sold out" at 0, amber when 3 or fewer.
- **Filter by source**: e.g. "From giva" or "Added manually", to manage everything
  that came from one store.
- **Select several** (checkboxes, or the header box for everything shown), then
  **Show**, **Hide** or **Delete** them together.

## How it works (for developers)

- New store provider type `catalogue` (`lib/store-config.ts`). The Mall is a normal
  `sellers` row (`platform_slug = 'wishdrop-mall'`, `store_kind = 'local'`,
  `provider_type = 'catalogue'`), so it appears everywhere local stores do and uses
  the normal cart flow.
- `lib/store-providers/catalogue.ts` serves any `catalogue` store from the
  `products` / `product_variants` tables, wired into `/api/stores/[platform]`
  (list, categories) and `fetchStoreProduct` (product pages). It selects an explicit
  public column list, so source details are never sent to shoppers.
- Editor: `components/admin/wishdrop-mall/ProductEditor.tsx`; validation in
  `cleanMallInput` (`lib/wishdrop-mall/admin.ts`). Brand/highlights/specs are stored
  as columns and composed into the product page's description HTML at serve time
  (`composeDescriptionHtml` in `lib/store-providers/catalogue.ts`). If the SQL hasn't
  been re-run, the storefront falls back to the old columns instead of breaking.
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
