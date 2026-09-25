import LegalPageLayout from '@/components/shared/LegalPageLayout'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/refund-policy',
  title: 'Refund & Cancellation Policy | WishDrop',
  description:
    'When WishDrop provides refunds or credits — cancellations, failed purchases, quality-check rejections, lost or damaged shipments, and delivery issues.',
})

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout
      eyebrow="Legal"
      title="Refund & Cancellation Policy"
      intro="Because WishDrop purchases real products from real sellers on your behalf, refund eligibility depends on where your request or order is in the journey — Ordered, Quality check, Shipped, or Delivered. This page explains what to expect at each stage."
      lastUpdated="14 September 2026"
      note={
        <>
          This policy works alongside our <a href="/terms">Terms of Use</a>. Nothing here limits
          any statutory right you have under Sri Lankan consumer-protection law.
        </>
      }
      sections={[
        {
          id: 'before-purchase',
          heading: 'Before we purchase your item',
          body: (
            <>
              <p>
                A quote is not a confirmed order. If you cancel a request or a quote before
                WishDrop has purchased the item from the seller, you are entitled to a full
                refund of any amount paid, less any payment-gateway processing fee that is not
                refundable to us.
              </p>
              <p>
                Once you accept a quote and payment succeeds, we begin purchasing your item. Because
                sellers are paid at this point, cancellation after this step is handled under{' '}
                <a href="#after-purchase">After we've purchased your item</a> below.
              </p>
            </>
          ),
        },
        {
          id: 'after-purchase',
          heading: "After we've purchased your item",
          body: (
            <>
              <p>
                Once WishDrop has paid a seller on your behalf, the order generally cannot be
                cancelled for a full refund, because funds have already left our account. In
                limited cases where a seller allows cancellation before dispatch, we will pass on
                any refund the seller provides, minus our non-refundable service fee, which covers
                the work already performed sourcing and processing your order.
              </p>
              <p>
                If a seller is unable to fulfil your order at all (for example, the item goes out
                of stock after purchase, or the seller refuses to ship) and no replacement is
                available, WishDrop will refund the product cost paid to the seller and any
                shipping/service fees tied specifically to that item, back to your WishDrop wallet
                credit or original payment method, at your choice where possible.
              </p>
            </>
          ),
        },
        {
          id: 'quality-check-rejections',
          heading: 'Items rejected at quality check',
          body: (
            <>
              <p>
                Every item is inspected at a WishDrop facility before it is consolidated for
                international shipping. If an item fails quality check because it is:
              </p>
              <ul>
                <li>materially different from what was ordered (wrong item, size, or colour, not caused by your own selection),</li>
                <li>counterfeit or not as described by the seller, or</li>
                <li>damaged or defective on arrival at our facility (not caused by transit to us),</li>
              </ul>
              <p>
                you will be offered, at your choice where the seller allows it: a replacement, a
                refund of the product cost and any fees tied to that item, or WishDrop wallet
                credit. We will notify you with photos or a description of the issue found during
                inspection before proceeding.
              </p>
              <p>
                Minor cosmetic packaging differences that do not affect the product itself are not
                treated as a quality-check failure.
              </p>
            </>
          ),
        },
        {
          id: 'lost-damaged',
          heading: 'Lost or damaged in transit',
          body: (
            <>
              <p>
                If an item is confirmed lost by the courier, or arrives at your address visibly
                damaged in a way that occurred after it left our facility, contact support within{' '}
                <strong>48 hours of delivery</strong> (or, for a non-delivery, once tracking shows
                no further movement for an unreasonable period) with photos of the damage or
                packaging where applicable.
              </p>
              <p>
                Claims for shipments covered by our optional{' '}
                <a href="/shipping/protection">Shipping Protection Plan</a> are handled under the
                terms of that plan, up to its stated coverage limit. For shipments without
                protection, WishDrop will pursue a claim with the courier on your behalf and pass
                on any compensation received; WishDrop's own liability in this case is limited as
                set out in our <a href="/terms">Terms of Use</a>.
              </p>
            </>
          ),
        },
        {
          id: 'buyer-remorse',
          heading: "Change of mind after delivery",
          body: (
            <p>
              Because most items are purchased specifically for you from third-party sellers,
              change-of-mind returns after delivery are not covered by default and depend entirely
              on the individual seller's own return policy, which may involve return shipping back
              to the seller's country at your cost and is not guaranteed. If you purchased through
              a store covered by our{' '}
              <a href="/shopping/protection">Shopping Protection Plan</a>, refer to that plan for
              any additional coverage that may apply.
            </p>
          ),
        },
        {
          id: 'how-refunds-are-paid',
          heading: 'How refunds are paid',
          body: (
            <>
              <p>Approved refunds are issued using one of the following, depending on the case:</p>
              <ul>
                <li>WishDrop wallet credit, usually available within 24–48 hours of approval.</li>
                <li>Reversal to your original payment method, which can take 5–14 business days depending on your bank or card issuer.</li>
              </ul>
              <p>
                Promotional discounts, credits, or points applied to an order are deducted or
                returned proportionally and are not paid out as cash.
              </p>
            </>
          ),
        },
        {
          id: 'how-to-request',
          heading: 'How to request a refund',
          body: (
            <p>
              Open the relevant request or order under{' '}
              <a href="/account/orders">My Requests</a> or{' '}
              <a href="/account/orders">My Orders</a> and use the “Get help with this order”
              option, or contact us through <a href="/contact">Contact us</a>, in-app chat, or
              WhatsApp with your order number. We will review the request, may ask for supporting
              photos, and will confirm the outcome in writing.
            </p>
          ),
        },
      ]}
    />
  )
}
