# Checkout, coupons, referrals and payments

## Set up (once)

1. **Run the SQL** `data/wishdrop-coupons-referrals-payments.sql` in the Supabase SQL editor
   **before** deploying this code. It's safe to run more than once.
2. **Add the signing secret** on Vercel (Production and Preview):
   `COUPON_SIGNING_SECRET` = any long random string, e.g. the output of
   `openssl rand -base64 48`. Without it the app falls back to a secret derived
   from your Supabase keys and logs a warning — fine for local testing, not for
   production. Changing it later invalidates every coupon code already handed out
   (the coupons themselves stay in customers' accounts with fresh codes).
3. Deploy.

## What happens at checkout now

The browser only says *which* items and *how many*. `POST /api/checkout`
(`lib/checkout/server.ts`) works out every price on the server:

| Item came from | Price the server uses |
|---|---|
| A store catalogue / Wishdrop Mall | The store's own live product (and the chosen variant) |
| A pasted link | What our scraper last saw for that exact URL (`price_observations`, under 24 h old), otherwise it reads the page again |
| Anything it still can't confirm | The customer's price, **and** the order is flagged `price_review = true` (item: `price_verified = false`) so staff check it before buying |

Then the pricing engine (`lib/pricing.ts`) turns that into LKR, the coupon is
checked and used atomically in the database, and the orders are created with the
service role. One "Confirm order" = one row in `checkouts` (totals, discount,
payment status) + one order per origin, as before. Each order stores its share
of the discount in `orders.discount_lkr`.

The cart page shows the server's numbers (`POST /api/checkout/quote`), so what the
customer sees is what they're charged.

## Coupons

- **Admin → Coupons** (Manager, Super Admin): create a coupon for **everyone**,
  **new customers** (first order only) or **chosen customers**; Rs. amount or %
  (with an optional cap); minimum order; **all stores or only some stores**; uses
  per customer; total uses; start and end dates.
- Each coupon page shows **who has it** (and how they got it: given by staff,
  added a shared code, referral, QC credit), **every use** with order numbers and
  discount given, and lets staff pause / resume / archive, change the end date,
  give it to more customers, take it back, or give a use back (e.g. the order was
  cancelled).
- **Card design**: each coupon has its own card — colours, pattern, icon,
  product image, logo and footer text — set with a live preview (same
  controls as the customizer demo) when creating it, or later with
  *Edit design* on the coupon's page. Customers see that card in **My
  coupons** and in their **bag**, where every coupon on their account is
  listed with what it saves on that order (best saving first; ones that
  don't fit yet are dimmed with the reason). Tap a card to apply it.
  Referral and QC-credit coupons get a matching default look.
- **Codes are signed** (`lib/coupons/token.ts`): `WD1.<payload>.<signature>`.
  Only the server can make one; editing any character breaks it. The code in a
  customer's My coupons is bound to their account, so sharing it doesn't help
  anyone else. For everyone / new-customer campaigns, the coupon page gives a
  **shared code and link** (`/account/coupons?add=…`) to post on WhatsApp or
  Instagram.
- The discount applies to product price only — never service charge or delivery
  — and, for store-limited coupons, only to those stores' items.
- Limits (per customer and total) are enforced inside the database
  (`coupon_try_redeem`), so two people checking out at the same moment can't
  both take the last use.
- QC compensation coupons (QC Issues → issue coupon) now go through the same
  system (`/api/admin/coupons/compensation`).
- The old `personal_coupons` table: unused, unexpired coupons were copied over;
  the table is now read-only for customers. The automatic VIP level-up coupon
  (which used to be created in the browser) is switched off — to reward a VIP
  level, create a coupon for those customers.

## Referrals

- Every customer gets a code and a link: `https://<site>/r/<CODE>` (My account →
  Refer a friend).
- Opening the link remembers the code for 30 days and sends the visitor to sign
  up. Once they have an account they're linked to the referrer — only if they're
  genuinely new (account under 14 days old, no orders, not the referrer's own
  phone number) — and get a **welcome coupon**.
- When the friend's first order of at least the qualifying amount is **paid**,
  the referrer gets their **reward coupon**. Both appear in My coupons and the
  bell.
- **Admin → Referrals** (Manager, Super Admin): set both rewards, minimums and
  validity, turn the programme on/off, see every referral (who referred whom,
  status, whether each coupon was used), reward one by hand, or void one —
  voiding withdraws reward coupons that haven't been used.

## Payments (manual, on WhatsApp)

There's no payment gateway yet, so payment is manual:

1. The customer taps **Confirm order** and lands on **Order placed**
   (`/account/pay/<checkout>`; also "How to pay" in My orders). It shows the
   total and a **Get payment details on WhatsApp** button with the order
   numbers already typed in.
2. Staff open the order in **Admin → Orders**. The **Payment** card (Sales,
   Manager, Super Admin) shows the money breakdown, including any coupon
   (linked to its coupon page), and **Send payment request** opens WhatsApp
   to the customer with the total and your bank details. Add your bank details
   once in the card; they're saved on that device.
3. When the slip arrives, **Mark as paid**: choose how they paid and type the
   reference. That marks the checkout and all its orders paid, logs it in
   `payments` (method, reference, note, who recorded it) and releases the
   referral reward. Managers can **Undo payment** if it was a mistake.

**Nothing moves until it's paid.** An unpaid checkout order shows
**Awaiting payment** in Admin → Orders (with a filter), stays out of the
Purchases queue and can't be advanced. Marking it paid drops it into
Purchases straight away.

**Customer never paid?** In the Payment card: *Customer didn't pay? Cancel
order*. It cancels the whole checkout (all its orders), gives back any coupon
use, puts Wishdrop Mall stock back (SQL section 12), logs it in the stage
history and notifies the customer. Paid orders can't be cancelled this way.
Orders placed before this update (no checkout) are unaffected.

Customers can't mark anything paid themselves — the old test-card endpoint
(`/api/payments/mock`) now always refuses.

Run the SQL file again for sections 11–13 (adds `method`, `note`, `recorded_by`
to `payments`, the Mall stock restore for cancelled orders, and refunds). Until then payments still save, with the method written into
the reference.

**Paid orders are never deleted — they're refunded.** In the Payment card of a
paid order (Manager / Super Admin):

- **Cancel & refund** — cancels the order (its whole checkout), refunds up to
  everything paid, gives back the coupon use, puts Wishdrop Mall stock back and
  withdraws an unused referral reward the order earned.
- **Partial refund** — money back for part of it (e.g. one item couldn't be
  bought); the order carries on.
- Refund as **Wishdrop credit** (default: a one-use coupon for the amount, in the
  customer's My coupons for a year — it covers item prices on their next order)
  or **bank transfer / cash / other** with a reference.
- The customer gets a bell notification straight away, and staff get a
  pre-written WhatsApp message to send. Every refund is saved in `refunds`
  (amount, method, reference, reason, who, when) and shows on the order and on
  the customer's order page. Sales can't refund (ask a manager).
- **Delete order** is hidden on paid orders, and the database refuses to delete
  a paid order (SQL section 13). `data/reset-all-orders.sql` still clears
  everything for a fresh start.
- Works for request orders too (paid on the Requests page).

**When a gateway arrives** (PayHere, WEBXPAY, …): confirm payment from the
gateway's server-to-server notification and call `markCheckoutPaid()` in
`lib/payments/server.ts`.

## Still worth doing

- The database rules on `orders` / `order_items` still let a signed-in customer
  insert rows directly (see the note in SUPABASE_MIGRATIONS_TO_RUN.md). The app no
  longer does that, so those insert permissions can be removed for customers.
- Staff screens don't show the new `price_review` flag yet; until they do, check
  `orders.price_review` (or `order_items.price_verified = false`) before buying.
