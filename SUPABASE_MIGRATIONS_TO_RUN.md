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
| 7 | `data/wishdrop-mall.sql` | Wishdrop Mall: source-tracking columns on products, per-option cost on variants, hides cost/margin/source columns from browser access (safe to re-run if you ran the earlier version) | Then open **/admin/super-admin/wishdrop-mall** (super admin) and click *Set up Wishdrop Mall* — see WISHDROP_MALL.md |

Still open (not done in this work): the database rules on chat messages,
chat threads, orders, order items and QC issues allow ANY signed-in user,
not just staff — see the notes in the conversation. Fix before launch.
