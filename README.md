# WishDrop Platform

WishDrop is a concierge shopping and cross-border delivery platform that helps customers in Sri Lanka buy products from affiliated Indian stores or request products from other online stores without handling international purchasing, warehousing, customs, or shipping themselves.

## Why WishDrop exists

Many customers want products that are unavailable locally, but international shopping creates friction:

- Some stores do not ship to Sri Lanka.
- International payments and currency conversion are confusing.
- Customers cannot easily compare the full landed cost before ordering.
- Shipping, customs, and delivery updates are difficult to follow.
- Buying from several stores creates multiple support and tracking problems.
- Customers have limited confidence that the item will arrive safely and as described.

WishDrop turns that complicated process into one guided customer journey: choose what you want, understand the cost, pay through the platform, and receive the item at your door.

## What WishDrop does

WishDrop acts as the customer’s shopping and delivery partner:

1. **Discover** — browse affiliated stores and products, or submit a product link.
2. **Request** — tell WishDrop what you want to buy when it is not already in the catalog.
3. **Quote** — show the product price, service fees, shipping, discounts, credits, and estimated total clearly.
4. **Purchase** — WishDrop buys the product on the customer’s behalf.
5. **Quality check** — the item is received at a WishDrop facility and inspected before international shipping.
6. **Ship** — WishDrop consolidates and sends the order to Sri Lanka.
7. **Track** — the customer follows progress from purchase through quality check, shipment, and final delivery.
8. **Support** — customers have one place to ask questions and resolve issues.

The customer does not need to arrange an overseas warehouse address, forward a parcel, declare an inbound package, or coordinate several carriers.

## The problem being solved

### For customers

WishDrop removes the operational work between wanting a product and receiving it. The platform provides:

- One trusted place to request products.
- Clear pricing before the customer commits.
- Localized payment and currency presentation.
- Product inspection before shipment.
- Consolidated international delivery.
- Order, shipment, and tracking visibility.
- A single support relationship instead of several sellers and carriers.
- Wishlist, cart, community, promotions, credits, and referral tools that make repeat shopping easier.

### For affiliated stores and sellers

WishDrop gives stores access to customers who may not be able to purchase directly. It helps by:

- Extending product reach into the Sri Lankan market.
- Creating a managed purchasing channel.
- Reducing cross-border delivery complexity for the seller.
- Giving customers a consistent support and tracking experience.
- Making new products and promotions easier to discover.

### For the WishDrop operations team

The platform organizes the full lifecycle of a request and order:

- Product discovery and link lookup.
- Request intake and review.
- Quotes and payment readiness.
- Bidding or special purchasing requests.
- Warehouse receipt and quality-check status.
- Shipment and tracking updates.
- Customer communication, credits, promotions, and referrals.

## What customers should expect

Customers should expect WishDrop to be:

- **Clear:** show the meaningful cost and status of an order without hidden steps.
- **Reliable:** keep customers informed when an item is requested, purchased, inspected, shipped, delayed, or delivered.
- **Convenient:** make the customer’s main job selecting the product and confirming the order.
- **Secure:** protect account, payment, order, and delivery information.
- **Honest:** avoid unrealistic delivery promises and explain delays early.
- **Human:** provide responsive support in plain language instead of logistics jargon.
- **Consistent:** keep the same product, request, order, and shipment information visible across the account area.

WishDrop should say “Your order is being inspected in India” rather than exposing internal terms such as “inbound parcel processing.”

## Core product areas

### Public storefront

The public experience explains the service, highlights new products and deals, shows how the process works, and gives visitors a clear path to browse, sign up, or start a request.

### Marketplace and affiliated stores

Customers can browse available stores and product catalogs, view product details, save products to a wishlist, and add products to their cart.

### Buying requests

Customers can paste a product URL or submit a custom request. WishDrop can review the product, confirm availability, calculate the quote, and move the request toward payment.

### Orders and delivery

Customers can review order history and see progress through the main operational stages:

`Ordered → Quality check → Shipped → Delivered`

### Account center

The account area is the customer’s control center for requests, orders, shipments, tracking, wishlist, cart, credits, promo codes, referrals, community activity, profile details, and support.

### Community and retention

The platform supports shopping discovery and repeat use through community posts, following, saved products, promotions, credits, referrals, and personalized account activity.

## Navigation principles

Navigation should follow the customer’s mental model rather than the internal organization of the company:

- Start with **Home** and **Shop** for discovery.
- Keep **Wishlist** and **Cart** easy to reach from the header.
- Make **Requests**, **Orders**, and **Shipments** prominent in the account area.
- Group credits, promotions, referrals, and profile settings as account tools.
- Keep help, policies, and support available without competing with the main shopping journey.
- If a destination is unavailable, redirect customers to the closest useful working page instead of showing a dead link.

## Product language

Use simple, customer-facing language:

- “Buy for me” instead of “procurement workflow.”
- “Quality check” instead of “warehouse inspection event.”
- “Shipping to your door” instead of “last-mile fulfillment.”
- “Your request” instead of “customer intake record.”
- “Pay when ready” instead of “payment authorization state.”

The tone should be warm, direct, and reassuring. WishDrop is a service customers trust with money, personal information, and products they are excited to receive.

## Current technical structure

This project uses Next.js 16 with the App Router, React 19, TypeScript, and Tailwind CSS v4.

- `app/page.tsx` — public landing page.
- `app/(public)/` — public informational and shopping routes.
- `app/account/` — account routes and the shared account shell.
- `components/shared/Header.tsx` — public header with compact wishlist, cart, account, and logout actions.
- `components/dashboard/Sidebar.tsx` — account navigation.
- `components/dashboard/Topbar.tsx` — account top bar and mobile navigation controls.
- `components/dashboard/routes.ts` — route and view mapping.
- `components/dashboard/sidebar-data.ts` — account navigation groups.
- `contexts/DashboardContext.tsx` — shared request and draft state across account routes.
- `lib/quote.ts` — quote and fee calculation logic.
- `app/api/scrape/route.ts` — product-link lookup endpoint.

The account shell is shared by account pages so navigation, banners, dialogs, chat access, and responsive behavior remain consistent while the page content changes.

## Design direction

WishDrop uses a warm, editorial marketplace style:

- Parchment backgrounds for approachability.
- Indigo for trust, structure, and primary surfaces.
- Teal for actions, links, and progress.
- Gold for wishlist and “new drop” moments.
- Fraunces for expressive brand headlines.
- Space Grotesk for readable interface and transactional content.

The design should feel more like a trusted shopping concierge than a freight-forwarding dashboard.

## Success criteria

WishDrop is successful when a customer can:

1. Understand what the platform does within a few seconds.
2. Find a product or submit a request without confusion.
3. See a believable total before committing.
4. Know what happens next after placing a request.
5. Track the order without contacting support for routine updates.
6. Reach wishlist, cart, account, and logout actions from the header.
7. Find every important account destination from the sidebar.
8. Receive clear help when something is delayed or unavailable.

The core promise is simple: **customers choose what they want; WishDrop handles the difficult journey from store to door.**

## Local development

Install dependencies and run the development server with the project’s package manager. The primary scripts are:

```bash
pnpm dev
pnpm build
pnpm start
```

Before shipping, verify the public landing page, header actions, account shell, sidebar routes, request flow, order tracking, and mobile layout.
