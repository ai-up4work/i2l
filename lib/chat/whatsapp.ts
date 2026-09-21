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
 *
 * otpCode is separate from bodyParams on purpose: an AUTHENTICATION-
 * category template's body text is fixed by Meta ("<code> is your
 * verification code") and takes the code as its one body parameter same
 * as any other template — but if it also has a Copy Code button (which
 * Meta now requires for auth templates), that button needs the SAME
 * code again, as its own separate `button` component, or the button
 * doesn't know what to copy. A plain body-only template (order
 * confirmed, shipped, etc.) has no button at all, so this stays
 * optional rather than folded into bodyParams — most callers won't
 * pass it.
 */
export async function sendTemplateMessage(
  toE164: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[] = [],
  otpCode?: string,
) {
  const components: Record<string, unknown>[] = []
  if (bodyParams.length) {
    components.push({ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) })
  }
  if (otpCode) {
    // Meta's own docs confirm this exact shape: even though the button
    // is CREATED as otp_type "copy_code" in WhatsApp Manager, Meta
    // stores/sends it back as a "url"-subtype button — the code above
    // that creation-time detail is what the send-time API actually
    // expects, not "copy_code" itself.
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: otpCode }],
    })
  }

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
        components: components.length ? components : undefined,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`WhatsApp template send failed: ${res.status} ${JSON.stringify(err)}`)
  }
  return res.json()
}