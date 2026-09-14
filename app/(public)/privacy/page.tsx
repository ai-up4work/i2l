import LegalPageLayout from '@/components/shared/LegalPageLayout'

export const metadata = {
  title: 'Privacy Policy | WishDrop',
  description:
    'How WishDrop collects, uses, shares, and protects your personal data across the buying, quality-check, and delivery journey.',
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      eyebrow="Legal"
      title="Privacy Policy"
      intro="This Privacy Policy explains what personal data WishDrop collects when you use our website, mobile experience, and concierge buying service, why we collect it, who we share it with, and the choices and rights you have over it."
      lastUpdated="14 September 2026"
      note={
        <>
          WishDrop (“WishDrop”, “we”, “us”, or “our”) is operated by WishDrop Limited. This
          policy should be read alongside our <a href="/terms">Terms of Use</a>. By creating an
          account or using any part of the service, you agree to the practices described here.
        </>
      }
      sections={[
        {
          id: 'who-we-are',
          heading: 'Who we are and what this policy covers',
          body: (
            <>
              <p>
                WishDrop is a concierge shopping and cross-border delivery service that lets
                customers in Sri Lanka buy products from affiliated Indian stores or request
                products from other online stores, without handling international purchasing,
                warehousing, customs, or shipping themselves.
              </p>
              <p>
                This policy applies to personal data we collect through wishdrop.lk (and any
                subdomains), our account dashboard, our WhatsApp and in-app chat channels, and
                any related customer support interactions. It does not cover the privacy
                practices of third-party stores, marketplaces, couriers, or payment processors
                we work with — their own privacy policies govern the data they collect directly.
              </p>
            </>
          ),
        },
        {
          id: 'data-we-collect',
          heading: 'Personal data we collect',
          body: (
            <>
              <p>We collect the following categories of information:</p>
              <ul>
                <li>
                  <strong>Account and identity data:</strong> full name, email address, WhatsApp
                  / mobile number, date of birth (where required for verification), password
                  (stored as a salted hash — we never store plain-text passwords), and profile
                  photo if you add one.
                </li>
                <li>
                  <strong>Delivery and contact data:</strong> saved addresses, recipient names
                  and phone numbers in your Address Book, and delivery instructions.
                </li>
                <li>
                  <strong>Order and request data:</strong> product links or descriptions you
                  submit, quotes generated, order history, quantities, sizes/variants, special
                  instructions, and communications about a specific order.
                </li>
                <li>
                  <strong>Payment data:</strong> WishDrop does not store your full card number,
                  CVV, or bank credentials. Payments are processed by our licensed payment
                  gateway partner, and we retain only a transaction reference, the last four
                  digits of a card (if applicable), payment status, and amount.
                </li>
                <li>
                  <strong>Verification data:</strong> WhatsApp number verification (OTP) status,
                  and, where legally required for higher-value shipments or customs purposes,
                  government-issued identification details.
                </li>
                <li>
                  <strong>Wishlist, cart, and community data:</strong> saved products, boards,
                  follows, community posts and comments, and loyalty/points activity.
                </li>
                <li>
                  <strong>Support data:</strong> chat transcripts, emails, call notes, and
                  attachments you share when contacting support.
                </li>
                <li>
                  <strong>Technical data:</strong> IP address, device type, browser type,
                  operating system, pages visited, referring URL, and approximate location
                  derived from IP, collected automatically through cookies and similar
                  technologies (see <a href="#cookies">Cookies</a> below).
                </li>
                <li>
                  <strong>Marketing preferences:</strong> your subscription status for
                  promotional emails, SMS, or WhatsApp messages, and your engagement with those
                  messages.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'how-we-use-data',
          heading: 'How we use your data',
          body: (
            <>
              <p>We use personal data to:</p>
              <ul>
                <li>Create and manage your account, and authenticate you when you log in.</li>
                <li>
                  Process buying requests: look up products, generate quotes, purchase items on
                  your behalf, and communicate with the seller or store where necessary.
                </li>
                <li>
                  Coordinate quality checks, consolidation, customs documentation, international
                  shipping, and final delivery to your address.
                </li>
                <li>Process payments, issue receipts, and manage refunds or credits.</li>
                <li>
                  Provide customer support, respond to enquiries, and resolve disputes or claims.
                </li>
                <li>
                  Send transactional updates about your requests, orders, shipments, and account
                  (these cannot be opted out of while you hold an active account, since they are
                  necessary for the service).
                </li>
                <li>
                  Send promotional offers, deals, and product recommendations, where you have not
                  opted out (see <a href="#your-rights">Your rights</a>).
                </li>
                <li>
                  Detect, investigate, and prevent fraud, abuse, prohibited-item shipments, and
                  security incidents.
                </li>
                <li>
                  Comply with legal obligations, including customs, tax, anti-money-laundering,
                  and law-enforcement requests.
                </li>
                <li>
                  Improve the platform — understand usage patterns, debug issues, and test new
                  features. Where possible we use aggregated or de-identified data for this.
                </li>
              </ul>
              <p>
                We do not use your data to make fully automated decisions that produce legal or
                similarly significant effects about you without human review.
              </p>
            </>
          ),
        },
        {
          id: 'legal-basis',
          heading: 'Our legal basis for processing',
          body: (
            <>
              <p>Depending on the activity, we rely on one or more of the following bases:</p>
              <ul>
                <li>
                  <strong>Performance of a contract</strong> — processing needed to create your
                  account, fulfil a buying request, process payment, and deliver your order.
                </li>
                <li>
                  <strong>Consent</strong> — for optional marketing communications, non-essential
                  cookies, and WhatsApp number verification.
                </li>
                <li>
                  <strong>Legitimate interests</strong> — fraud prevention, service improvement,
                  and securing the platform, balanced against your rights and expectations.
                </li>
                <li>
                  <strong>Legal obligation</strong> — customs declarations, tax records, and
                  responding to lawful requests from authorities.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'sharing',
          heading: 'Who we share data with',
          body: (
            <>
              <p>We share personal data only where necessary, with:</p>
              <ul>
                <li>
                  <strong>Affiliated stores and sellers</strong> — order and delivery details
                  needed to fulfil the specific product you requested.
                </li>
                <li>
                  <strong>Logistics and customs partners</strong> — recipient name, address,
                  phone number, and shipment contents, as required for international shipping,
                  customs clearance, and last-mile delivery in Sri Lanka.
                </li>
                <li>
                  <strong>Payment processors</strong> — transaction details necessary to process
                  your payment securely, under their own PCI-DSS-compliant safeguards.
                </li>
                <li>
                  <strong>Cloud infrastructure and service providers</strong> (for example,
                  hosting, database, messaging, and analytics providers) — acting under our
                  instructions and bound by confidentiality and data-protection obligations,
                  solely to operate the platform on our behalf.
                </li>
                <li>
                  <strong>WhatsApp / messaging providers</strong> — to deliver order updates and
                  verification codes you have requested.
                </li>
                <li>
                  <strong>Professional advisors and auditors</strong> — where necessary for legal,
                  accounting, or insurance purposes, under confidentiality obligations.
                </li>
                <li>
                  <strong>Authorities and regulators</strong> — where required by law, customs
                  regulation, court order, or to protect the rights, safety, or property of
                  WishDrop, our customers, or the public.
                </li>
                <li>
                  <strong>A buyer in a corporate transaction</strong> — if WishDrop is involved in
                  a merger, acquisition, financing, or sale of assets, personal data may be
                  transferred as part of that transaction, subject to confidentiality
                  arrangements.
                </li>
              </ul>
              <p>We do not sell your personal data to third parties.</p>
            </>
          ),
        },
        {
          id: 'international-transfers',
          heading: 'International data transfers',
          body: (
            <p>
              Because WishDrop connects Sri Lankan customers with stores, warehouses, and delivery
              partners in India and elsewhere, your order and delivery data will necessarily be
              transferred outside Sri Lanka to fulfil your request. Some of our infrastructure and
              service providers may also process data outside Sri Lanka. Where we transfer
              personal data internationally, we take reasonable steps to ensure it receives a
              comparable level of protection, including contractual safeguards with our
              processors.
            </p>
          ),
        },
        {
          id: 'cookies',
          heading: 'Cookies and similar technologies',
          body: (
            <>
              <p>We use cookies and similar technologies to:</p>
              <ul>
                <li>Keep you logged in and remember your cart and wishlist between visits.</li>
                <li>Understand how the site is used, so we can fix issues and improve it.</li>
                <li>
                  Measure the performance of promotions and, where you consent, personalise
                  marketing.
                </li>
              </ul>
              <p>
                Strictly necessary cookies (for login sessions, cart, and security) cannot be
                disabled, as the platform will not function correctly without them. You can
                control non-essential cookies through your browser settings or any
                cookie-preference banner presented on the site. Blocking all cookies may affect
                your experience.
              </p>
            </>
          ),
        },
        {
          id: 'retention',
          heading: 'How long we keep your data',
          body: (
            <>
              <p>
                We retain personal data for as long as your account is active, and for a
                reasonable period afterwards to comply with tax, accounting, and customs
                record-keeping obligations, resolve disputes, and enforce our agreements.
                Transactional order records are generally retained for at least the period
                required by applicable Sri Lankan tax and consumer-protection law.
              </p>
              <p>
                If you close your account, we will delete or anonymise personal data that is no
                longer needed, except where we are required or permitted by law to retain it
                (for example, completed order and payment records).
              </p>
            </>
          ),
        },
        {
          id: 'security',
          heading: 'How we protect your data',
          body: (
            <>
              <p>
                We use administrative, technical, and physical safeguards designed to protect
                personal data, including encryption of data in transit, access controls limiting
                staff access to what is needed for their role, and monitoring for suspicious
                activity. No system is completely secure, and we cannot guarantee absolute
                security of information transmitted to us. You should keep your account password
                confidential and notify us immediately of any suspected unauthorised access.
              </p>
            </>
          ),
        },
        {
          id: 'your-rights',
          heading: 'Your rights and choices',
          body: (
            <>
              <p>
                Subject to applicable law, including the Personal Data Protection Act, No. 9 of
                2022 of Sri Lanka, you have the right to:
              </p>
              <ul>
                <li>Access the personal data we hold about you.</li>
                <li>Request correction of inaccurate or incomplete data.</li>
                <li>
                  Request deletion of your personal data, subject to our legal and contractual
                  retention obligations.
                </li>
                <li>Object to or restrict certain processing, including direct marketing.</li>
                <li>Withdraw consent at any time where processing is based on consent.</li>
                <li>Request a copy of your data in a portable format, where technically feasible.</li>
              </ul>
              <p>
                You can manage most of these directly from <a href="/account/settings">Account
                settings</a> and <a href="/account/profile">Profile</a>, unsubscribe from
                marketing using the link in any promotional message, or contact us using the
                details in <a href="/contact">Contact us</a> to exercise any of the rights above.
                We will respond within a reasonable time and may need to verify your identity
                before acting on a request.
              </p>
            </>
          ),
        },
        {
          id: 'children',
          heading: "Children's privacy",
          body: (
            <p>
              WishDrop is not directed at children under 18, and we do not knowingly collect
              personal data from children. If you believe a child has provided us with personal
              data, please contact us so we can delete it.
            </p>
          ),
        },
        {
          id: 'breach-notification',
          heading: 'Data breach notification',
          body: (
            <p>
              If a data breach occurs that is likely to result in a risk to your rights and
              freedoms, we will notify affected customers and the relevant supervisory authority
              without undue delay, in line with our obligations under applicable law.
            </p>
          ),
        },
        {
          id: 'changes',
          heading: 'Changes to this policy',
          body: (
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our
              practices, technology, or legal requirements. We will post the updated version here
              with a new “Last updated” date, and where changes are material, we will notify you
              by email, in-app notice, or WhatsApp before they take effect.
            </p>
          ),
        },
        {
          id: 'contact',
          heading: 'How to contact us',
          body: (
            <p>
              For questions about this policy or to exercise any privacy right, reach our support
              team through <a href="/contact">Contact us</a>, the in-app chat, or WhatsApp. We aim
              to acknowledge privacy-related requests within a reasonable time and resolve them as
              quickly as possible.
            </p>
          ),
        },
      ]}
    />
  )
}
