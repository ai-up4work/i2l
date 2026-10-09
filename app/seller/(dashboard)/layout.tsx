// app/seller/(dashboard)/layout.tsx
//
// Seller portal shell. Desktop: an indigo rail on the left (store,
// navigation, add product, view store, help). Phone: a slim top bar and a
// bottom tab bar. Only signed-in sellers get past this layout.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentSeller } from '@/lib/supabase/seller-auth'
import { imageThumb } from '@/lib/media'
import AirmailStripe from '@/components/shared/AirmailStripe'
import { SellerSideNav, SellerTabBar } from './SellerNav'

function StoreBadge({ name, logo, live, dark }: { name: string; logo: string | null; live: boolean; dark?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={`grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full ${dark ? 'bg-parchment/10' : 'bg-parchment'} ring-1 ${dark ? 'ring-parchment/20' : 'ring-ink/10'}`}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageThumb(logo, 120)} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className={`font-display text-lg font-semibold ${dark ? 'text-parchment' : 'text-indigo'}`}>{name.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <div className="min-w-0">
        <p className={`truncate font-body text-sm font-semibold ${dark ? 'text-parchment' : 'text-ink'}`}>{name}</p>
        <p className={`flex items-center gap-1.5 font-body text-xs ${dark ? 'text-parchment/60' : 'text-ink/55'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-gold'}`} />
          {live ? 'Live on Wishdrop' : 'Not live yet'}
        </p>
      </div>
    </div>
  )
}

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const seller = await getCurrentSeller()
  if (!seller) redirect('/seller/login')
  const live = seller.status === 'active'

  return (
    <div className="min-h-screen bg-parchment lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen flex-col bg-indigo lg:flex">
        <AirmailStripe />
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
          <Link href="/seller" className="px-3 font-display text-xl font-semibold tracking-tight text-parchment">
            wishdrop <span className="font-body text-xs font-medium text-parchment/50">for sellers</span>
          </Link>
          <div className="rounded-2xl bg-parchment/5 p-3 ring-1 ring-parchment/10">
            <StoreBadge name={seller.name} logo={seller.logoUrl} live={live} dark />
          </div>
          <SellerSideNav storeSlug={seller.platform} live={live} />
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phone top bar */}
        <header className="sticky top-0 z-30 border-b border-ink/10 bg-parchment/95 backdrop-blur-md lg:hidden">
          <AirmailStripe />
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <StoreBadge name={seller.name} logo={seller.logoUrl} live={live} />
            <a href={`/stores/${seller.platform}`} target="_blank" rel="noreferrer" className="flex-none rounded-full border border-ink/15 px-3 py-1.5 font-body text-xs font-semibold text-ink/70">
              {live ? 'View store' : 'Preview'}
            </a>
          </div>
        </header>

        {!live && (
          <div className="border-b border-gold/40 bg-gold/15 px-4 py-2.5 font-body text-sm text-ink sm:px-8">
            <span className="font-semibold">Your store isn&rsquo;t live yet.</span>{' '}
            <span className="text-ink/70">Shoppers can&rsquo;t see it, but you can keep adding products and preview it. Wishdrop will make it live.</span>
          </div>
        )}

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-8 sm:pt-8 lg:pb-12">{children}</main>
      </div>

      <SellerTabBar />
    </div>
  )
}
