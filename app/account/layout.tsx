'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import ItemInfoModal from '@/components/dashboard/ItemInfoModal'
import MobileBottomNav from '@/components/dashboard/MobileBottomNav'
import Sidebar from '@/components/dashboard/Sidebar'
import Topbar from '@/components/dashboard/Topbar'
import WelcomeBanner from '@/components/dashboard/WelcomeBanner'
import { pathForView, viewForPath } from '@/components/dashboard/routes'
import type { View } from '@/components/dashboard/types'
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext'
import AirmailStripe from '@/components/shared/AirmailStripe'
import AccountPageSkeleton from '@/components/dashboard/AccountPageSkeleton'

function AccountShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const view = viewForPath(pathname)

  const [bannerOpen, setBannerOpen] = useState(true)
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    setPageLoading(true)
    const timer = window.setTimeout(() => setPageLoading(false), 420)
    return () => window.clearTimeout(timer)
  }, [pathname])

  const { draft, setDraft, modalOpen, closeModal, saveItemInfo, lookupLoading, lookupError, autoFilled, resetDraft } =
    useDashboard()

  function handleNavigate(nextView: View) {
    if (nextView === 'addRequest') resetDraft()
    router.push(pathForView(nextView))
  }

  function handleBack() {
    // The item-info flow is the one place "back" means something other
    // than "go home" — from the preview page it should return to the
    // paste-a-link form rather than all the way out.
    if (view === 'preview') {
      router.push(pathForView('addRequest'))
      return
    }
    router.push(pathForView('home'))
  }

  return (
    <main className="flex h-screen overflow-hidden bg-paper">
      <Sidebar view={view} onNavigate={handleNavigate} onLogoClick={() => router.push(pathForView('home'))} />

      {/* pb-20 clears the fixed bottom nav on mobile; lg:pb-0 since the
          sidebar takes over navigation on desktop and there's no bar. */}
      <section className="content-scroll min-w-0 flex-1 overflow-y-auto pb-20 lg:pb-0">
        {bannerOpen && view === 'home' && <WelcomeBanner onDismiss={() => setBannerOpen(false)} />}
        <Topbar view={view} onBack={handleBack} />
        <div className="account-page-stage" key={pathname}>
          {children}
        </div>
        {pageLoading && (
          <div className="account-page-loading" aria-hidden="true">
            <AccountPageSkeleton />
          </div>
        )}
      </section>

      <MobileBottomNav view={view} onNavigate={handleNavigate} />

      {modalOpen && (
        <ItemInfoModal
          draft={draft}
          onChange={setDraft}
          onClose={closeModal}
          onSave={saveItemInfo}
          loading={lookupLoading}
          lookupError={lookupError}
          autoFilled={autoFilled}
        />
      )}

      <button
        aria-label="Open support chat"
        className="fixed bottom-24 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-rust text-paper shadow-lift transition-transform hover:scale-105 lg:bottom-6"
      >
        <CircleHelp />
      </button>

      <style jsx global>{`
        /* Firefox */
        .content-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(235, 91, 24, 0.25) transparent;
        }

        /* WebKit (Chrome, Safari, Edge) */
        .content-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .content-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .content-scroll::-webkit-scrollbar-thumb {
          background-color: rgba(235, 91, 24, 0.18);
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
          transition: background-color 0.2s ease;
        }
        .content-scroll:hover::-webkit-scrollbar-thumb {
          background-color: rgba(235, 91, 24, 0.32);
        }
        .content-scroll::-webkit-scrollbar-thumb:hover {
          background-color: rgba(235, 91, 24, 0.5);
        }
      `}</style>
    </main>
  )
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <AirmailStripe />
      <AccountShell>{children}</AccountShell>
    </DashboardProvider>
  )
}
