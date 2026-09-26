// app/admin/(protected)/(sales)/wishdrop-mall/page.tsx
//
// Old address. Wishdrop Mall moved to /admin/super-admin/wishdrop-mall
// (super admin only) — this keeps old bookmarks working. Non-super-admins
// are then bounced to their own dashboard by middleware.ts.
import { redirect } from 'next/navigation'

export default function OldWishdropMallRoute() {
  redirect('/admin/super-admin/wishdrop-mall')
}
