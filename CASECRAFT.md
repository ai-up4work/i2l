# Case Craft: a custom store with its own pages

Case Craft (custom-printed phone cases) is a **custom store**: a seller wizard "mock" store (type `extractor`) whose customer page and seller pages are written in code just for it. It does **not** use the Wishdrop order pipeline or any admin page. Anishka Creation and every other store are unchanged.

## Set up

1. Run `data/wishdrop-casecraft.sql` in Supabase (row 15 in SUPABASE_MIGRATIONS_TO_RUN.md).
2. Copy the phone templates from the Case Craft project into `public/phoneCases/`, same file names (e.g. `ToughCases iPhone 15.png`, `Tough Phone Cases iPhone 15.png`). One flat folder.
3. In Admin → Sellers, the store's slug must be `case-craft` (or `casecraft`). Create its seller login there, as for any store, and make it live.
4. Set the margin (see below), then the seller sets prices and adds designs.

## Customer page: /stores/case-craft

- **Design your own:** case → phone → print style (full cover, framed, top half) → upload photo, drag and zoom on the case → delivery and payment → order.
- **Ready-made:** the seller's designs. Pick one, pick your phone, order.
- **Your orders:** the shopper's own Case Craft orders and their status.

Shoppers must be signed in to their Wishdrop account to upload a photo and order. The photo, a print-ready image (1440×2560, photo as placed, no template) and a preview with the template are uploaded straight to Supabase Storage (`uploads/casecraft/<user>/`). Orders are saved to `casecraft_orders`. Nothing goes over WhatsApp, and no ZIP file is downloaded.

## Seller portal

When a Case Craft seller signs in, the portal shows their own sections instead of Overview / Products:
- **Print jobs:** every order. Download the print file, the customer's photo and the preview; call or WhatsApp the customer; set the status (New → Confirmed → Printing → Dispatched → Delivered, or Cancelled), a tracking number and a private note.
- **Ready-made designs:** add, edit, hide or delete designs: photo, name, case type, price, and which phones each design fits (or all).
- **Prices & models:** the price per case type and phone size (Standard, Pro/Max, Plus, Pro Max/Ultra); which case types and phones are on sale; delivery fee and free-delivery threshold; cash on delivery and bank transfer (with the bank details shown after ordering); delivery time text; the most a shopper can order at once.
- **Store profile:** unchanged.

## Margin (staff only)

Super Admins and Managers sign in at **/seller/login with their own staff login**, pick the store on /seller/stores, and see the portal with a "Staff view" bar. Only then does **Prices & models** show the **Wishdrop margin** card. The seller's own login never shows the margin, and the API refuses a margin change from it.

Shopper price = seller price × (1 + margin %), rounded up to the next Rs 10. Delivery is added once per order. The margin is applied on the server; the browser only gets final prices. Each order saves the seller price, margin, shopper price, delivery and total at the time of ordering.

## Adding another custom store

`lib/store-modules/index.ts` explains it. Add a folder under `lib/store-modules/<key>/`, register the store slugs and seller sections there, its customer page in `lib/store-modules/storefronts.tsx`, and its seller pages in `lib/store-modules/seller-sections.tsx`.

## Files

- `lib/store-modules/`: registry, Case Craft catalog (`casecraft/catalog.ts`, 51 + 32 phone templates), settings and pricing, server loaders.
- `components/store-modules/casecraft/`: customer page, builder, ready-made, checkout, seller pages.
- APIs:
  - `app/api/casecraft/{upload-url,orders}` (shoppers);
  - `app/api/seller/casecraft/{settings,designs,orders}` (seller);
  - `app/api/seller/staff-view` (staff).
- `app/seller/(dashboard)/studio/[section]` and `app/seller/stores`.
