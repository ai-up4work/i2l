// app/account/layout.tsx (or wherever this layout lives)
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { CircleHelp } from 'lucide-react'
import ItemInfoModal from '@/components/dashboard/ItemInfoModal'
import Sidebar from '@/components/dashboard/Sidebar'
import Topbar from '@/components/dashboard/Topbar'
import MobileBottomNav from '@/components/dashboard/MobileBottomNav'
import AddRequestOverlay from '@/components/dashboard/AddRequestOverlay'
import WelcomeBanner from '@/components/dashboard/WelcomeBanner'
import { pathForView, viewForPath } from '@/components/dashboard/routes'
import type { View } from '@/components/dashboard/types'
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext'
import Header from '@/components/shared/Header'
import ShopBottomSheet from '@/components/stores/ShopBottomSheet'
import { useElementHeight } from '@/hooks/useElementHeight'
import { useIsMobile } from '@/hooks/useIsMobile'

const MOBILE_BOTTOM_NAV_H = 72

function AccountShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const view = viewForPath(pathname)
  const isMobile = useIsMobile() // true below lg (1024px), matching this layout's other breakpoints

  const {
    draft,
    setDraft,
    modalOpen,
    closeModal,
    saveItemInfo,
    lookupLoading,
    lookupError,
    autoFilled,
    scrapeResult,
    selectVariant,
    resetDraft,
    pastedLink: link,
    setPastedLink: setLink,
    startItemInfo: submitRequest,
  } = useDashboard()
  // TEMP GUARD: useDashboard doesn't actually export `link` under that
  // name (came through undefined), so AddRequestOverlay's
  // disabled={!link.trim()} was throwing. Remove this once the real
  // field names from DashboardContext are wired in above.
  const safeLink = link ?? ''

  // Desktop <Header> now lives here (moved down from the outer
  // AccountLayout component) so it can react to modalOpen — useDashboard
  // isn't reachable from a component that merely renders <DashboardProvider>,
  // only from one nested inside it.
  const { ref: headerRef, height: headerHeight } = useElementHeight<HTMLDivElement>()
  const { ref: topbarRef, height: topbarHeight } = useElementHeight<HTMLDivElement>()

  // Banner measured on its own now (previously merged into topbarHeight).
  // Kept in isolation because it's still its own independently-toggleable
  // element, even though — see the FIX note below — it's no longer shown
  // "floating over" the item overlay. When the modal is closed, its height
  // still needs to be tracked separately from Topbar/Header for the normal
  // (non-overlay) layout math elsewhere on the page.
  const { ref: bannerRef, height: bannerHeight } = useElementHeight<HTMLDivElement>()

  const [bannerOpen, setBannerOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [shopSheetOpen, setShopSheetOpen] = useState(false)
  // Mirrors shopSheetOpen's pattern above — the + button opens this
  // overlay in place instead of routing to a dedicated "addRequest" view,
  // so tapping it from Orders/Stores/etc. no longer loses that page.
  const [addRequestOpen, setAddRequestOpen] = useState(false)

  // True whenever ItemInfoModal is covering the screen. While true:
  //  - Header and Topbar are hidden outright (display:none via a class
  //    swap, NOT unmounted — see the className logic below — so their
  //    refs stay attached to the same node and useElementHeight keeps
  //    tracking them correctly once the modal closes again).
  //  - WelcomeBanner is ALSO hidden outright now (see bannerWrapperClass
  //    below), for the same reason: previously this only bumped its
  //    z-index to sit "above" the modal, but since the modal itself
  //    ignores --account-header-h at >=1024px (item-overlay-bounds
  //    forces top:0 there) while `main`'s desktop padding-top still
  //    reserved exactly one bannerHeight for it, the banner's real,
  //    fully-interactive box landed directly on top of the modal's own
  //    header row — including its close (X) button — and silently ate
  //    every click meant for the modal underneath. Hiding the banner
  //    outright while the modal is open removes both the visual overlap
  //    and the stolen clicks; it reappears exactly where it was as soon
  //    as the modal closes.
  const overlayActive = modalOpen

  // --account-header-h drives ItemInfoModal's top offset via CSS var
  // (see .item-overlay-bounds in ItemInfoModal), AND drives main's own
  // desktop padding-top (see the <style jsx> block below).
  //  - Modal open: now always 0. The banner is hidden outright while the
  //    modal is open (see bannerWrapperClass), so there's nothing left
  //    above the content to reserve space for — and this matches
  //    item-overlay-bounds, which also forces top:0 on desktop while the
  //    modal is open. Before this fix, this branch returned bannerHeight
  //    when the banner hadn't been dismissed yet, which desynced from
  //    the modal's own (space-agnostic) top:0 and was the root cause of
  //    the banner rendering inside/over the modal.
  //  - Modal closed: unchanged from before — Topbar height on mobile,
  //    Header height on desktop.
  const effectiveHeaderHeight = overlayActive
    ? 0
    : isMobile
      ? topbarHeight
      : headerHeight

  function handleNavigate(nextView: View) {
    if (nextView === 'addRequest') resetDraft()
    router.push(pathForView(nextView))
  }

  function handleOpenAddRequest() {
    resetDraft()
    setAddRequestOpen(true)
  }

  function handleAddRequestSubmit(event: React.FormEvent) {
    event.preventDefault()
    submitRequest(event)
    setAddRequestOpen(false)
  }

  function handleBack() {
    if (view === 'preview') {
      router.push(pathForView('addRequest'))
      return
    }
    router.push(pathForView('home'))
  }

  // Kept as plain conditionals (not template-string interpolation of
  // arbitrary values) so Tailwind's class scanner can see every literal
  // class name used here.
  const headerWrapperClass = overlayActive ? 'hidden' : 'hidden lg:block lg:mt-15'
  const topbarWrapperClass = overlayActive ? 'hidden' : 'sticky top-0 z-20 bg-parchment lg:static'
  // FIX: was `overlayActive ? 'relative z-40' : 'relative'` — that kept
  // the banner mounted, in normal flow, and pointer-events-enabled while
  // the modal was open, just visually promoted above it. Now it's hidden
  // outright while the modal is open, same treatment as Header/Topbar
  // above, so it can neither overlap the modal's UI nor steal its clicks.
  const bannerWrapperClass = overlayActive ? 'hidden' : 'relative'

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div ref={headerRef} className={headerWrapperClass}>
        <Header variant="account" />
      </div>

      <main
        className="flex min-h-0 flex-1 overflow-hidden bg-parchment pt-0"
        style={{
          ['--account-header-h' as string]: `${effectiveHeaderHeight}px`,
          ['--account-bottom-nav-h' as string]: `${MOBILE_BOTTOM_NAV_H}px`,
        }}
      >
        {/* Applied to BOTH flex children of <main> — Sidebar and the
            scrollable <section> — since padding-top on the flex container
            shifts every row-aligned child down equally. This is what keeps
            Sidebar's pinned "Personal Center" block, not just the main
            content column, clear of the fixed header above. */}
        <style jsx>{`
          @media (min-width: 1024px) {
            main {
              padding-top: var(--account-header-h);
            }
          }
        `}</style>

        <Sidebar
          view={view}
          onNavigate={handleNavigate}
          onLogoClick={() => router.push(pathForView('home'))}
          onSignOut={() => {
            /* existing sign-out handling */
          }}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        <section
          className="content-scroll min-w-0 lg:mt-1 flex-1 overflow-y-auto"
          style={{ paddingBottom: 'var(--account-bottom-nav-h)' }}
        >
          <div ref={bannerRef} className={bannerWrapperClass}>
            <WelcomeBanner
              open={bannerOpen}
              onDismiss={() => setBannerOpen(false)}
              collapse={isMobile}
            />
          </div>

          <div ref={topbarRef} className={topbarWrapperClass}>
            <Topbar view={view} onBack={handleBack} onMenuClick={() => setSidebarOpen(true)} />
          </div>

          {children}
        </section>

        <MobileBottomNav
          view={view}
          onNavigate={handleNavigate}
          onOpenShop={() => setShopSheetOpen(true)}
          onOpenAddRequest={handleOpenAddRequest}
          isAddRequestOpen={addRequestOpen}
        />
        <ShopBottomSheet open={shopSheetOpen} onClose={() => setShopSheetOpen(false)} />
        <AddRequestOverlay
          open={addRequestOpen}
          onClose={() => setAddRequestOpen(false)}
          link={safeLink}
          setLink={setLink}
          onSubmit={handleAddRequestSubmit}
        />

        {modalOpen && (
          <ItemInfoModal
            open={modalOpen}
            result={scrapeResult}
            qty={draft.qty}
            onQtyChange={(qty) => setDraft({ ...draft, qty })}
            onClose={closeModal}
            onRequestItem={() => saveItemInfo({ preventDefault: () => {} } as React.FormEvent)}
            loading={lookupLoading}
            onSelectVariant={(url) => {
              if (url) selectVariant(url)
            }}
          />
        )}

        <button
          aria-label="Open support chat"
          className="support-fab fixed right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-teal text-parchment shadow-lift transition-transform hover:scale-105 hover:bg-teal-deep"
          style={{ bottom: 'calc(var(--account-bottom-nav-h) + 1.5rem)' }}
        >
          <CircleHelp />
        </button>

        <style jsx global>{`
          .content-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(14, 140, 156, 0.25) transparent;
          }
          .content-scroll::-webkit-scrollbar {
            width: 8px;
          }
          .content-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .content-scroll::-webkit-scrollbar-thumb {
            background-color: rgba(14, 140, 156, 0.18);
            border-radius: 999px;
            border: 2px solid transparent;
            background-clip: padding-box;
            transition: background-color 0.2s ease;
          }
          .content-scroll:hover::-webkit-scrollbar-thumb {
            background-color: rgba(14, 140, 156, 0.32);
          }
          .content-scroll::-webkit-scrollbar-thumb:hover {
            background-color: rgba(14, 140, 156, 0.5);
          }
          @media (min-width: 1024px) {
            .support-fab {
              bottom: 1.5rem !important;
            }
          }
        `}</style>
      </main>
    </div>
  )
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <AccountShell>{children}</AccountShell>
    </DashboardProvider>
  )
}