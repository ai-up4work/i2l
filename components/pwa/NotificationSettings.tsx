'use client'

// components/pwa/NotificationSettings.tsx
//
// "Notifications" card on /account/settings:
//   1. On/off for push on THIS device (each phone/computer is separate).
//   2. Offers & promotions opt-out (applies to all devices and the bell).
//      Replies from support and service announcements always come through.

import { useEffect, useState } from 'react'
import { ToggleSwitch } from '@/components/admin/Toggleswitch'
import { usePushNotifications } from '@/lib/pwa/push'
import InstallInstructions from './InstallInstructions'

function Row({ title, description, action }: { title: string; description: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-ink/5 py-6 first:pt-0 last:border-0 last:pb-0">
      <div className="min-w-0">
        <div className="font-semibold text-ink">{title}</div>
        <div className="mt-1 max-w-xl text-sm leading-relaxed text-ink/60">{description}</div>
      </div>
      {action && <div className="flex-none pt-0.5">{action}</div>}
    </div>
  )
}

export default function NotificationSettings() {
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
          className="rounded-xl border border-ink/15 bg-parchment px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-teal/40 hover:bg-teal/5"
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
    <>
      <h2 className="mt-10 font-display text-xl text-ink">Notifications</h2>
      <div className="mt-4 rounded-2xl border border-ink/10 bg-card px-6 py-6 sm:px-8">
        <Row title="Notifications on this device" description={deviceDescription} action={deviceAction} />
        {error && <p className="-mt-3 pb-3 text-xs font-semibold text-red-600">{error}</p>}
        <Row
          title="Offers and promotions"
          description="Deals and discount codes. Replies from our team and important service updates always come through."
          action={
            <ToggleSwitch
              checked={offers ?? true}
              disabled={offers === null || offersSaving}
              onChange={toggleOffers}
              label="Offers and promotions"
            />
          }
        />
        {offersError && <p className="-mt-3 text-xs font-semibold text-red-600">{offersError}</p>}
      </div>
      <InstallInstructions open={guideOpen} platform="ios" onClose={() => setGuideOpen(false)} />
    </>
  )
}
