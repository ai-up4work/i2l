// lib/chat/relay-client.ts
//
// Fire-and-forget: tells the server to relay a just-sent staff message
// out via WhatsApp, if (and only if) that thread is currently
// WhatsApp-active — see app/api/whatsapp/relay-outbound/route.ts for
// the actual decision logic and the Cloud API call. Safe to call from
// any client component: this file never touches WHATSAPP_ACCESS_TOKEN
// or any other server secret, it only makes a plain fetch to a server
// route that does.
//
// Errors are swallowed on purpose — a failed relay attempt shouldn't
// surface as a failure of the (already-succeeded) in-app send that
// triggered it.
export function triggerWhatsAppRelay(threadId: string, text: string) {
  if (!text.trim()) return
  fetch('/api/whatsapp/relay-outbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, text }),
  }).catch((err) => {
    console.error('[whatsapp relay] trigger failed', err)
  })
}