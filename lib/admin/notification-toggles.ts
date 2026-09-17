// lib/admin/notification-toggles.ts
//
// Single source of truth for what a staff member can toggle at
// /admin/settings/notifications (and the two shortcuts shown on
// /admin/settings/profile, per the route spec's "notification
// preference shortcuts" line). Keying off `id` here is also the exact
// key stored in staff_accounts.notification_prefs — see
// data/wishdrop-staff-notification-prefs.sql.

export type NotificationToggle = {
  id: string
  label: string
  description: string
}

export const NOTIFICATION_TOGGLES: NotificationToggle[] = [
  {
    id: 'new_request',
    label: 'New customer request',
    description: 'A customer submits a new item request that needs a quote or confirmation.',
  },
  {
    id: 'order_delayed',
    label: 'Order delayed',
    description: 'An order sits in the same pipeline stage past its expected time.',
  },
  {
    id: 'chat_message',
    label: 'New chat message',
    description: 'A customer sends a message on a thread you can see.',
  },
  {
    id: 'qc_flagged',
    label: 'QC issue flagged',
    description: 'An item fails quality check and needs a decision.',
  },
  {
    id: 'purchase_issue',
    label: 'Purchase issue',
    description: 'A seller order can\u2019t be completed as planned (price change, out of stock, etc.).',
  },
]

/** IDs to surface as quick shortcuts on the Profile page — the two most
 * time-sensitive ones, not the full list (see that page for why). */
export const PROFILE_SHORTCUT_TOGGLE_IDS = ['new_request', 'chat_message']