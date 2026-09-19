// app/admin/(protected)/settings/page.tsx
//
// The sidebar's "Settings" link (see components/admin/admin-sidebar.tsx)
// has always pointed at the bare /admin/settings path, but there was no
// page.tsx here — only the two subpages (profile, notifications)
// existed, both one-line stubs (`<div>Profile settings</div>`). This is
// the missing index: per the route spec
// (wishdrop-admin-route-specs.md), the only two real settings areas are
// self-service account details and personal notification preferences,
// so this is a short menu into those two, not a page with its own
// content to manage.
//
// RESTYLE (2026-09): header brought onto the same pattern as every
// other admin page — solid teal-deep icon box, font-semibold title.
// This page has nothing to put in a stats dl (it's a menu, not a data
// list), so the header is icon + title + subtitle only, same shape as
// the others minus the stat strip. Also added focus-visible rings to
// the link cards, which every other interactive element in the admin
// area has and these were missing, and brought the "Preview role"
// section heading in line with the small-caption section-header style
// used elsewhere (e.g. "Pipeline breakdown", "By site" on the
// dashboards) instead of its own one-off treatment.
'use client'

import Link from 'next/link'
import { Bell, ChevronRight, Settings as SettingsIcon, UserCircle } from 'lucide-react'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'
import { useAdminData } from '@/contexts/AdminDataContext'
import { RolePreviewOptions } from '@/components/admin/Rolepreviewmenu'

function SettingsLinkCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-2xl border border-ink/10 bg-card p-5 outline-none transition-colors hover:border-teal/30 hover:bg-teal/[0.03] focus-visible:ring-2 focus-visible:ring-teal/40"
    >
      <span className="grid size-10 flex-none place-items-center rounded-full bg-teal/10 text-teal-deep">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink/55">{description}</p>
      </div>
      <ChevronRight size={16} className="mt-2 flex-none text-ink/35" />
    </Link>
  )
}

export default function AdminSettingsPage() {
  const { staff, loading } = useCurrentStaff()
  const { currentUser } = useAdminData()

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-2xl px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
            <SettingsIcon size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold leading-tight">Settings</h1>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-ink/60">
              {loading ? (
                'Loading your account…'
              ) : staff ? (
                <>
                  Signed in as <span className="font-semibold text-ink/80">{staff.name}</span> ({staff.email})
                </>
              ) : (
                'Your account and notification preferences.'
              )}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <SettingsLinkCard
            href="/admin/settings/profile"
            icon={UserCircle}
            title="Profile"
            description="Your name, email, and password."
          />
          <SettingsLinkCard
            href="/admin/settings/notifications"
            icon={Bell}
            title="Notifications"
            description="Choose which alerts you get for new requests, delayed orders, and chat messages."
          />
        </div>

        {/* super_admin only — RolePreviewOptions itself renders nothing
            for anyone else, same component the sidebar's profile
            button opens as a popover. Shown here too as a more
            discoverable, permanent home for it rather than only the
            sidebar's menu. */}
        {currentUser.role === 'super_admin' && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-ink/70">Preview role</h2>
            <p className="mt-1 text-xs text-ink/45">
              See the console as a different role would. This never changes who you&apos;re signed in as.
            </p>
            <div className="mt-3 rounded-2xl border border-ink/10 bg-card p-2">
              <RolePreviewOptions />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}