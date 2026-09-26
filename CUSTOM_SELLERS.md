# Custom sellers: portal, login and store pages

Custom (manual) sellers are sellers with no product feed. They log in to the
seller portal and add their own products.

## For staff

1. **Admin → Sellers → open the seller → Seller portal login**: enter their
   email and click create. The temporary password is shown **once**; send it to
   the seller.
2. The seller signs in at `/seller/login`, then changes the password under
   **Account**.
3. Forgot password? Open the seller again and click **Reset password** to issue a
   new temporary one (the old one stops working).
4. **Admin → Sourcing → Catalogues** lists every product sellers have added,
   including hidden ones. Open one to change Wishdrop's margin for that product,
   or hide it.

## For sellers (`/seller`)

- **My products**: add/edit products with their cost price, stock, weight and
  photo links (one per line). Wishdrop's markup is applied automatically.
  Click a status pill to hide/show a product.
- **View my store**: their public page, `/stores/<their-slug>`.
- **Account**: change password.

## How pricing works

The seller enters their **cost in INR**. The server sets
`price = cost × (1 + margin%)`, using the seller's default margin for new
products or the product's own margin (if staff changed it in Catalogues) for
edits. Sellers can't send a price or margin themselves. On the storefront that
INR price then goes through the normal import formula, like any Indian store.
(Wishdrop Mall is the only store with fixed LKR pricing.)

## What changed in this round

- **Their products now appear on their store page.** Before, custom sellers used
  the `mock` provider, which only showed hardcoded demo products. They're now
  served from the database (`lib/store-providers/catalogue.ts`). A seller who
  hasn't added any products yet still shows the old demo products, so no live
  store page goes empty; once they add one real product, only real ones show.
- **Seller portal writes go through the server** (`/api/seller/products`), scoped
  to the logged-in seller. Before, the browser wrote to the database directly,
  so a seller could set any price, and hidden products disappeared from their own
  list.
- **Catalogues moved into admin** (`/admin/catalogues`). The pages were sitting in
  `app/(seller)/` and served at `/catalogue` behind the *seller* login, so any
  logged-in seller could see every seller's cost prices and margins. The stray
  `app/(seller)/` folder is deleted.
- **`/api/admin/catalogues/[id]` is staff-only.** It used to accept any logged-in
  user, so a customer or seller account could change margins or hide products.
- **Login**: temporary passwords are cryptographically random; staff can reset a
  seller's password; sellers can change their own. Fixed a bug where the new
  temporary password was never displayed after creating a login.
- `data/wishdrop-mall.sql` now hides cost, margin and source columns from all
  browser access (anonymous and logged-in).
