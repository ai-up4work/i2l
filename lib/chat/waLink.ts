// lib/chat/waLink.ts
//
// Pulled out of contexts/ChatContext.tsx on purpose: these two functions
// are pure (no hooks, no React, no server-only secrets) and needed to be
// importable from a Server Component (app/(public)/contact/page.tsx).
// Next.js enforces the 'use client' boundary at the MODULE level, not
// just for React components — importing any export, function included,
// from a 'use client' file into a Server Component throws
// "Attempted to call X() from the server but X is on the client", which
// is exactly what happened when the contact page first tried to import
// buildWhatsAppLink directly from ChatContext.tsx. Living here instead
// (no 'use client', no server-only env vars — contrast with
// lib/chat/whatsapp.ts, which holds WHATSAPP_ACCESS_TOKEN and must
// NEVER be imported client-side) makes both functions safe to import
// from either kind of component. ChatContext.tsx re-exports both below
// so its own existing importers (the admin chat page's deriveHandle
// import, ChatContext's own internal use of both) don't need to change.

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '94770774828' // fallback for dev

export function deriveHandle(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? name
  return `@${first.toLowerCase()}`
}

export function buildWhatsAppLink(handle: string | null, prefillText?: string) {
  const text =
    prefillText ??
    (handle
      ? `Hi, this is ${handle} continuing from the WishDrop chat.`
      : `Hi, I'd like to talk to WishDrop support.`)
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}