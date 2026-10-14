'use client'

// components/shared/PublicMobileNav.tsx
//
// The account area's phone bottom bar (MobileBottomNav), on every public
// page too, so a shopper can always paste a link (centre +), open the
// stores sheet, or reach their orders and account from a phone.
// Hidden on product pages, which have their own "Add to bag" bar.

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import MobileBottomNav from '@/components/dashboard/MobileBottomNav'
import AddRequestOverlay from '@/components/dashboard/AddRequestOverlay'
import ShopBottomSheet from '@/components/stores/ShopBottomSheet'
import { pathForView } from '@/components/dashboard/routes'
import type { View } from '@/components/dashboard/types'

/** Pages that already have their own bar along the bottom on phones. */
export function hidesPublicMobileNav(pathname: string | null): boolean {
  return !!pathname && /^\/stores\/[^/]+\/product\//.test(pathname)
}

function viewForPublicPath(pathname: string | null): View {
  if (pathname === '/') return 'home'
  if (pathname === '/stores' || pathname?.startsWith('/stores/')) return 'affiliatedStores'
  // No tab is "current" on other public pages.
  return '__public' as View
}

export default function PublicMobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [shopOpen, setShopOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [link, setLink] = useState('')

  if (hidesPublicMobileNav(pathname)) return null

  function navigate(view: View) {
    if (view === 'home') return router.push('/')
    if (view === 'account') return router.push('/account')
    router.push(pathForView(view))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const url = link.trim()
    if (!url) return
    setLink('')
    // The account home picks up ?link= and starts the request
    // (app/account/page.tsx); signed-out shoppers sign in first and come back.
    router.push(`/account?link=${encodeURIComponent(url)}`)
  }

  return (
    <>
      {/* Room for the bar, so it never covers the end of the page. */}
      <div aria-hidden className="h-[calc(76px+env(safe-area-inset-bottom))] lg:hidden" />
      <MobileBottomNav
        view={viewForPublicPath(pathname)}
        onNavigate={navigate}
        onOpenShop={() => setShopOpen(true)}
        onOpenAddRequest={() => setAddOpen(true)}
        isAddRequestOpen={addOpen}
      />
      <ShopBottomSheet open={shopOpen} onClose={() => setShopOpen(false)} onAddRequest={() => setAddOpen(true)} />
      <AddRequestOverlay open={addOpen} onClose={() => setAddOpen(false)} link={link} setLink={setLink} onSubmit={submit} />
    </>
  )
}
