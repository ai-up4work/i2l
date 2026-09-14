import LegalPageLayout from '@/components/shared/LegalPageLayout'

export const metadata = {
  title: 'Taxation & Customs | WishDrop',
  description:
    'How Sri Lankan customs duty, PAL, SSCL, Cess, surcharge, and VAT are calculated into your WishDrop quote.',
}

export default function TaxationPage() {
  return (
    <LegalPageLayout
      eyebrow="Legal · Shipping"
      title="Taxation & Customs"
      intro="Every item WishDrop imports on your behalf clears Sri Lankan customs before it reaches you. This page explains, in plain language, which duties and taxes can apply, how they're estimated in your quote, and what changes them."
      lastUpdated="14 September 2026"
      note={
        <>
          Figures below reflect the components used in our quote engine and are estimates based on
          the product category (HS code) you select. Actual customs assessment is made by Sri
          Lanka Customs at the time of import and can differ from the estimate. This page is
          general information, not tax advice.
        </>
      }
      sections={[
        {
          id: 'why-charges-apply',
          heading: 'Why import charges apply',
          body: (
            <p>
              Any parcel entering Sri Lanka from abroad — including everything WishDrop imports on
              your behalf — is subject to Sri Lanka Customs assessment. Depending on the product
              category and declared value, this can include import duty and several
              government-mandated levies and taxes. WishDrop builds a reasonable estimate of these
              charges into your quote so there are no surprises at delivery, and we handle the
              customs clearance process for you.
            </p>
          ),
        },
        {
          id: 'components',
          heading: 'What makes up the import charge',
          body: (
            <>
              <p>
                Depending on the product's HS (Harmonized System) classification code, a quote can
                include some or all of the following components, calculated on the customs value
                of the goods:
              </p>
              <ul>
                <li>
                  <strong>Customs Duty</strong> — the base import duty rate for the product
                  category. Some categories (for example, many mobile phones) can carry a 0% duty
                  rate, while others (such as apparel or toys) commonly sit around 15%.
                </li>
                <li>
                  <strong>PAL (Ports and Airport Development Levy)</strong> — a levy applied to
                  most imported goods, commonly around 10%.
                </li>
                <li>
                  <strong>SSCL (Social Security Contribution Levy)</strong> — a levy applied to the
                  import value, commonly around 2.5%.
                </li>
                <li>
                  <strong>Cess</strong> — an additional levy applied to specific product categories
                  (varies by HS code; some categories carry no Cess at all).
                </li>
                <li>
                  <strong>Surcharge</strong> — where applicable, calculated as a percentage on top
                  of the Customs Duty amount (not the product value).
                </li>
                <li>
                  <strong>VAT (Value Added Tax)</strong> — applied last, on the value built up from
                  the components above, commonly around 18%.
                </li>
              </ul>
              <p>
                Because these apply in sequence — duty and levies first, VAT last, on the resulting
                value — the effective total can be meaningfully higher than any single rate. This
                is why the same-priced item can carry a different landed cost depending on its
                category.
              </p>
            </>
          ),
        },
        {
          id: 'freight-and-weight',
          heading: 'Freight, weight, and customs value',
          body: (
            <p>
              Customs value is generally based on the product's purchase price plus applicable
              freight, so heavier or bulkier items typically carry a higher freight charge, which
              in turn affects the customs value used for these calculations. When a product's exact
              weight is not available from the seller, WishDrop applies a reasonable default weight
              for estimation, and adjusts the final charge once the actual weight is confirmed at
              quality check.
            </p>
          ),
        },
        {
          id: 'simple-mode',
          heading: 'Flat markup pricing (where offered)',
          body: (
            <p>
              For some catalogue products and delivery options, WishDrop instead shows a simplified,
              all-in price that bundles a flat service margin with weight-based freight and
              clearance charges (Express), or a single postal-charges line (Economy), rather than
              itemising each duty component separately. In both cases, the amount you pay at
              checkout is the full amount due — there is nothing further to pay on delivery unless
              your order changes after purchase.
            </p>
          ),
        },
        {
          id: 'exemptions',
          heading: 'De minimis and exemptions',
          body: (
            <p>
              Sri Lanka Customs may apply exemptions or reduced processing for very low-value
              shipments, and duty-free or concessionary treatment can apply to specific product
              categories under prevailing regulations. Where such treatment plausibly applies,
              WishDrop reflects it in your quote; however, final eligibility is determined by
              customs at the time of clearance, not by WishDrop.
            </p>
          ),
        },
        {
          id: 'changes-after-quote',
          heading: 'What can change your final charge',
          body: (
            <>
              <ul>
                <li>The seller's actual price at the time of purchase differing from the price shown when you requested a quote.</li>
                <li>Actual weight or dimensions differing from the estimate once the item is received and measured.</li>
                <li>Sri Lanka Customs reclassifying or revaluing an item differently than estimated.</li>
                <li>Government rate changes to duty, PAL, SSCL, Cess, or VAT, which are outside WishDrop's control.</li>
              </ul>
              <p>
                If a material change increases your total, we will contact you before proceeding
                wherever practical, rather than charging the difference without notice.
              </p>
            </>
          ),
        },
        {
          id: 'prohibited-note',
          heading: 'Restricted and prohibited items',
          body: (
            <p>
              Some products cannot be imported at all, or require special permits regardless of
              duty payment. See our full <a href="/prohibited-items">Prohibited Items</a> list
              before submitting a request. WishDrop will not knowingly purchase or ship a
              prohibited item.
            </p>
          ),
        },
        {
          id: 'tax-questions',
          heading: 'Questions about a specific charge',
          body: (
            <p>
              If a duty or tax line on your quote or order looks unexpected, open the order under{' '}
              <a href="/account/orders">My Orders</a> and contact support with the order number —
              we can walk through exactly how each figure was calculated.
            </p>
          ),
        },
      ]}
    />
  )
}
