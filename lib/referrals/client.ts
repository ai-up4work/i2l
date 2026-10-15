// lib/referrals/client.ts
//
// Browser side of referrals: remember a code from /auth/signup?ref=… and,
// once the customer is signed in, ask the server to link them to the
// friend who referred them. The server (lib/referrals/server.ts) decides
// everything — this only passes the code along. /r/<code> links also set
// a cookie the server reads directly, so this works without the stored
// code too.
'use client'

const KEY = 'wishdrop:pendingReferral'
const DONE_KEY = 'wishdrop:referralChecked'

export function rememberReferralCode(code: string | null | undefined): void {
  if (!code) return
  try {
    window.localStorage.setItem(KEY, code.trim().slice(0, 20))
  } catch {
    /* storage blocked — the cookie from /r/<code> still works */
  }
}

/** Call when a signed-in customer opens the account area. Runs at most
 *  once per browser session. */
export async function attachPendingReferral(): Promise<void> {
  let code: string | null = null
  try {
    if (window.sessionStorage.getItem(DONE_KEY)) return
    code = window.localStorage.getItem(KEY)
  } catch {
    /* storage blocked — still try the cookie */
  }
  try {
    const res = await fetch('/api/referrals/attach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(code ? { code } : {}),
    })
    if (res.ok) {
      try {
        window.localStorage.removeItem(KEY)
        window.sessionStorage.setItem(DONE_KEY, '1')
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* network — try again next visit */
  }
}
