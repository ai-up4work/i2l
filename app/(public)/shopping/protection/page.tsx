import LegalPageLayout from '@/components/shared/LegalPageLayout'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/shopping/protection',
  title: 'Shopping Protection Plan | WishDrop',
  description:
    'Optional buyer protection covering item-not-as-described and seller-side issues on the products WishDrop purchases for you.',
})

export default function ShoppingProtectionPage() {
  return (
    <LegalPageLayout
      eyebrow="Legal · Shopping"
      title="Shopping Protection Plan"
      intro="Shopping Protection is an optional add-on covering the purchase itself — problems with the item a seller sends us, caught before or during quality check, beyond what our standard process already covers."
      lastUpdated="14 September 2026"
      note={
        <>
          This plan covers the purchase and seller-fulfilment stage. For loss or damage once your
          parcel is in transit to you, see the{' '}
          <a href="/shipping/protection">Shipping Protection Plan</a>.
        </>
      }
      sections={[
        {
          id: 'what-it-covers',
          heading: 'What is covered',
          body: (
            <>
              <p>When added to an order, Shopping Protection extends coverage to:</p>
              <ul>
                <li>Items confirmed materially not-as-described by the seller (wrong product, counterfeit, or misrepresented condition), including where our standard quality check does not fully catch it until closer inspection.</li>
                <li>Seller non-fulfilment after payment has been made, where the seller cannot be reached or refuses to resolve the issue directly.</li>
                <li>Price or stock discrepancies discovered after purchase that the seller will not honour or correct.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'what-it-doesnt-cover',
          heading: "What isn't covered",
          body: (
            <ul>
              <li>Change of mind after you've seen and accepted the product at quality check.</li>
              <li>Minor variations in colour, packaging, or presentation that don't affect the product itself.</li>
              <li>Issues arising after the item leaves our facility (covered instead by <a href="/shipping/protection">Shipping Protection</a>, if added).</li>
              <li>Custom or made-to-order items correctly produced to your specification.</li>
              <li>Items you selected knowing the seller's listing was ambiguous, without raising it with support first.</li>
            </ul>
          ),
        },
        {
          id: 'coverage-limit',
          heading: 'Coverage limit and fee',
          body: (
            <p>
              The protection fee and maximum coverage for a given order are shown at checkout
              before you add the plan. Coverage is limited to the product price and any WishDrop
              service fees paid for that specific item, and does not extend to unrelated items in
              the same shipment unless they are also covered.
            </p>
          ),
        },
        {
          id: 'how-to-claim',
          heading: 'How to file a claim',
          body: (
            <>
              <p>
                Raise a Shopping Protection claim as soon as an issue is identified — ideally at
                quality-check notification, and no later than <strong>7 days</strong> after
                delivery for issues only discoverable once the item is in hand. Contact us via{' '}
                <a href="/account/orders">My Requests</a>, <a href="/account/orders">My Orders</a>
                , or <a href="/contact">Contact us</a>, with:
              </p>
              <ul>
                <li>Your order or request number.</li>
                <li>Photos or a description showing how the item differs from the listing.</li>
                <li>A link or screenshot of the original listing, where available.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'resolution',
          heading: 'How claims are resolved',
          body: (
            <p>
              Depending on the seller's response and what is reasonable for the item, approved
              claims are resolved by a replacement order, WishDrop wallet credit, or a refund to
              your original payment method, up to the covered amount. This is separate from, and in
              addition to, the standard quality-check protections described in our{' '}
              <a href="/refund-policy">Refund Policy</a>.
            </p>
          ),
        },
        {
          id: 'fraud',
          heading: 'Fraud and misuse',
          body: (
            <p>
              Claims found to be fraudulent or materially misrepresented will be denied and may
              result in account suspension under our <a href="/terms">Terms of Use</a>.
            </p>
          ),
        },
      ]}
    />
  )
}
