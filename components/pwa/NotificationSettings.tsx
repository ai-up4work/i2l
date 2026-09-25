'use client'

// components/pwa/NotificationSettings.tsx
//
// "Notifications" section on the customer's profile page
// (app/account/profile/page.tsx), styled to match that page's other
// sections (top rule, serif heading, icon-labelled rows, two columns on lg):
//   1. On/off for push on THIS device (each phone/computer is separate).
//   2. Offers & promotions opt-out (applies to all devices and the bell).
//      Replies from support and service announcements always come through.

import { useEffect, useState } from 'react'
import { BellRing, Tag } from 'lucide-react'
import { ToggleSwitch } from '@/components/admin/Toggleswitch'
import { usePushNotifications } from '@/lib/pwa/push'
import InstallInstructions from './InstallInstructions'

function Row({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: typeof BellRing
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-6 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 font-semibold text-ink">
          <Icon size={17} strokeWidth={1.75} className="text-ink/40" aria-hidden="true" />
          {title}
        </div>
        <div className="mt-1.5 text-sm leading-relaxed text-ink/60">{children}</div>
      </div>
      {action && <div className="flex-none pt-0.5">{action}</div>}
    </div>
  )
}

export default function NotificationSettings({ className = '' }: { className?: string }) {
  const { status, busy, error, enable, disable } = usePushNotifications()
  const [offers, setOffers] = useState<boolean | null>(null)
  const [offersSaving, setOffersSaving] = useState(false)
  const [offersError, setOffersError] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    fetch('/api/push/preferences')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOffers(Boolean(d.offers)))
      .catch(() => setOffers(true))
  }, [])

  const toggleOffers = async () => {
    if (offers === null) return
    const next = !offers
    setOffers(next)
    setOffersSaving(true)
    setOffersError(null)
    try {
      const res = await fetch('/api/push/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offers: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setOffers(!next)
      setOffersError('Couldn’t save that. Try again.')
    } finally {
      setOffersSaving(false)
    }
  }

  let deviceDescription: React.ReactNode
  let deviceAction: React.ReactNode = null

  switch (status) {
    case 'on':
    case 'off':
      deviceDescription =
        status === 'on'
          ? 'You’ll get a notification on this device when we reply or your order moves.'
          : 'Get a notification on this device when we reply or your order moves, even when WishDrop is closed.'
      deviceAction = (
        <ToggleSwitch
          checked={status === 'on'}
          disabled={busy}
          onChange={() => (status === 'on' ? disable() : enable())}
          label="Notifications on this device"
        />
      )
      break
    case 'denied':
      deviceDescription =
        'Notifications are blocked for WishDrop in this browser. To allow them, open the site settings (the icon next to the address), set Notifications to Allow, then reload this page.'
      break
    case 'needs-install':
      deviceDescription = 'On iPhone and iPad, notifications work once WishDrop is added to your Home Screen.'
      deviceAction = (
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="rounded-xl border border-teal/30 bg-teal/[0.04] px-4 py-2 text-sm font-semibold text-teal-deep transition-colors hover:border-teal/50 hover:bg-teal/10"
        >
          Show me how
        </button>
      )
      break
    case 'unsupported':
      deviceDescription = 'This browser doesn’t support notifications. Chrome, Edge, Firefox and Safari do.'
      break
    case 'not-configured':
      deviceDescription = 'Notifications aren’t available yet.'
      break
    default:
      deviceDescription = 'Checking this device…'
  }

  return (
    <section className={`border-t border-ink/10 pt-8 ${className}`} aria-labelledby="profile-notifications-heading">
      <h2 id="profile-notifications-heading" className="font-display text-xl text-ink">
        Notifications
      </h2>
      <p className="mt-1 text-sm text-ink/55">How we reach you about replies, orders and offers.</p>

      <div className="mt-12 lg:grid lg:grid-cols-2 lg:gap-x-16">
        <div>
          <Row icon={BellRing} title="Notifications on this device" action={deviceAction}>
            {deviceDescription}
            {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
          </Row>
        </div>
        {/* Right column with a left rule on lg, mirroring the Account
            security section's layout above. */}
        <div className="mt-6 border-t border-ink/10 pt-6 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-16 lg:pt-0">
          <Row
            icon={Tag}
            title="Offers and promotions"
            action={
              <ToggleSwitch
                checked={offers ?? true}
                disabled={offers === null || offersSaving}
                onChange={toggleOffers}
                label="Offers and promotions"
              />
            }
          >
            Deals and discount codes. Replies from our team and important service updates always come through.
            {offersError && <p className="mt-2 text-xs font-semibold text-red-600">{offersError}</p>}
          </Row>
        </div>
      </div>

      <InstallInstructions open={guideOpen} platform="ios" onClose={() => setGuideOpen(false)} />
    </section>
  )
}
