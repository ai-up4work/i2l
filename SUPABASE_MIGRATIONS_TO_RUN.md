# SQL to run in Supabase (from this round of work)

Run in this order in the Supabase SQL editor. Every file is safe to run
more than once.

| # | File | What it does | Also needs |
|---|---|---|---|
| 1 | `data/Wishdrop-push-notifications.sql` | Push subscriptions, offers preference, broadcast history, chat push trigger | Two Vault secrets — see PUSH_NOTIFICATIONS.md |
| 2 | `data/Wishdrop-unique-chat-handles.sql` | Unique `@handle` for every customer | — |
| 3 | `data/Wishdrop-whatsapp-manual-verification.sql` | Staff-reviewed WhatsApp number verification | Optional `NEXT_PUBLIC_WHATSAPP_VERIFY_NUMBER` — see WHATSAPP_VERIFICATION.md |
| 4 | `data/Wishdrop-chat-message-retag.sql` | Staff re-tagging of chat messages | — |
| 5 | `data/Wishdrop-chat-whatsapp-handoff.sql` | Send chat messages / reminders to WhatsApp | Business number on WhatsApp Web — see CHAT_WHATSAPP_HANDOFF.md |
| 6 | `data/Wishdrop-orders-chat-thread-backfill.sql` | One-time: links every order that has no chat conversation (fixes "No chat thread linked" on the order page) | — |
| 7a | `data/seller-status-values.sql` | Adds `pending_review` and `inactive` to `seller_status` (the app uses them; the DB only had `active`/`deactivated`). Fixes *invalid input value for enum seller_status* | Run before 7 |
| 7 | `data/wishdrop-mall.sql` | Wishdrop Mall: source-tracking columns, brand/highlights/specs, per-variant supplier link & price, inventory (stock movements log + `mall_deduct_stock` function), Mall categories (converts existing product categories automatically), hides cost/margin/source columns from browser access (safe to re-run if you ran the earlier version) | Then open **/admin/super-admin/wishdrop-mall** (super admin) and click *Set up Wishdrop Mall* — see WISHDROP_MALL.md |
| 8 | `data/wishdrop-seller-media.sql` | Seller product videos: `products.videos` column | Cloudinary keys — see CLOUDINARY_SETUP.md |
| 9 | `data/wishdrop-social-stores.sql` | Custom seller store profile: cover photo, tagline, Instagram/Facebook links; makes sure `store_follows` exists | See SOCIAL_STORES.md |
| 10 | `data/wishdrop-store-collections.sql` | Collections inside a social store (filter on the store page) | See SOCIAL_STORES.md |
| 11 | `data/wishdrop-seller-applications.sql` | Saves "Sell on Wishdrop" applications (the form used to save nothing) | Shown in Admin → Social Stores |
| 12 | `data/wishdrop-media-sweep.sql` | Nightly ghost-media cleanup: finds every photo/video link in the database, lists every uploaded file, keeps a history of cleanups | `CRON_SECRET` on Vercel; turn off the old `weekly-storage-cleanup` job — see MEDIA_CLEANUP.md |
| 13 | `data/wishdrop-store-types-and-location.sql` | Saves each store's type (feed / extractor / social / mall) instead of guessing, so wizard "mock" stores stop showing up as social stores; adds store location (India / Sri Lanka local) and local-order columns (`orders.store_origin`, `orders.pickup_fee_lkr`, `sites.country`) | Afterwards mark your Sri Lanka warehouse: `update sites set country = 'LK' where name = '…';` |
| 14 | `data/wishdrop-pricing-settings.sql` | Editable pricing engine: one saved row of every rate and fee (exchange rates, storefront markup, local and Mall fees, HS-code customs schedule) plus a change history. Changes no prices by itself — the built-in defaults are the old hardcoded values | Then edit on Admin → Super Admin → Pricing engine — see PRICING_ENGINE.md |
| 15 | `data/wishdrop-casecraft.sql` | Case Craft custom store: price list and margin, ready-made designs, and its own print orders (separate from the Wishdrop order pipeline) | Copy the phone templates into `public/phoneCases/` — see CASECRAFT.md |
| 16 | `data/wishdrop-account-sync.sql` | Cart, wishlist and boards become account-based: the database is the source of truth, the browser only caches. Fixes items coming back after removing them, and quantities differing between devices. Boards are saved to the account for the first time, and shared-board links work | **Run this BEFORE deploying the new code.** Turns on Realtime for the three tables |


Still open (not done in this work): the database rules on chat messages,
chat threads, orders, order items and QC issues allow ANY signed-in user,
not just staff — see the notes in the conversation. Fix before launch.
