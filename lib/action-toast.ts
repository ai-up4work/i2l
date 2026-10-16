// lib/action-toast.ts
//
// Tiny event bus for the "Added to bag · View bag" confirmation
// (components/shared/ActionToast.tsx). The cart and wishlist contexts call
// showActionToast() whenever something is added, so every "Add" button on
// the site confirms the same way without each one wiring its own message.

export type ActionToastDetail = {
  kind: 'bag' | 'wishlist'
  title: string
  image?: string | null
  /** e.g. "Colour: Black" */
  detail?: string
}

export const ACTION_TOAST_EVENT = 'wishdrop:action-toast'

export function showActionToast(detail: ActionToastDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ActionToastDetail>(ACTION_TOAST_EVENT, { detail }))
}
