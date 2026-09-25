import LegalPageLayout from '@/components/shared/LegalPageLayout'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/terms',
  title: 'Terms of Use | WishDrop',
  description:
    'The terms that govern your use of WishDrop — requests, quotes, payment, shipping, customs, liability, and dispute resolution.',
})

export default function TermsPage() {
  return (
    <LegalPageLayout
      eyebrow="Legal"
      title="Terms of Use"
      intro="These Terms of Use (“Terms”) form a binding agreement between you and WishDrop Limited (“WishDrop”, “we”, “us”) governing your access to and use of the WishDrop website, app, and concierge buying and delivery service."
      lastUpdated="14 September 2026"
      note={
        <>
          By creating an account, submitting a request, or placing an order, you confirm that you
          have read, understood, and agree to be bound by these Terms, our{' '}
          <a href="/privacy">Privacy Policy</a>, our <a href="/refund-policy">Refund Policy</a>,
          and our <a href="/prohibited-items">Prohibited Items</a> list. If you do not agree,
          please do not use the service.
        </>
      }
      sections={[
        {
          id: 'eligibility',
          heading: 'Eligibility and your account',
          body: (
            <>
              <ul>
                <li>You must be at least 18 years old and able to form a binding contract to use WishDrop.</li>
                <li>
                  You must provide accurate, current information when creating an account, and
                  keep it up to date, including your delivery address and WhatsApp number.
                </li>
                <li>
                  You are responsible for maintaining the confidentiality of your account
                  credentials and for all activity that occurs under your account.
                </li>
                <li>
                  We may suspend or close an account that provides false information, is used
                  fraudulently, or breaches these Terms.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'service-description',
          heading: 'What the service is',
          body: (
            <>
              <p>
                WishDrop is a concierge shopping and delivery service. You either purchase
                products directly from our affiliated store catalogue, or submit a request (by
                pasting a product link or describing what you want) for WishDrop to source. Once
                accepted, WishDrop purchases the item on your behalf, receives it at a WishDrop
                facility, performs a quality check, consolidates it for international shipment,
                and delivers it to the address you provide in Sri Lanka.
              </p>
              <p>
                WishDrop acts as your purchasing and delivery agent for accepted requests. We are
                not the manufacturer or seller of third-party products, and we do not guarantee
                that any specific product will be available, priced as shown at the time of your
                request, or shippable to Sri Lanka.
              </p>
            </>
          ),
        },
        {
          id: 'requests-quotes',
          heading: 'Requests, quotes, and acceptance',
          body: (
            <>
              <ul>
                <li>
                  A product link, catalogue listing, or description you submit is a request for a
                  quote, not a confirmed order.
                </li>
                <li>
                  A quote reflects the product price, our service fee, estimated freight and
                  customs costs, applicable discounts or credits, and an estimated total, based on
                  information available at the time. Quotes are estimates and may change if the
                  seller's price, stock, weight, or dimensions change before purchase.
                </li>
                <li>
                  Your order is only confirmed once you accept the quote and payment is
                  successfully processed. Until then, WishDrop is not obligated to purchase the
                  item, and prices are not locked.
                </li>
                <li>
                  For custom or "special purchase" requests without a fixed catalogue price, we
                  may provide a manual quote after review; these may take longer to process.
                </li>
                <li>
                  We may decline any request or order at our discretion — for example, if an item
                  is a <a href="/prohibited-items">prohibited item</a>, cannot legally be
                  imported, is out of stock, or the seller will not ship to our facility.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'pricing-payment',
          heading: 'Pricing and payment',
          body: (
            <>
              <ul>
                <li>
                  All prices are shown in the currency indicated on the platform and may include
                  the product cost, WishDrop's service margin, freight, customs-related charges,
                  and any applicable taxes, as explained further in our{' '}
                  <a href="/taxation">Taxation</a> page.
                </li>
                <li>
                  Payment must be completed in full before we purchase an item on your behalf,
                  unless otherwise stated for a specific promotion or payment plan.
                </li>
                <li>
                  Payments are processed by third-party, licensed payment gateways. WishDrop does
                  not store your full card details.
                </li>
                <li>
                  Promotional codes, credits, and loyalty points are subject to their own terms,
                  may have expiry dates, and cannot usually be combined unless explicitly stated.
                </li>
                <li>
                  If a payment fails, is reversed, or is charged back without a valid reason after
                  goods have been purchased or shipped, we may recover the outstanding amount,
                  suspend your account, and pursue any other remedy available to us.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'cancellations-changes',
          heading: 'Cancellations and changes',
          body: (
            <p>
              You may cancel a request before it has been purchased from the seller, subject to
              our <a href="/refund-policy">Refund Policy</a>. Once WishDrop has purchased an item
              on your behalf, cancellation may not be possible, or may be subject to seller
              restocking fees and non-refundable service charges, because we have already
              committed funds to the seller. Address or product changes after purchase are not
              guaranteed and may incur additional fees.
            </p>
          ),
        },
        {
          id: 'quality-check-shipping',
          heading: 'Quality check, shipping, and delivery',
          body: (
            <>
              <ul>
                <li>
                  Items are inspected at a WishDrop facility to confirm they match your order
                  before being consolidated and shipped internationally.
                </li>
                <li>
                  Estimated delivery timelines shown on the platform are estimates only and are
                  not guaranteed. Delays can occur due to customs processing, courier network
                  disruption, incomplete address details, force majeure events, or seller
                  dispatch delays.
                </li>
                <li>
                  You are responsible for providing an accurate, complete delivery address and a
                  contactable phone number. We are not liable for delivery failure or delay caused
                  by inaccurate address information you provided.
                </li>
                <li>
                  Risk in the goods passes to you on delivery to the address you provided, or to a
                  person reasonably appearing authorised to receive it on your behalf.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'customs-duties',
          heading: 'Customs, duties, and import compliance',
          body: (
            <p>
              International shipments may be subject to import duties, taxes, and customs
              clearance procedures in Sri Lanka, as set out in our <a href="/taxation">Taxation</a>{' '}
              page. You are responsible for ensuring the items you request are lawful to import.
              WishDrop will not purchase, ship, or attempt to import any item on the{' '}
              <a href="/prohibited-items">Prohibited Items</a> list or any item that is otherwise
              illegal to import into Sri Lanka, and reserves the right to seize, surrender to
              authorities, return to sender, or dispose of such items at your cost, without
              liability to you.
            </p>
          ),
        },
        {
          id: 'prohibited-conduct',
          heading: 'Prohibited conduct',
          body: (
            <>
              <p>When using WishDrop, you agree not to:</p>
              <ul>
                <li>Request, list, or attempt to import any prohibited, counterfeit, stolen, or illegal item.</li>
                <li>Provide false information to WishDrop, a seller, a courier, or customs authorities.</li>
                <li>Use the service for commercial resale in a way that breaches import regulations, without disclosing this to us.</li>
                <li>Attempt to interfere with, reverse-engineer, or gain unauthorised access to the platform or other users' accounts.</li>
                <li>Use the service to launder money or disguise the origin of funds.</li>
                <li>Abuse promotions, referral programs, or credits through fraudulent means.</li>
              </ul>
              <p>
                We may suspend or terminate accounts, cancel orders, and report activity to
                authorities where we reasonably believe this section has been breached.
              </p>
            </>
          ),
        },
        {
          id: 'liability',
          heading: 'Liability',
          body: (
            <>
              <p>
                To the fullest extent permitted by law, WishDrop's total liability to you for any
                claim arising from or related to a specific order is limited to the amount you
                paid for that order. We are not liable for indirect, incidental, or consequential
                losses, including loss of profit, business, or data, except where such limitation
                is not permitted by applicable Sri Lankan consumer-protection law.
              </p>
              <p>
                Nothing in these Terms excludes or limits liability that cannot lawfully be
                excluded or limited, including liability for fraud or for death or personal injury
                caused by our negligence.
              </p>
            </>
          ),
        },
        {
          id: 'ip',
          heading: 'Intellectual property',
          body: (
            <p>
              The WishDrop name, logo, website, and app content are owned by or licensed to
              WishDrop Limited and are protected by intellectual-property law. You may not copy,
              modify, or use our branding or platform content without prior written permission.
              Product images and descriptions from affiliated stores remain the property of their
              respective owners.
            </p>
          ),
        },
        {
          id: 'termination',
          heading: 'Suspension and termination',
          body: (
            <p>
              You may close your account at any time by contacting support. We may suspend or
              terminate your access to the service, with or without notice, if you breach these
              Terms, if we suspect fraud or abuse, or where required by law. Termination does not
              affect any rights or obligations that accrued before termination, including payment
              obligations for orders already placed.
            </p>
          ),
        },
        {
          id: 'changes-to-terms',
          heading: 'Changes to these Terms',
          body: (
            <p>
              We may update these Terms from time to time to reflect changes in our service, fees,
              or legal requirements. We will post the updated Terms here with a new “Last updated”
              date. Continued use of the service after changes take effect constitutes acceptance
              of the updated Terms. Where a change is material, we will make reasonable efforts to
              notify you in advance.
            </p>
          ),
        },
        {
          id: 'governing-law',
          heading: 'Governing law and disputes',
          body: (
            <p>
              These Terms are governed by the laws of the Democratic Socialist Republic of Sri
              Lanka. Before pursuing formal legal action, you agree to first contact our support
              team so we can attempt to resolve the issue directly. Any dispute that cannot be
              resolved informally shall be subject to the exclusive jurisdiction of the courts of
              Sri Lanka, without prejudice to any mandatory consumer-protection rights you may have
              in your place of residence.
            </p>
          ),
        },
        {
          id: 'contact-terms',
          heading: 'Contact',
          body: (
            <p>
              Questions about these Terms can be sent to our support team via{' '}
              <a href="/contact">Contact us</a>, in-app chat, or WhatsApp.
            </p>
          ),
        },
      ]}
    />
  )
}
