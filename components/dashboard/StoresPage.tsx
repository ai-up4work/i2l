'use client'

import { ArrowRight, ExternalLink, Link as LinkIcon } from 'lucide-react'
import Link from 'next/link'
import { affiliatedStores } from './data'

export default function StoresPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8 lg:px-10">
      <div className="motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Affiliated stores</h1>
        <p className="mt-2 text-sm text-ink/55">
          Shop directly from any of our {affiliatedStores.length} partner marketplaces — we handle the rest.
        </p>
      </div>

      {/* Decorative header strip */}
      <div className="relative mt-6 overflow-hidden rounded-2xl bg-gold/10 px-6 py-5 motion-safe:[animation:fadeUp_0.45s_ease-out_0.05s_both]">
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gold/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-indigo-deep text-parchment shadow-lift motion-safe:[animation:floatSlow_4s_ease-in-out_infinite]">
              <ExternalLink size={20} />
            </span>
            <div>
              <p className="font-semibold text-ink">Browse, then send us the link</p>
              <p className="text-xs text-ink/55">Paste any product URL from these stores into "Add request"</p>
            </div>
          </div>

          {/* Login-aware CTA — this page is public, but starting a request isn't.
              Sends anonymous visitors to login first, then back to the add-request flow. */}
          <Link
            href="/login?redirect=/account/requests/new"
            className="group flex items-center justify-center gap-2 rounded-xl bg-teal px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors duration-200 hover:bg-teal-deep"
          >
            <LinkIcon size={16} />
            Add request
            <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-teal-deep motion-safe:[animation:fadeUp_0.4s_ease-out_0.1s_both]">
        Partner marketplaces
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {affiliatedStores.map((store, index) => (
          <a
            key={store.name}
            href={store.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 rounded-2xl border border-ink/10 bg-card px-5 py-4 transition-colors duration-200 hover:border-teal/25 hover:bg-ink/[0.03] motion-safe:[animation:fadeUp_0.35s_ease-out_both]"
            style={{ animationDelay: `${140 + index * 40}ms` }}
          >
            <span className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-full border border-ink/10 bg-parchment transition-transform duration-200 group-hover:scale-105">
              <img src={store.logo} alt="" className="h-full w-full object-contain p-1.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{store.name}</span>
            <ExternalLink
              size={15}
              className="flex-none text-ink/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              aria-hidden
            />
          </a>
        ))}
      </div>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink/60 motion-safe:[animation:fadeUp_0.4s_ease-out_0.15s_both]">
        Don't see the store you're looking for? We can still process most requests — just add the product link and
        we'll confirm availability.
      </p>
    </div>
  )
}