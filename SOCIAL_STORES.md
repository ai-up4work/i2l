# Custom seller storefront (Instagram / Facebook shops)

Custom sellers (no feed; they add products, photos and videos in the
seller portal) get their own storefront design. Feed stores (Shopify,
WooCommerce and so on), marketplaces and Wishdrop Mall are unchanged.

## Creating a store (Admin → Social Stores)

Social stores are created in **Admin → Social Stores** (the sidebar item
that used to be called Catalogues; the address is still
`/admin/catalogues`), not in the seller wizard. In the wizard, the "mock"
method now means *a custom extractor built into the code* (like Anishka
Creation), and nothing else.

1. **New store**: name, web address, seller's contact, margin. It is
   saved as a `catalogue` store and starts **hidden**.
2. You land on the store's page, which walks through the rest in order:
   - **Give the seller a login** (optional): enter their email, get a
     one-time temporary password to send them. Reset it here too.
   - **Add products**, yourself or by the seller in their portal.
   - **Customise the store page**: logo, cover, tagline, about, Instagram
     and Facebook.
   - **Go live** (needs at least one active product). "Hide store" takes
     it down again.

Sellers set up the old way (wizard → mock) are listed with "old setup";
open one and press **Make this a catalogue store** to move it over.

A store counts as a social store when its provider type is `catalogue`
(and it isn't Wishdrop Mall): `isCatalogueStoreRow` in
`lib/catalogue-stores.ts`.

## Hidden stores

A store that isn't live (hidden in Social Stores, or deactivated on the
Sellers page) shows shoppers a friendly "<store> isn't open right now"
page (`components/stores/StoreUnavailable.tsx`), and its products don't
appear anywhere. A store or product address that doesn't exist gets the
same style of page instead of a bare 404.

Staff (Super Admin, Manager, Sales) **and the store's own seller** can
still open it, as a preview with a yellow bar explaining it isn't live.
The seller portal's "Preview my store" links there. Preview responses are
never cached. Logic: `lib/store-preview.ts`.

Turning a store back on: **Go live** on its Social Stores page (asks to
confirm when it has no active products), or **Activate** on the Sellers
page for stores managed there.

Sellers created the old way (wizard → mock) also get the social store
page; use "Make this a catalogue store" to manage them fully here.

## Collections

On the store's admin page, under **Collections**: create, rename,
reorder, hide/show and delete collections, and **Choose products** for
each (photo grid). Products can also be ticked into collections from the
product editor (side column), where staff and sellers can create a new
one on the spot. A product can be in several collections.

Shoppers see a "Shop by collection" row on the store page and the
collections as filter chips (before the categories). Only collections
with at least one active product are shown. Needs
`data/wishdrop-store-collections.sql`.

## Product editor

One editor for staff and sellers (`components/catalogue/ProductForm.tsx`),
laid out like Shopify's product page:

- **Title and description**
- **Media**: photos and videos, reorder, first photo is the main one
- **Pricing**: the seller's price and an optional "was" price; shows what
  it will be listed at (price + margin) and the discount
- **Inventory**: track quantity on/off, quantity, SKU
- **Shipping**: weight in kg (0.5 kg is used when empty)
- **Variants**: sizes and/or colours; every combination gets a row with
  its own quantity, and optionally its own price, SKU and photo, and can
  be switched off. Photos are chosen from thumbnails, once per colour or
  for one variant or all; "Set for all variants" fills price and quantity
  in one go
- **Product details**: key points (bullets) and a details table
  (Material, Care instructions, Size chart…)
- Side column: **Status** (Active / Draft), **Organization** (category,
  brand, who it's for, tags), and for staff the **margin**

Prices are always worked out on the server (`lib/catalogue-products.ts`):
listed price = seller's price × (1 + margin%), and the same for the "was"
price and each variant's own price. Changing a product's margin re-prices
all of them.

Needs `data/wishdrop-mall.sql` (brand, key points, details, variant
prices) and `data/wishdrop-seller-media.sql` (videos) to have been run.
Not included: alt text on photos, SEO title/description fields, and
options other than size and colour (the storefront picker only shows
those two).

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
| `lib/catalogue-stores.ts`, `lib/catalogue-stores-admin.ts` | What a social store is; slug rules |
| `app/api/admin/catalogues/stores/**` | Create and manage a store (staff) |
| `app/admin/(protected)/(sales)/catalogues/stores/[slug]/page.tsx` | New store, and the store's setup page |
| `lib/catalogue-products.ts` | Product rules and saving (variants, pricing) |
| `components/catalogue/ProductForm.tsx` | Product editor |
| `lib/store-preview.ts`, `components/stores/social/HiddenStoreBanner.tsx` | Staff preview of hidden stores |
| `data/wishdrop-store-collections.sql`, `lib/store-collections.ts` | Collections |
| `app/api/admin/catalogues/stores/[slug]/collections/**`, `app/api/seller/collections`, `app/api/stores/[platform]/store-collections` | Collections APIs |
| `components/admin/catalogue/StoreCollections.tsx` | Collections on the store's admin page |
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


## Seller side

- **Sign in** (`/seller/login`): split screen. The indigo side shows the
  pitch and the post-to-listing illustration
  (`components/seller/PostToListing.tsx`); the form side has show/hide
  password, clear errors, "Forgot your password? Message us on WhatsApp"
  and a link to apply.
- **Sell on Wishdrop** (`/stores/apply`): written for Instagram/Facebook
  sellers. Hero, "selling abroad over DMs vs with Wishdrop", how it works
  (4 steps), seller questions, then the application form. Applications
  are saved (`data/wishdrop-seller-applications.sql`) and listed at the
  top of Admin → Social Stores, with WhatsApp, "Create store"
  (pre-filled from the application) and Decline.
- **Portal**: indigo rail on desktop (store, Overview, Products, Store
  profile, Add product, view/preview store, message Wishdrop, sign out);
  bottom tab bar on phones with "Add" in the middle.
- **Overview** (`/seller`): the store header as shoppers see it, products
  on sale / drafts / sold out / videos, "Needs attention" (sold out and
  running low), latest products, and a "Make your store shine" checklist.
