# Cart, wishlist and boards follow the account

**Run `data/wishdrop-account-sync.sql` in Supabase before deploying this code.**

## The rule

Signed in, the database is the source of truth. Local storage is only a cache, kept per account (`Wishdrop:cart:u:<user id>`, `Wishdrop:wishlist:u:<user id>`).
- **On load:** the cache shows instantly, then it is replaced with what the database holds.
- **On every add, quantity change or remove:** the screen and cache update at once, and the exact change is written to the database straight away. The whole local cart is never pushed up.
- **Other devices update:** instantly through Supabase Realtime, and again whenever a tab comes back into focus. Tabs in the same browser follow each other too.
- **Clear:** clearing the wishlist or cart deletes every row for the account, so it stays cleared everywhere.

Signed out, a guest cart and wishlist live on the device. On sign-in, guest items are added to the account once (anything already there is left alone) and the guest copy is emptied.

## What was wrong

- Every load pushed the whole local copy to the database before reading it back. A stale device brought removed items back, and quantities fought between devices.
- Deletes looked items up by URL and picked the newest product snapshot. When the row pointed at an older snapshot, nothing was deleted.
- Boards only ever lived in local storage, so they were different on every device and share links didn't open anywhere.

## Changes

- **Database (`data/wishdrop-account-sync.sql`):**
  - `cart_items.line_key` + `product`, and `wishlist_items.item_key` + `product`. Rows are keyed by the item's link and hold the item itself. Existing rows are backfilled and duplicates removed.
  - `boards.items` saves each board, with its items inside it, as one row.
  - Realtime is turned on for the three tables.
- **Code:**
  - `lib/account-sync.ts` holds the shared plumbing.
  - `contexts/Cartcontext.tsx` and `contexts/Wishlistcontext.tsx` are rewritten on top of it, with the same functions as before.
  - Boards made before this get a new id and are uploaded once from each device.
- **Shared board links:** `/board/<token>` now opens on any device, for boards set to "Anyone with the link".
