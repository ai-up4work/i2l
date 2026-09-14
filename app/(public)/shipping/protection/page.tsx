import LegalPageLayout from '@/components/shared/LegalPageLayout'

export const metadata = {
  title: 'Shipping Protection Plan | WishDrop',
  description:
    'Optional coverage against loss or damage to your parcel between our facility and your door.',
}

export default function ShippingProtectionPage() {
  return (
    <LegalPageLayout
      eyebrow="Legal · Shipping"
      title="Shipping Protection Plan"
      intro="Shipping Protection is an optional add-on that covers your consolidated parcel against loss or damage from the moment it leaves a WishDrop facility until it's delivered to your address."
      lastUpdated="14 September 2026"
      note={
        <>
          This plan covers the international transit and last-mile delivery leg only. For issues
          with the product itself before it reaches our facility, see the{' '}
          <a href="/shopping/protection">Shopping Protection Plan</a> and our{' '}
          <a href="/refund-policy">Refund Policy</a>.
        </>
      }
      sections={[
        {
          id: 'what-it-covers',
          heading: 'What is covered',
          body: (
            <>
              <p>When added to an order, Shipping Protection covers:</p>
              <ul>
                <li>Parcels confirmed lost in transit by the courier after leaving a WishDrop facility.</li>
                <li>Parcels that arrive visibly damaged in a way that occurred during international transit or last-mile delivery.</li>
                <li>Parcels marked delivered by the courier that you did not actually receive, subject to our standard investigation.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'what-it-doesnt-cover',
          heading: "What isn't covered",
          body: (
            <ul>
              <li>Damage, defects, or discrepancies present before the item left our facility (see quality check under the <a href="/refund-policy">Refund Policy</a> instead).</li>
              <li>Delay alone, where the parcel is later delivered intact.</li>
              <li>Loss or damage after delivery has been completed to the address or recipient you provided.</li>
              <li>Items on the <a href="/prohibited-items">Prohibited Items</a> list that should not have been shipped in the first place.</li>
              <li>Cash, or items whose declared value was understated to reduce the protection fee.</li>
            </ul>
          ),
        },
        {
          id: 'coverage-limit',
          heading: 'Coverage limit and fee',
          body: (
            <p>
              The protection fee and maximum coverage amount for a given order are shown at
              checkout before you add the plan, and are calculated from the declared value of your
              consolidated shipment, up to a maximum coverage cap. Coverage cannot exceed the
              declared value of the goods actually purchased through WishDrop for that shipment.
            </p>
          ),
        },
        {
          id: 'how-to-claim',
          heading: 'How to file a claim',
          body: (
            <>
              <p>
                Report a lost or damaged shipment within <strong>48 hours</strong> of the expected
                delivery date (for loss) or actual delivery (for damage), via{' '}
                <a href="/account/orders/track">Track Order</a> or <a href="/contact">Contact us</a>.
                Please include:
              </p>
              <ul>
                <li>Your order number.</li>
                <li>Photos of the damaged item and its outer packaging, where applicable.</li>
                <li>A brief description of the issue.</li>
              </ul>
              <p>
                We will investigate with our courier partner and confirm the outcome, generally
                within 5–10 business days.
              </p>
            </>
          ),
        },
        {
          id: 'resolution',
          heading: 'How claims are resolved',
          body: (
            <p>
              Approved claims are resolved by replacement (where the same item can be re-sourced),
              WishDrop wallet credit, or a refund to your original payment method, up to the
              covered amount, at WishDrop's discretion after considering your preference.
            </p>
          ),
        },
        {
          id: 'exclusions-fraud',
          heading: 'Fraud and misuse',
          body: (
            <p>
              Claims found to be fraudulent, materially misrepresented, or involving deliberate
              damage will be denied, and may result in account suspension in line with our{' '}
              <a href="/terms">Terms of Use</a>.
            </p>
          ),
        },
      ]}
    />
  )
}
