// app/seller/(dashboard)/layout.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentSeller } from '@/lib/supabase/seller-auth'
import SellerSignOutButton from './SellerSignOutButton'

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const seller = await getCurrentSeller()
  if (!seller) redirect('/seller/login')

  return (
    <div className="min-h-screen bg-parchment">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-ink/10 bg-card px-4 py-3 sm:px-6 sm:py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Seller portal</p>
          <h1 className="font-display text-lg text-ink">{seller.name}</h1>
        </div>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-ink/60">
          <Link href="/seller/products" className="hover:text-ink">
            My products
          </Link>
          <a href={`/stores/${seller.platform}`} target="_blank" rel="noreferrer" className="hover:text-ink">
            View my store
          </a>
          <Link href="/seller/account" className="hover:text-ink">
            Store profile
          </Link>
          <SellerSignOutButton />
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}