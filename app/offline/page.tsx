// app/offline/page.tsx
//
// Shown by the service worker (public/sw.js) when a page is opened with no
// connection and there's no cached copy of it. It's precached at install,
// so it must work with zero network: no data fetching, no client JS
// required, and the only image is the precached app icon.

import AirmailStripe from '@/components/shared/AirmailStripe'
import { PWA_ICONS, SITE } from '@/lib/seo'

export const dynamic = 'force-static'

export const metadata = {
  title: "You're offline",
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-parchment text-ink">
      <AirmailStripe />
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PWA_ICONS.icon192}
            alt={SITE.name}
            width={56}
            height={56}
            className="size-14 rounded-2xl"
          />
          <h1 className="mt-8 font-display text-4xl leading-tight tracking-tight text-indigo">
            You&rsquo;re offline.
          </h1>
          <p className="mt-4 max-w-[36ch] font-body text-base leading-relaxed text-ink/70">
            Prices, requests and order tracking need a connection. Pages you opened recently
            still work, and nothing in your cart has been lost.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 font-body">
            {/* href="" reloads the page the visitor was actually trying to
                open, with no JavaScript needed. */}
            <a
              href=""
              className="rounded-xl bg-teal px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
            >
              Try again
            </a>
            <a
              href="/"
              className="rounded-xl border border-ink/15 px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
            >
              Go to homepage
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
