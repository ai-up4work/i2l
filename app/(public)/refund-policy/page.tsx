import LegalPageLayout from '@/components/shared/LegalPageLayout'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/refund-policy',
  title: 'Refund & Cancellation Policy | Wishdrop',
  description:
    'How order cancellations, refunds, returns, and exchanges work at Wishdrop.',
})

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout
      eyebrow="Legal"
      title="Refund & Cancellation Policy"
      intro="Here's how cancellations, refunds, returns, and exchanges work at Wishdrop."
      lastUpdated="14 September 2026"
      note={
        <>
          This policy works alongside our <a href="/terms">Terms of Use</a>. Nothing here limits
          any statutory right you have under Sri Lankan consumer-protection law.
        </>
      }
      sections={[
        {
          id: 'order-cancellations',
          heading: 'Order Cancellations',
          body: (
            <ul>
              <li>
                <strong>How to Cancel:</strong> You can request an order cancellation by
                messaging our customer care team on WhatsApp at{' '}
                <a href="https://wa.me/94770774828">+94 77 077 4828</a>.
              </li>
              <li>
                <strong>Dispatch Policy:</strong> Orders cannot be canceled once they have
                already been shipped out.
              </li>
              <li>
                <strong>Cancellation Fee:</strong> If you choose to cancel your order, a 2%
                cancellation fee will be deducted from your total refund amount.
              </li>
              <li>
                <strong>Our Right to Cancel:</strong> Wishdrop reserves the right to cancel any
                order and issue a full refund without prior customer approval. This may happen
                due to incorrect order details or unforeseen issues beyond our control (such as
                courier delays or manufacturing issues).
              </li>
              <li>
                <strong>Out of Stock:</strong> If an item you ordered is out of stock, your
                refund will be processed directly to your bank account within 7 days.
              </li>
            </ul>
          ),
        },
        {
          id: 'return-exchange-policy',
          heading: 'Return & Exchange Policy',
          body: (
            <>
              <h3>Product Responsibility & Our Role</h3>
              <ul>
                <li>
                  <strong>Customer Responsibility:</strong> You are fully responsible for
                  choosing the right item color, design, material, and ensuring it meets your
                  needs.
                </li>
                <li>
                  <strong>Our Role:</strong> Wishdrop acts as your purchasing and logistics
                  partner. We only assist you with purchasing the item, managing international
                  shipping, handling customs clearance, and delivering it safely to your
                  doorstep.
                </li>
              </ul>
              <ul>
                <li>
                  <strong>Damaged or Wrong Items:</strong> If you receive the wrong or a damaged
                  item, please send us a continuous, uncut parcel-opening video on WhatsApp at{' '}
                  <a href="https://wa.me/94770774828">+94 77 077 4828</a>.
                </li>
                <li>
                  <strong>Exchanges:</strong> You can easily exchange your item for other
                  products. If you are returning a wrong or damaged item, we will cover the
                  courier cost.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'how-to-request',
          heading: 'How to request a refund or exchange',
          body: (
            <p>
              Message our customer care team on WhatsApp at{' '}
              <a href="https://wa.me/94770774828">+94 77 077 4828</a>, or contact us through{' '}
              <a href="/contact">Contact us</a> or in-app chat with your order number. We will
              review the request and confirm the outcome with you.
            </p>
          ),
        },
      ]}
    />
  )
}