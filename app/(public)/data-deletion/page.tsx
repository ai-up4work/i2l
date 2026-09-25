import LegalPageLayout from '@/components/shared/LegalPageLayout'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/data-deletion',
  title: 'Data Deletion Instructions | WishDrop',
  description: 'How to request deletion of your personal data from WishDrop.',
})

// Exists mainly because Meta's App Dashboard (Settings > Basic > User data
// deletion) requires a real, live "Data deletion instructions URL" before
// an app can be submitted for review — a mailto: link isn't acceptable
// there, it has to be an actual page. Content describes the SAME manual,
// support-email-based process ProfilePage.tsx's own "Delete Account" /
// "Download Your Information" rows already point to — there's no
// automated deletion/export endpoint built yet (see that file's own
// comment on why: a real cascading delete or data-export job, not
// something to fake with a button that looks automated but isn't).
export default function DataDeletionPage() {
  return (
    <LegalPageLayout
      eyebrow="Legal"
      title="Data Deletion Instructions"
      intro="You can ask us to delete your WishDrop account and the personal data associated with it at any time. Here's exactly how, and what happens next."
      lastUpdated="21 September 2026"
      sections={[
        {
          id: 'how-to-request',
          heading: 'How to request deletion',
          body: (
            <>
              <p>
                Email <a href="mailto:support@wishdrop.shop?subject=Delete%20my%20account">support@wishdrop.shop</a>{' '}
                from the email address on your WishDrop account, with the subject line{' '}
                <strong>&quot;Delete my account&quot;</strong>. If you signed up or verified with a WhatsApp
                number instead, include that number in your message so we can find your account.
              </p>
              <p>
                You can also start this from inside the app: go to{' '}
                <strong>Account → Profile → Delete Account</strong>, which opens the same request pre-filled
                for you.
              </p>
            </>
          ),
        },
        {
          id: 'what-we-verify',
          heading: 'How we verify it&apos;s you',
          body: (
            <p>
              Before deleting anything, we&apos;ll confirm the request came from you — normally by replying to
              the same email thread, or by asking you to confirm a detail on file (like your registered
              WhatsApp number or a recent order). This protects you from someone else requesting deletion of
              your account without your knowledge.
            </p>
          ),
        },
        {
          id: 'what-gets-deleted',
          heading: 'What gets deleted',
          body: (
            <>
              <p>Once verified, we permanently delete:</p>
              <ul>
                <li>Your account, login credentials, and profile information</li>
                <li>Saved addresses, wishlist, cart, and community activity</li>
                <li>Chat and message history tied to your account</li>
                <li>Loyalty points, referral data, and saved payment references</li>
              </ul>
              <p>
                <strong>What we keep, and why:</strong> records we&apos;re legally required to retain — for
                example, completed order and payment records for tax, accounting, and customs purposes, or
                information needed to resolve an open dispute or investigation. Where we retain anything, it&apos;s
                kept only as long as the law requires and is no longer linked to your everyday account
                activity.
              </p>
            </>
          ),
        },
        {
          id: 'timeline',
          heading: 'How long it takes',
          body: (
            <p>
              We aim to complete verified deletion requests within <strong>30 days</strong>. You&apos;ll get an
              email confirming once it&apos;s done. This can&apos;t be undone — once your account is deleted, we
              can&apos;t recover it or any data in it.
            </p>
          ),
        },
        {
          id: 'requesting-your-data-instead',
          heading: 'Requesting a copy of your data instead',
          body: (
            <p>
              If you want a copy of your personal data rather than deleting it, email{' '}
              <a href="mailto:support@wishdrop.shop?subject=Data%20export%20request">support@wishdrop.shop</a>{' '}
              with the subject line <strong>&quot;Data export request&quot;</strong>, or use{' '}
              <strong>Account → Profile → Download Your Information</strong>. See our{' '}
              <a href="/privacy">Privacy Policy</a> for more on what we collect and how it&apos;s used.
            </p>
          ),
        },
      ]}
    />
  )
}