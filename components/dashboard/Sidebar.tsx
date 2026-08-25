'use client'

import BrandMark from '../shared/BrandMark'
import { navGroups } from './data'

import type { View } from './types'

type SidebarProps = {
  view: View
  onNavigate: (view: View) => void
  onLogoClick: () => void
}

// Desktop-only — on mobile, MobileBottomNav.tsx + OrdersHubPage/AccountHubPage
// take over navigation entirely, so this never needs to slide in/out.

export default function Sidebar({
  view,
  onNavigate,
  onLogoClick,
}: SidebarProps) {
  return (
    <aside className="hidden h-screen w-[300px] flex-none flex-col border-r border-ink/10 bg-paper lg:sticky lg:top-0 lg:flex">
      {/* Logo */}
      <div className="flex h-16 flex-none px-6">
        <BrandMark />
      </div>

      <nav
        className="nav-scroll flex-1 overflow-auto px-4 py-6"
        aria-label="Member navigation"
      >
        {navGroups.map((group) => (
          <div
            key={group.label || 'main'}
            className="mb-5 border-b border-ink/10 pb-5 last:mb-0 last:border-0 last:pb-0"
          >
            {group.label && (
              <h3 className="mb-3 px-3 font-bold text-[11px] uppercase tracking-[0.15em] text-muted">
                {group.label}
              </h3>
            )}

            <div className="flex flex-col gap-1">
              {group.items.map(({ label, icon: Icon, view: itemView }) => {
                const isActive = view === itemView

                return (
                  <button
                    key={label}
                    onClick={() => onNavigate(itemView)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group relative flex items-center gap-3.5 rounded-2xl px-3 py-2.5 text-left text-[15px] font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-gold-soft text-ink shadow-[0_6px_16px_rgba(235,91,24,0.08)]'
                        : 'text-ink/70 hover:bg-ink/[0.035] hover:text-ink'
                    }`}
                  >
                    {/* Icon */}
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-xl border transition-all duration-200 ${
                        isActive
                          ? 'border-rust/25 bg-paper text-rust shadow-sm'
                          : 'border-ink/10 bg-paper/70 text-ink/45 group-hover:border-rust/20 group-hover:text-rust'
                      }`}
                      aria-hidden="true"
                    >
                      <Icon size={18} strokeWidth={1.8} />
                    </span>

                    {/* Label — turns rust when active */}
                    <span
                      className={`flex-1 transition-colors duration-200 ${
                        isActive ? 'text-rust' : ''
                      }`}
                    >
                      {label}
                    </span>

                    {/* Active indicator */}
                    {isActive && (
                      <span className="absolute right-0 h-6 w-1 rounded-l-full bg-rust" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Download App */}
      <div className="flex items-center gap-3 border-t border-ink/10 px-6 py-6 text-sm font-semibold text-ink">
        Download App

        <span className="ml-auto flex items-center gap-2.5">
          <i
            className="sidebar__icon sidebar__icon--downloadApp_IOS_icon"
            aria-label="iOS"
          />

          <i
            className="sidebar__icon sidebar__icon--downloadApp_Android_icon"
            aria-label="Android"
          />
        </span>
      </div>
    </aside>
  )
}