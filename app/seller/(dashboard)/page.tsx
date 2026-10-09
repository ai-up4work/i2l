// app/seller/(dashboard)/page.tsx
//
// Seller overview: how the store looks, whether it's live, what's left to
// set up, and what needs attention (sold out / running low). Everything
// shown is the seller's own real data.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, Check, ChevronRight, Film, Package, Plus } from 'lucide-react'
import { getCurrentSeller } from '@/lib/supabase/seller-auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { imageThumb, videoPoster } from '@/lib/media'

type ProductRow = {
  id: string
  name: string
  images: string[] | null
  videos?: string[] | null
  stock_count: number | null
  active: boolean
  price: number
  created_at: string
}

export default async function SellerOverviewPage() {
  const seller = await getCurrentSeller()
  if (!seller) redirect('/seller/login')
  const admin = createServiceRoleClient()

  const [{ data: profile }, productsResult] = await Promise.all([
    admin.from('sellers').select('*').eq('id', seller.id).maybeSingle(),
    admin
      .from('products')
      .select('id, name, images, videos, stock_count, active, price, created_at')
      .eq('seller_id', seller.id)
      .order('created_at', { ascending: false })
      .limit(1000),
  ])
  let products = (productsResult.data ?? []) as unknown as ProductRow[]
  if (productsResult.error) {
    // Videos column not added yet: read without it.
    const { data } = await admin.from('products').select('id, name, images, stock_count, active, price, created_at').eq('seller_id', seller.id).limit(1000)
    products = (data ?? []) as unknown as ProductRow[]
  }
  const p = (profile ?? {}) as Record<string, string | null>

  const live = seller.status === 'active'
  const active = products.filter((x) => x.active)
  const drafts = products.length - active.length
  const soldOut = active.filter((x) => x.stock_count === 0)
  const low = active.filter((x) => x.stock_count != null && x.stock_count > 0 && x.stock_count <= 3)
  const videoCount = products.reduce((n, x) => n + (x.videos?.length ?? 0), 0)

  const checklist = [
    { done: Boolean(p.logo_url), title: 'Add your logo', href: '/seller/account' },
    { done: Boolean(p.cover_url), title: 'Add a cover photo', href: '/seller/account' },
    { done: Boolean(p.instagram_url || p.facebook_url), title: 'Link your Instagram or Facebook', href: '/seller/account' },
    { done: active.length > 0, title: 'Add your first product', href: '/seller/products?new=1' },
    { done: videoCount > 0, title: 'Add a video to a product', href: '/seller/products' },
    { done: active.length >= 10, title: 'Reach 10 products', href: '/seller/products?new=1' },
  ]
  const remaining = checklist.filter((c) => !c.done)
  const cover = p.cover_url ? imageThumb(p.cover_url, 1400) : null
  const recent = products.slice(0, 6)

  return (
    <div className="flex flex-col gap-8">
      {/* ── The store, as shoppers see the top of it ── */}
      <section className="overflow-hidden rounded-3xl bg-card ring-1 ring-ink/10">
        <div className="relative h-28 bg-indigo sm:h-40">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(120%_140%_at_0%_0%,var(--color-teal)_0%,var(--color-indigo)_60%)]" />
          )}
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
          <div className="flex items-end gap-4">
            <span className="relative z-10 -mt-9 grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-full border-4 border-card bg-parchment">
              {p.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageThumb(p.logo_url, 200)} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-2xl font-semibold text-indigo">{seller.name.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <div className="min-w-0 pb-1">
              <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{seller.name}</h1>
              <p className="truncate font-body text-sm text-ink/55">{p.tagline || 'Add a tagline in your store profile'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/seller/account" className="rounded-xl border border-ink/15 px-4 py-2.5 font-body text-sm font-semibold text-ink/75 hover:border-ink hover:text-ink">
              Edit store page
            </Link>
            <a href={`/stores/${seller.platform}`} target="_blank" rel="noreferrer" className="rounded-xl bg-indigo px-4 py-2.5 font-body text-sm font-semibold text-parchment hover:bg-indigo-deep">
              {live ? 'View store' : 'Preview store'}
            </a>
          </div>
        </div>

        {/* Numbers that matter, in one quiet strip */}
        <dl className="grid grid-cols-2 border-t border-ink/10 sm:grid-cols-4">
          {[
            { label: 'Products on sale', value: active.length, icon: Package },
            { label: 'Drafts', value: drafts, icon: Package },
            { label: 'Sold out', value: soldOut.length, icon: AlertTriangle, warn: soldOut.length > 0 },
            { label: 'Videos', value: videoCount, icon: Film },
          ].map((s, i) => (
            <div key={s.label} className={`px-5 py-4 sm:px-7 ${i % 2 === 1 ? 'border-l border-ink/10' : ''} ${i >= 2 ? 'border-t border-ink/10 sm:border-t-0' : ''} ${i === 2 ? 'sm:border-l' : ''}`}>
              <dt className="font-body text-xs text-ink/55">{s.label}</dt>
              <dd className={`mt-1 font-display text-3xl font-semibold tabular-nums ${s.warn ? 'text-red-700' : 'text-ink'}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          {/* ── Needs attention ── */}
          {(soldOut.length > 0 || low.length > 0) && (
            <section>
              <h2 className="font-display text-xl font-semibold text-ink">Needs attention</h2>
              <ul className="mt-3 divide-y divide-ink/10 rounded-2xl bg-card ring-1 ring-ink/10">
                {[...soldOut, ...low].slice(0, 8).map((x) => (
                  <li key={x.id}>
                    <Link href={`/seller/products?edit=${x.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-parchment/60">
                      <Thumb product={x} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-body text-sm font-medium text-ink">{x.name}</span>
                        <span className={`block font-body text-xs ${x.stock_count === 0 ? 'text-red-700' : 'text-gold-deep'}`}>
                          {x.stock_count === 0 ? 'Sold out: shoppers can’t buy it' : `Only ${x.stock_count} left`}
                        </span>
                      </span>
                      <span className="font-body text-xs font-semibold text-teal-deep">Update stock</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Latest products ── */}
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-semibold text-ink">Your latest products</h2>
              {products.length > 0 && (
                <Link href="/seller/products" className="flex items-center gap-0.5 font-body text-sm font-semibold text-teal-deep">
                  All {products.length} <ChevronRight size={15} />
                </Link>
              )}
            </div>
            {recent.length === 0 ? (
              <Link href="/seller/products?new=1" className="mt-3 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-ink/15 px-6 py-12 text-center hover:border-teal">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-teal/10 text-teal-deep">
                  <Plus size={22} />
                </span>
                <span className="font-display text-lg font-semibold text-ink">Add your first product</span>
                <span className="max-w-xs font-body text-sm text-ink/55">Use the same photos and reels you post on Instagram. It takes a couple of minutes.</span>
              </Link>
            ) : (
              <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
                {recent.map((x) => (
                  <li key={x.id}>
                    <Link href={`/seller/products?edit=${x.id}`} className="group block">
                      <span className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-ink/5">
                        {(x.images?.[0] || x.videos?.[0]) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={x.images?.[0] ? imageThumb(x.images[0], 300) : videoPoster(x.videos![0], 300)}
                            alt=""
                            className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${x.active ? '' : 'opacity-50'}`}
                          />
                        )}
                        {!x.active && <span className="absolute left-1.5 top-1.5 rounded bg-card/90 px-1.5 py-0.5 font-body text-[10px] font-semibold text-ink/70">Draft</span>}
                      </span>
                      <span className="mt-1.5 block truncate font-body text-xs text-ink/70">{x.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Setup checklist ── */}
        <aside>
          <section className="rounded-2xl bg-card p-5 ring-1 ring-ink/10">
            <h2 className="font-display text-xl font-semibold text-ink">{remaining.length === 0 ? 'Your store is all set' : 'Make your store shine'}</h2>
            <p className="mt-1 font-body text-sm text-ink/55">
              {remaining.length === 0
                ? 'Keep adding new products and reels. Fresh stores get more orders.'
                : `${checklist.length - remaining.length} of ${checklist.length} done. Shoppers trust stores that look complete.`}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
              <div className="h-full rounded-full bg-teal" style={{ width: `${((checklist.length - remaining.length) / checklist.length) * 100}%` }} />
            </div>
            <ul className="mt-4 flex flex-col gap-1">
              {checklist.map((c) => (
                <li key={c.title}>
                  <Link href={c.href} className={`flex items-center gap-3 rounded-xl px-2 py-2 font-body text-sm ${c.done ? 'text-ink/45' : 'text-ink hover:bg-parchment'}`}>
                    <span className={`grid h-5 w-5 flex-none place-items-center rounded-full ${c.done ? 'bg-teal text-white' : 'border border-ink/25'}`}>
                      {c.done && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className={c.done ? 'line-through decoration-ink/25' : ''}>{c.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

function Thumb({ product }: { product: ProductRow }) {
  const src = product.images?.[0] ? imageThumb(product.images[0], 120) : product.videos?.[0] ? videoPoster(product.videos[0], 120) : ''
  return (
    <span className="h-11 w-11 flex-none overflow-hidden rounded-lg bg-ink/5">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      )}
    </span>
  )
}
