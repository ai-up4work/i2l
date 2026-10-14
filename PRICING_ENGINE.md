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
| Storefront prices | profit %, service charge, weight block, Express freight / customs clearance per kg, delivery fee, Economy postal per kg | every Indian-store price: cards, product pages, cart, checkout |
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
