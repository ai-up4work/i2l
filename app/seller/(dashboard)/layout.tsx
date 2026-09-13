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
      <header className="flex items-center justify-between border-b border-ink/10 bg-card px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Seller portal</p>
          <h1 className="font-display text-lg text-ink">{seller.name}</h1>
        </div>
        <nav className="flex items-center gap-4 text-sm font-semibold text-ink/60">
          <Link href="/seller/products" className="hover:text-ink">
            My products
          </Link>
          <SellerSignOutButton />
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}