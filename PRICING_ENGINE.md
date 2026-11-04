# Pricing engine

Every rate and fee prices are built from is now editable on
**Admin → Super Admin → Pricing engine**
(`/admin/super-admin/settings/pricing-engine`). Nothing is hardcoded in
`lib/quote.ts` or `lib/currency-config.ts` any more.

**Setup.** Run `data/wishdrop-pricing-settings.sql` (row 14 in
SUPABASE_MIGRATIONS_TO_RUN.md). Until you save once, the site uses the
built-in defaults, which are exactly the old hardcoded values, so prices
don't change when you deploy.

## What's on the page

| Section | Settings | Used for |
|---|---|---|
| Storefront prices | profit %, service charge, weight block, Express freight / customs clearance per kg and delivery fee, Economy postal per kg and delivery fee | every Indian-store price: cards, product pages, cart, checkout |
| Exchange rates | LKR per 1 unit of each currency; add or remove currencies | all currency conversion |
| Local stores and Wishdrop Mall | local margin, local delivery, handling (pickup) per shop, Mall delivery | local stores and Wishdrop Mall |
| Customs calculator | freight per kg, default weight, HS codes with duty / PAL / cess / surcharge / SSCL / VAT; add or remove codes | the quote calculator's customs mode |

**Preview.** Prices a sample product with the saved numbers and with your
changes side by side, for Express, Economy, Local shop and Mall.

**Saving.** Edits stay a draft until **Save changes**. Changed fields show
their old value. You can add a note saying why. The server validates and
clamps every number. Only a Super Admin can save; any staff member can view.

**Recent changes.** Who changed what and when. **Load** puts an older
version back into the form, so you can undo a bad change.

**Built-in defaults.** Fills the form with the original values.

## How it flows

- `lib/pricing-settings.ts` holds the settings shape, the defaults,
  validation (`normalizePricingSettings`) and the live value.
- `lib/pricing-settings-server.ts` loads the saved row. It's cached and
  refreshed the moment someone saves. If the table is missing, it falls
  back to the defaults.
- The root layout installs the settings on the server and writes the same
  object into a small inline `<script>` in `<head>`
  (`pricingSettingsScript`). The browser reads it before any page code
  runs, so server-side and browser-side prices always match.
- `lib/quote.ts`, `lib/pricing.ts`, `lib/currency-config.ts`,
  `lib/store-origin.ts` and `lib/wishdrop-mall.ts` read the live settings.
  Each function also takes an explicit `settings` argument; the preview
  uses this.
- The product page, `/api/store-product`, `/shipping/pricing` and
  `/community/discover/recommended` load the settings themselves before
  pricing anything.

## Quote calculator

There is now one calculator. `/admin/quote` and `/demo/quote` (where
product pages link) are the same page. It starts from the live rates.
"Adjust rates & fees" changes numbers for that one calculation only, and
"Reset to live rates" puts them back. To change rates for the whole site,
use **Change live rates**, which opens the Pricing engine.

**Local shops in the calculator.** "Indian store / Local shop" switch. Local
shop mode prices the way the storefront does for local stores: shop price +
margin (or "margin already in the price" for social stores), local delivery
per item, handling once per order. No freight, customs clearance or service
charge. A local product's price-breakdown link opens it in this mode
(`origin=LK`).

## Note

Prices are still worked out in the browser, as before. The rates were
already shipped to every visitor inside the JavaScript bundle, so making
them editable doesn't expose anything new. Moving all pricing to the
server is a separate job, needed before taking real payments.

## Economy delivery fee

Economy used to fold the Sri Lanka delivery into its postal charge. It
now has its own **Delivery fee** under Economy, next to the postal
charge, the same way Express has one. It's charged per item, shows as
the "Delivery" line on product pages, the estimator, cart and checkout,
and can be adjusted per calculation in the quote calculator. Settings
saved before this change pick up the built-in default (LKR 450) until
you save a value.

## Weight for pasted links

Freight and customs clearance are charged by weight, but stores like
Amazon, Myntra or FirstCry rarely say how much an item weighs. Before,
those items were quietly priced at the weight block (0.5 kg) and the
product page only showed the store price converted to rupees.

**What shoppers see.** The product page shows the delivered price (Express:
item, freight, customs clearance, service charge, delivery) with the store
price underneath, and a weight row:

- the store's own weight when the listing gives one, plus the **packaging
  margin** (Storefront prices → "Packaging on store weight", default 30%:
  a 400 g item is priced at 520 g). Shoppers can change it, but it's a quiet
  "Edit" link with a warning; a changed store weight is flagged for the
  Price check like any estimate;
- otherwise the **weight category** that best matches the title, e.g. a
  kurti → "T-shirt, top or kurti", 0.3 kg;
- otherwise the weight block.

They can pick another category or type a weight (0.1–30 kg). The price, the
"Get quote" breakdown, the bag and checkout all use that weight.

**Weight categories** are on this page (name, kg, title words). The longest
matching title word wins ("smartwatch" beats "watch"). Saved settings from
before this change get the built-in list until you save.

**Checking.** Checkout saves the weight and store price on each item and
flags the order (`price_review`). On the order page, **Price check** shows
each item's weight and where it came from. Enter the real weight to re-price
an item with the pricing engine, or type a price. Saving updates the order
and checkout totals, writes an internal note, and tells the customer (app
notification, push and a message in their order chat). Only while the order
is unpaid. Needs `data/wishdrop-weight-estimates.sql` (row 20 in
SUPABASE_MIGRATIONS_TO_RUN.md).

Code: `lib/weight-estimate.ts`, `components/platforms/LandedPrice.tsx`,
`lib/checkout/server.ts`, `lib/orders/price-check.ts`,
`components/admin/orders/OrderPriceCheckCard.tsx`.

## Every order: price confirmed before payment

Every checkout order now starts as **price to confirm**, whatever it is
(pasted link, store product, Wishdrop Mall, local shop):

1. The customer places the order. The pay page says "We're confirming your
   final price — please don't pay before that"; My orders shows
   *Confirming price*.
2. Staff open the order (Admin → Orders → filter *Price to confirm*), check
   each item with the store in **Price check**, set the real weight or price
   if needed, and press **Confirm price & tell the customer**. The customer
   always gets the final total (app notification, push, order chat) with a
   link to their order.
3. Only then can staff **send the payment request** and **record the
   payment** on the Payment card. Recording a payment on an unconfirmed
   order is refused on the server too (`lib/payments/server.ts`).

Request (Channel 3) orders are unchanged: staff already set their price on
the request. `data/wishdrop-weight-estimates.sql` also adds orders that were
placed before this change and are still unpaid to the queue.
