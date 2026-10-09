// components/stores/StoreUnavailable.tsx
//
// What shoppers see instead of a bare 404 when a store isn't open: either
// it exists but is hidden/paused (we know its name and logo), or there is
// no store at that address at all. Points them somewhere useful.

import Link from 'next/link'
import { Store } from 'lucide-react'

export default function StoreUnavailable({
  name,
  logo,
  kind = 'paused',
}: {
  name?: string
  logo?: string
  /** 'paused' = the store exists but isn't open; 'missing' = no such store;
   *  'product' = the product isn't available. */
  kind?: 'paused' | 'missing' | 'product'
}) {
  const title =
    kind === 'paused'
      ? `${name ?? 'This shop'} isn’t open right now`
      : kind === 'product'
        ? 'This product isn’t available'
        : 'We couldn’t find that shop'
  const body =
    kind === 'paused'
      ? 'The shop is taking a short break or getting ready to open. Have a look at the other shops in the meantime, or save it for later.'
      : kind === 'product'
        ? 'It may have sold out, or the shop may be taking a break. There’s plenty more to find in our other shops.'
        : 'The link may be mistyped, or the shop has moved. You can browse every shop we deliver from.'

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-full border border-ink/10 bg-card shadow-sm">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-full w-full object-cover grayscale-[0.6]" />
        ) : (
          <Store size={28} className="text-ink/35" />
        )}
      </span>
      <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-md font-body text-[15px] leading-relaxed text-ink/60">{body}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/stores" className="rounded-xl bg-teal px-6 py-3 font-body text-sm font-semibold text-white hover:bg-teal-deep">
          Browse all shops
        </Link>
        <Link href="/" className="rounded-xl border border-ink/20 px-6 py-3 font-body text-sm font-semibold text-ink hover:border-ink">
          Go to the home page
        </Link>
      </div>
    </div>
  )
}
