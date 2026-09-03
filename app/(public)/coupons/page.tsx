import Link from 'next/link'
import { ArrowLeft, Construction } from 'lucide-react'

export const metadata = {
  title: 'Coupons | Buyandship',
  description: 'Save on shipping and shopping fees with the latest coupons.',
}

export default function Page() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-start justify-center px-6 py-24">
      <div className="mb-6 flex items-center gap-2 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Construction size={14} className="text-rust" />
        Mock page
      </div>

      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Coupons
      </h1>

      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
        Save on shipping and shopping fees with the latest coupons.
      </p>

      <p className="mt-2 font-mono text-xs text-ink/40">
        /coupons
      </p>

      <Link
        href="/"
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
      >
        <ArrowLeft size={15} />
        Back to home
      </Link>
    </main>
  )
}
