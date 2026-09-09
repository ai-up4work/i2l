'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { CircleHelp } from 'lucide-react'
import ItemInfoModal from '@/components/dashboard/ItemInfoModal'
import Sidebar from '@/components/dashboard/Sidebar'
import MobileBottomNav from '@/components/dashboard/MobileBottomNav'
import AddRequestOverlay from '@/components/dashboard/AddRequestOverlay'
import WelcomeBanner from '@/components/dashboard/WelcomeBanner'
import { pathForView, viewForPath } from '@/components/dashboard/routes'
import type { View } from '@/components/dashboard/types'
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext'
import { useAuth } from '@/contexts/AuthContext'
import Header, { HEADER_BAR_HEIGHT_MOBILE, HEADER_BAR_HEIGHT_DESKTOP } from '@/components/shared/Header'
import ShopBottomSheet from '@/components/stores/ShopBottomSheet'
import { useElementHeight } from '@/hooks/useElementHeight'
import { useIsMobile } from '@/hooks/useIsMobile'

const MOBILE_BOTTOM_NAV_H = 72

function AccountShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const view = viewForPath(pathname)
  const isMobile = useIsMobile()

  const { user } = useAuth()
  const isPhoneVerified = !!user?.phoneVerified

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
  const safeLink = link ?? ''

  // Header's rendered height differs by breakpoint — mobile shows the
  // full OUTER_H bar, desktop's content sits at INNER_H. Header.tsx
  // exports two constants (HEADER_BAR_HEIGHT_MOBILE / _DESKTOP) and we
  // pick between them with Tailwind's responsive classes on <main>
  // below (mobile-first: base value applies <1024px, lg: overrides it
  // >=1024px), since there's no SSR-safe "isMobile" check here without
  // a hydration flash.
  const { ref: bannerRef, height: bannerHeight } = useElementHeight<HTMLDivElement>()

  // Banner visibility depends on verification status, not just a
  // boolean toggle. `bannerDismissed` only matters if the user is still
  // unverified — dismissing has no effect once verified. This is plain
  // component state, so dismissing is session-only: reloading the page
  // while still unverified will show it again.
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const bannerOpen = !isPhoneVerified && !bannerDismissed

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [shopSheetOpen, setShopSheetOpen] = useState(false)
  const [addRequestOpen, setAddRequestOpen] = useState(false)

  // True whenever ItemInfoModal is covering the screen. While true:
  //  - Header is hidden outright (unmounted below).
  //  - WelcomeBanner, if still open, is pulled OUT of normal flow into
  //    a fixed strip pinned to the very top of the viewport, above the
  //    modal (see bannerWrapperClass below).
  const overlayActive = modalOpen

  // FIX: mobile-only auto-collapse. On mobile, once the banner has
  // nothing to show (verified/dismissed, and no overlay), its wrapper
  // shrinks to 0 so page content slides up to fill the gap. On desktop,
  // the banner keeps its old behavior — reserved space, plain fade —
  // since that's the intended look there.
  const bannerCollapse = overlayActive || (isMobile && !bannerOpen)

  // Drive both <main>'s padding (via the Tailwind classes below) and
  // ItemInfoModal's top offset.
  //  - Modal open: the banner's live height if it's still open, else 0
  //    — same value on both breakpoints, since the banner itself
  //    doesn't change height by screen size.
  //  - Modal closed: Header's known constant height for that breakpoint.
  const effectiveHeaderHeightMobile = overlayActive
    ? bannerOpen
      ? bannerHeight
      : 0
    : HEADER_BAR_HEIGHT_MOBILE

  const effectiveHeaderHeightDesktop = overlayActive
    ? bannerOpen
      ? bannerHeight
      : 0
    : HEADER_BAR_HEIGHT_DESKTOP

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

  // Fixed positioning removes the banner from flow entirely and pins it
  // to the true viewport top, above the modal (z-30, matching Header's
  // own z-index) and its backdrop, so it visibly floats above the
  // overlay. Once the modal closes, it drops back to `relative` and
  // resumes its normal spot above the content column.
  //
  // `mb-4` in the relative case keeps the banner from sitting flush
  // against the page content below it while it's actually showing.
  //
  // Once bannerOpen is false, this wrapper also gets `pointer-events-
  // none` directly (overlay case only), so a lingering collapsed-but-
  // still-live hit target can't sit on top of the modal's own close
  // button.
  const bannerWrapperClass = overlayActive
    ? `fixed inset-x-0 top-0 z-50 ${bannerOpen ? '' : 'pointer-events-none'}`
    : `relative ${bannerOpen ? 'mb-4' : 'mt-8 lg:mt-0'}`

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {!overlayActive && (
        <Header
          variant="account"
          view={view}
          onBack={handleBack}
          onMenuClick={() => setSidebarOpen(true)}
        />
      )}

      <main
        className="flex min-h-0 flex-1 overflow-hidden bg-parchment pt-[var(--account-header-h-mobile)] lg:pt-[var(--account-header-h-desktop)]"
        style={{
          ['--account-header-h-mobile' as string]: `${effectiveHeaderHeightMobile}px`,
          ['--account-header-h-desktop' as string]: `${effectiveHeaderHeightDesktop}px`,
          ['--account-bottom-nav-h' as string]: `${MOBILE_BOTTOM_NAV_H}px`,
        }}
      >
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
              onDismiss={() => setBannerDismissed(true)}
              collapse={bannerCollapse}
            />
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