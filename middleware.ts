// middleware.ts (project root)
//
// Runs on every matched request. Two jobs:
//
// 1. Keep the Supabase auth cookie fresh (updateSession) — without this,
//    a session can silently expire mid-visit and server components will
//    see a stale/missing user.
//
// 2. Gate every protected area of the app BEFORE any page renders.
//    Before this, route protection was inconsistent and in places
//    entirely absent:
//      - app/account/layout.tsx is a Client Component that only reads
//        useAuth() — no server-side check at all, so /account/** pages
//        relied on each page individually remembering to check `user`
//        (some did, some didn't) — easy to bypass with a direct link,
//        and inconsistent by construction rather than by exception.
//      - app/admin/layout.tsx had no auth check whatsoever. A real
//        staff-login flow exists (/admin/login -> /api/admin/auth/me,
//        which checks staff_accounts) but it was only ever enforced AT
//        the login page — nothing stopped a direct request to any
//        /admin/** URL from reaching the full console, logged in or not.
//      - There used to be a separate app/super-admin/layout.tsx with a
//        literal `// TODO: role/auth guard for /super-admin root` doing
//        nothing. That whole top-level route is gone now — those pages
//        moved to app/admin/(protected)/super-admin/** so they share
//        the real admin shell (sidebar, RoleSwitcher) instead of a
//        second, disconnected area with no navigation of its own. The
//        role check that TODO never got now lives below, as the one
//        extra condition on top of the normal /admin/** staff check.
//      - app/seller/(dashboard)/layout.tsx was the one area already
//        doing this right (a real server-side getCurrentSeller() check
//        with a redirect) — this middleware adds the same protection
//        one layer earlier. (The old app/(seller)/catalogue pages that
//        used to be served at /catalogue were really the ADMIN catalogue
//        overview — they now live at /admin/catalogues behind the staff
//        check, so /catalogue is no longer a seller path.)
//      - app/demo/** (scraper-qa, chat, discount, discount-customizer,
//        loyalty, quote) had no protection at all — anyone with the
//        URL could open internal QA/prototype tools, including
//        scraper-qa's real scraping pipeline and raw diagnostics. Now
//        restricted to role === 'super_admin', the same bar as
//        /admin/super-admin/**.
//
// This is deliberately a single checkpoint that runs for every request
// under a protected path, present and future — a new page added later
// under /admin or /account is protected automatically, rather than
// depending on whoever writes it to remember an auth check.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { updateSession } from '@/lib/supabase/middleware'
import { DASHBOARD_HREF } from '@/lib/admin/dashboard-routes'
import type { Role } from '@/types/admin'

// A separate, minimal service-role client rather than importing
// lib/supabase/server.ts's createServiceRoleClient — that file also
// exports a cookie-bound client built on next/headers' cookies(), which
// isn't available in the Edge Middleware runtime. Importing the file at
// all would pull that in. This client only ever runs the one read below
// and never touches cookies, so it's safe here.
function createStaffLookupClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Mirrors /api/admin/auth/me's own lookup exactly (user_id match, email
// fallback, deactivated check) — that route is the app's one existing,
// already-correct source of truth for "is this a real, active staff
// account", so this reuses its logic rather than inventing a second
// version that could drift out of sync with it. Runs with the service
// role because staff_accounts' RLS doesn't allow a plain user to read
// their own row here (see that route's own comment on why it needs
// createServiceRoleClient rather than the normal per-user client).
async function getStaffRole(userId: string, email: string | undefined): Promise<Role | null> {
  const admin = createStaffLookupClient()
  let { data: staff } = await admin.from('staff_accounts').select('role, status, user_id').eq('user_id', userId).maybeSingle()

  if (!staff && email) {
    const fallback = await admin.from('staff_accounts').select('role, status, user_id').eq('email', email).maybeSingle()
    staff = fallback.data
  }

  if (!staff || staff.status !== 'active') return null
  return staff.role as Role
}

function redirectTo(request: NextRequest, path: string, preserveReturnTo = false) {
  const url = request.nextUrl.clone()
  const target = new URL(path, url.origin)
  if (preserveReturnTo) {
    target.searchParams.set('redirect', url.pathname + url.search)
  }
  return NextResponse.redirect(target)
}

const SELLER_PROTECTED_PREFIXES = ['/seller']
const SELLER_PUBLIC_PATHS = ['/seller/login']

const ADMIN_PUBLIC_PATHS = ['/admin/login', '/admin/register', '/admin/set-password', '/admin/invite']

export async function middleware(request: NextRequest) {
  const { supabaseResponse, supabase, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  // ---- /account/** — any authenticated Supabase user (customer) ----
  if (pathname.startsWith('/account')) {
    if (!user) {
      return redirectTo(request, '/auth/login', true)
    }
    return supabaseResponse
  }

  // ---- /demo/** — internal QA/prototype tools, super_admin only ----
  //
  // app/demo/** (scraper-qa, chat, discount, discount-customizer,
  // loyalty, quote) are internal build/QA tools, not anything a
  // customer, seller, or regular staff member should be able to open —
  // scraper-qa in particular calls the real scraping pipeline directly
  // and shows raw diagnostic detail (see its own comments) that has no
  // business being customer-facing. There was no protection on these
  // at all before this.
  //
  // Redirect targets follow the same "send them somewhere real for
  // THEM" rule as /admin/** below: not logged in -> the login for
  // whichever space they were trying to reach; logged in but not
  // privileged enough -> their own home, never a login screen for
  // credentials they don't have.
  if (pathname.startsWith('/demo')) {
    if (!user) {
      return redirectTo(request, '/admin/login', true)
    }
    const role = await getStaffRole(user.id, user.email)
    if (role === 'super_admin') {
      return supabaseResponse
    }
    // Staff, but not super_admin — their own dashboard, not a login
    // screen they've already correctly passed.
    if (role) {
      return redirectTo(request, DASHBOARD_HREF[role], false)
    }
    // Logged in, but not staff at all (a customer, or a seller with no
    // staff row) — nothing under /demo is theirs to reach, and an
    // admin login prompt would be a dead end for someone who was never
    // going to have staff credentials. Their own account is the one
    // place that's actually real for them.
    return redirectTo(request, '/account', false)
  }

  // ---- /admin/** — any active staff_accounts row; /admin/super-admin/**
  // specifically needs role === 'super_admin' on top of that ----
  //
  // There's no separate /super-admin top-level route anymore — those
  // pages now live at /admin/super-admin/** so they render inside the
  // same shell (sidebar, RoleSwitcher header) as the rest of the
  // console instead of a second, unstyled, nav-less area. Folding them
  // in here means both checks share one code path: every /admin/**
  // request first proves it's SOME active staff member, and only the
  // super-admin subtree adds the stricter role check on top.
  //
  // Redirect targets, by who's asking:
  //   - Not logged in at all -> /admin/login. This is admin space; the
  //     admin login is the real "sign in" for it, the same way
  //     /auth/login is for /account.
  //   - Logged in, but resolves to no staff role at all (a plain
  //     customer, or a seller account with no staff row) -> their own
  //     /account, not /admin/login. They're not going to have staff
  //     credentials to enter there, so a login prompt is a dead end;
  //     bouncing them to something real for them is the useful outcome.
  //   - Logged in as staff, but below the level this specific path
  //     needs (a manager/sales/warehouse account hitting
  //     /admin/super-admin/**) -> their OWN dashboard
  //     (DASHBOARD_HREF[role]), not a login screen they've already
  //     correctly passed.
  //   - super_admin -> through, unconditionally, everywhere under /admin.
  if (pathname.startsWith('/admin') && !ADMIN_PUBLIC_PATHS.some((p) => pathname === p)) {
    if (!user) {
      return redirectTo(request, '/admin/login', true)
    }
    const role = await getStaffRole(user.id, user.email)
    if (!role) {
      return redirectTo(request, '/account', false)
    }
    if (pathname.startsWith('/admin/super-admin') && role !== 'super_admin') {
      return redirectTo(request, DASHBOARD_HREF[role], false)
    }
    return supabaseResponse
  }

  // ---- /seller/** and the old /catalogue routes — sellers.owner_user_id ----
  //
  // Same "somewhere real for them" rule as above: not logged in -> the
  // seller login; logged in but not linked to a seller row -> their own
  // dashboard if they're staff, or their own /account if they're a
  // plain customer, rather than a seller login prompt they were never
  // going to be able to pass.
  if (
    SELLER_PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !SELLER_PUBLIC_PATHS.some((p) => pathname === p)
  ) {
    if (!user) {
      return redirectTo(request, '/seller/login', true)
    }
    // Plain per-user client (not service role) — sellers' own RLS
    // already permits a user to read their own row via owner_user_id,
    // same as lib/supabase/seller-auth.ts's getCurrentSeller(), which
    // this mirrors.
    const { data: seller } = await supabase
      .from('sellers')
      .select('id')
      .eq('owner_user_id', user.id)
      .maybeSingle()
    if (seller) {
      return supabaseResponse
    }
    const role = await getStaffRole(user.id, user.email)
    if (role) {
      return redirectTo(request, DASHBOARD_HREF[role], false)
    }
    return redirectTo(request, '/account', false)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Skip static assets and image optimization files — no auth-relevant
     * work happens for those, and running the session refresh (and, for
     * protected paths, an extra staff/seller lookup) on every
     * font/image request would be pure overhead.
     *
     * Also skips the SEO/PWA files (service worker, manifest, robots,
     * sitemap, icons) — they're public and cacheable, and the service
     * worker in particular must not be delayed by a session round-trip.
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|icons/|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)',
  ],
}