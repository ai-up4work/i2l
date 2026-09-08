// lib/chat/whatsapp.ts
//
// Minimal helper for sending messages through Meta's WhatsApp Cloud API.
//
// Requires two env vars:
//   WHATSAPP_ACCESS_TOKEN     – permanent System User token
//                                (whatsapp_business_messaging scope)
//   WHATSAPP_PHONE_NUMBER_ID  – the "Phone number ID" from WhatsApp Manager
//                                (NOT the phone number itself — it's a
//                                separate numeric ID Meta assigns)

const GRAPH_API_VERSION = 'v21.0'

function graphUrl(path: string) {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`
}

/**
 * Send a free-form text reply. Only allowed inside an open 24-hour
 * customer service window (i.e. the customer messaged you within the
 * last 24 hours). Outside that window, Meta rejects this — you must
 * use sendTemplateMessage() instead for anything business-initiated.
 */
export async function sendTextMessage(toE164: string, body: string) {
  const res = await fetch(graphUrl(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toE164, // e.g. "94771234567" — digits only, no leading '+'
      type: 'text',
      text: { body },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`WhatsApp text send failed: ${res.status} ${JSON.stringify(err)}`)
  }
  return res.json()
}

/**
 * Send an approved template message. Required for any business-initiated
 * message — e.g. "your quote is ready" or "your order has shipped" — sent
 * when the customer hasn't messaged you in the last 24h. The template
 * name, language, and parameter count/order must exactly match what you
 * registered and got approved in WhatsApp Manager.
 */
export async function sendTemplateMessage(
  toE164: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[] = []
) {
  const res = await fetch(graphUrl(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toE164,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode }, // e.g. "en_US"
        components: bodyParams.length
          ? [
              {
                type: 'body',
                parameters: bodyParams.map((text) => ({ type: 'text', text })),
              },
            ]
          : undefined,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`WhatsApp template send failed: ${res.status} ${JSON.stringify(err)}`)
  }
  return res.json()
}