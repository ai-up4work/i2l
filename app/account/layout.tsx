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

const MOBILE_BOTTOM_NAV_H = 72

function AccountShell({
  children,
  headerHeight,
}: {
  children: React.ReactNode
  headerHeight: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const view = viewForPath(pathname)

  const [bannerOpen, setBannerOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [shopSheetOpen, setShopSheetOpen] = useState(false)
  // Mirrors shopSheetOpen's pattern above — the + button opens this
  // overlay in place instead of routing to a dedicated "addRequest" view,
  // so tapping it from Orders/Stores/etc. no longer loses that page.
  const [addRequestOpen, setAddRequestOpen] = useState(false)

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

  return (
    <main
      className="flex min-h-0 flex-1 overflow-hidden bg-parchment pt-0"
      style={{
        ['--account-header-h' as string]: `${headerHeight}px`,
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
        <WelcomeBanner open={bannerOpen} onDismiss={() => setBannerOpen(false)} />
        <Topbar view={view} onBack={handleBack} onMenuClick={() => setSidebarOpen(true)} />
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
        link={link}
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
          onSelectVariant={(_, option) => {
            if (option.url) selectVariant(option.url)
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
  )
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  // Measures Header's real rendered height live — covers font-load shifts,
  // future edits inside Header/AirmailStripe, browser zoom, etc. — instead
  // of trusting a hand-maintained constant.
  const { ref: headerRef, height: headerHeight } = useElementHeight<HTMLDivElement>()

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <DashboardProvider>
        <div ref={headerRef} className="hidden lg:block lg:mt-15">
          <Header />
        </div>
        <AccountShell headerHeight={headerHeight}>{children}</AccountShell>
      </DashboardProvider>
    </div>
  )
}