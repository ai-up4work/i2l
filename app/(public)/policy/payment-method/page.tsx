import LegalPageLayout from '@/components/shared/LegalPageLayout'

export const metadata = {
  title: 'Payment Methods | WishDrop',
  description: 'Accepted payment methods on WishDrop — cards, mobile wallets, and WishDrop wallet credit.',
}

export default function PaymentMethodPage() {
  return (
    <LegalPageLayout
      eyebrow="Policy"
      title="Payment Methods"
      intro="How you can pay for a quote or order on WishDrop, when payment is due, and how refunds are returned."
      lastUpdated="14 September 2026"
      sections={[
        {
          id: 'accepted-methods',
          heading: 'Accepted payment methods',
          body: (
            <>
              <p>WishDrop accepts the following at checkout:</p>
              <ul>
                <li><strong>Debit and credit cards</strong> — Visa and Mastercard, processed by our licensed payment gateway partner.</li>
                <li><strong>Mobile wallets</strong> — where available for your bank/provider at checkout.</li>
                <li><strong>WishDrop wallet credit</strong> — balance from refunds, referrals, or loyalty rewards, applied automatically before any other method is charged.</li>
                <li><strong>Coupon codes and promotional credit</strong> — applied as a discount on top of the above, not a standalone payment method.</li>
              </ul>
              <p>Available methods can vary slightly by order type and your bank, and are always shown at checkout before you confirm payment.</p>
            </>
          ),
        },
        {
          id: 'security',
          heading: 'How your payment is handled',
          body: (
            <p>
              Card and wallet payments are processed directly by our payment gateway partner over an
              encrypted connection. WishDrop does not store your full card number, CVV, or wallet
              credentials — only a transaction reference, payment status, and (for cards) the last
              four digits, as described in our <a href="/privacy">Privacy Policy</a>.
            </p>
          ),
        },
        {
          id: 'when-charged',
          heading: 'When you\u2019re charged',
          body: (
            <p>
              Payment is collected in full when you accept a quote, before WishDrop purchases the
              item on your behalf. For catalogue orders, this happens at checkout; for a submitted
              request, it happens once you accept the quote we send back. See{' '}
              <a href="/terms">Terms of Use</a> for what happens if a payment fails after an item has
              already been purchased.
            </p>
          ),
        },
        {
          id: 'currency',
          heading: 'Currency and conversion',
          body: (
            <p>
              Prices are shown and charged in the currency displayed at checkout. Where a product's
              underlying price is in a different currency (for example, INR for an Indian seller),
              WishDrop converts it into your checkout currency as part of the quote — the total you
              accept is the total you pay, with no separate conversion step at payment time.
            </p>
          ),
        },
        {
          id: 'refunds',
          heading: 'How refunds are returned',
          body: (
            <p>
              Approved refunds are issued as WishDrop wallet credit or a reversal to your original
              payment method, per our <a href="/refund-policy">Refund &amp; Cancellation Policy</a>.
              Card reversals can take 5–14 business days to appear, depending on your bank.
            </p>
          ),
        },
        {
          id: 'payment-issues',
          heading: 'Payment declined or failed',
          body: (
            <p>
              If a payment is declined, double-check your card limits, 3-D Secure/OTP approval, and
              that your bank allows international or online transactions. If the issue persists,
              contact us via <a href="/contact">Contact us</a> with your order or request number and
              we'll help sort it out.
            </p>
          ),
        },
      ]}
    />
  )
}
