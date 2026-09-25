# WishDrop — Push notifications

Two things send push notifications:

1. **Staff chat messages.** Every message staff send to a customer — from
   the admin inbox, a request/order/QC drawer, or an automatic message
   modal — is pushed to that customer's devices. Tapping it opens
   *My Messages*.
2. **Broadcasts.** Managers send one message to all customers or a group
   from **Admin → Manager → Broadcasts** (`/admin/broadcasts`).

Customers turn notifications on per device, from the prompt on
*My Messages* or in **My Profile → Notifications**.

## One-time setup

### 1. Keys and secrets (Vercel → Settings → Environment Variables)

Generate a key pair once (locally):

```bash
npm run push:keys
```

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | "Public Key" from the command above |
| `VAPID_PRIVATE_KEY` | "Private Key" — keep secret, never commit |
| `VAPID_SUBJECT` | `mailto:` + a real inbox, e.g. `mailto:support@wishdrop.shop` |
| `PUSH_WEBHOOK_SECRET` | Any long random string, e.g. output of `openssl rand -hex 32` |

Set them for **Production** (and Preview if you test there), then redeploy.
Don't change the VAPID keys later: every existing device subscription is
tied to them and would stop receiving until customers turn notifications
on again.

### 2. Database (Supabase → SQL editor)

Run `data/wishdrop-push-notifications.sql`, then store two Vault secrets
(the second must equal `PUSH_WEBHOOK_SECRET`):

```sql
select vault.create_secret('https://www.wishdrop.shop', 'wishdrop_app_url');
select vault.create_secret('<same value as PUSH_WEBHOOK_SECRET>', 'wishdrop_push_webhook_secret');
```

If `pg_net` isn't enabled yet: `create extension if not exists pg_net;`

Until both secrets exist, chat messages still work normally — they just
aren't pushed.

### 3. Lockfile

This adds the `web-push` package. The project has both `package-lock.json`
(updated) and `pnpm-lock.yaml` (not updated). If Vercel installs with
pnpm, run `pnpm install` locally and commit `pnpm-lock.yaml`, or the
deploy fails on an out-of-date lockfile.

### 4. Badge icon

`public/icons/badge-96.png` is the small icon Android shows in the status
bar. Replace the placeholder with your mark in **white on a transparent
background** (Android paints it as a silhouette).

## How it works

### Chat messages

```
staff sends message ─► chat_messages row (sender ≠ customer)
                          │  database trigger (pg_net, async)
                          ▼
                 POST /api/push/chat-message   (checks x-push-secret)
                          │  looks up thread → customer
                          ▼
                 web push to each of the customer's devices
```

- The trigger runs after the message is saved and never blocks or fails
  the send, even if push is down.
- Several replies in one conversation replace each other on the lock
  screen instead of stacking.
- If a customer is chatting over WhatsApp, they get both the WhatsApp
  message and the push.

### Broadcasts

- **Announcement** — service news (delays, closures, new stores). Goes to
  everyone in the audience.
- **Offer** — deals and codes. Skips customers who turned *Offers and
  promotions* off.
- **Audiences** — all customers; with an order in progress (ordered,
  quality check, shipped); who have ordered; who haven't ordered; or
  specific customers (search by name, email, phone or `WD-` order number).
  Staff accounts are always excluded.
- Every recipient gets an entry in their in-app notification bell, so
  customers without push still see it. Customers with push on also get it
  on their phone/computer.
- **Send test to my devices** pushes only to you. For it to work, sign in
  to the customer site with your staff email on your phone or browser and
  turn notifications on in My Profile → Notifications.
- The same title + message can't be sent twice within 2 minutes (guards
  against double clicks). History and delivery counts are shown on the
  page and stored in `push_broadcasts`.
- Only **Manager** and **Super Admin** can open the page or call its API.

### Devices

- Each browser/phone is registered separately (`push_subscriptions`).
- Signing out unlinks that device; signing back in re-links it (only if
  notifications were already allowed there — it never prompts by itself).
- Devices the browser has retired (permission revoked, app deleted) are
  removed automatically on the next send; a device failing 5 times in a
  row is removed too.

## Where it works

| Platform | Push |
|---|---|
| Android — Chrome, Samsung Internet, Edge, Firefox | Yes |
| Windows / Mac / Linux — Chrome, Edge, Firefox | Yes |
| Mac — Safari | Yes (recent macOS) |
| iPhone / iPad | Only after **Add to Home Screen** (iOS 16.4+), opened from the Home Screen icon. The settings page and the prompt explain this and link to the install steps. |

Notifications arrive even when WishDrop is closed, as long as the browser
(or installed app) is allowed to run in the background — some Android
battery savers delay them.

## Testing after deploy

1. On your phone (Android Chrome, or installed app on iPhone), sign in as a
   customer, open *My Messages*, tap **Turn on** and allow.
2. From the admin inbox, reply to that customer. The phone should buzz
   within a few seconds; tapping opens *My Messages*.
3. On `/admin/broadcasts`, write a message and **Send test to my devices**
   (with your staff login set up as in "Broadcasts" above).
4. Send a real broadcast to *Specific customers* → yourself, and check the
   bell icon as well as the push.

## Troubleshooting

**Chat pushes don't arrive.** In Supabase:

```sql
select id, status_code, content::text, created
from net._http_response order by created desc limit 20;
```

| You see | Means |
|---|---|
| No rows at all | Trigger not firing: Vault secrets missing, or the SQL file wasn't run |
| `403` | `PUSH_WEBHOOK_SECRET` on Vercel ≠ Vault's `wishdrop_push_webhook_secret` |
| `200` with `"devices":0` | That customer has no device with notifications on |
| `200` with `"sent":0,"failed":1` | Check Vercel function logs for `[push] send failed` |
| Timeouts / connection errors | `wishdrop_app_url` is wrong or unreachable |

**"Push isn't set up yet"** on the Broadcasts page — the VAPID variables
are missing on Vercel, or the site wasn't redeployed after adding them.

**My Profile says "Notifications aren't available yet"** — the site was built
without `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (it's baked in at build time; add it
and redeploy).

**Nothing works on `localhost`** — the service worker only runs in
production builds. Use `npm run build && npm start`, or set
`NEXT_PUBLIC_ENABLE_SW_IN_DEV=true` in `.env.local`.

## Files

| File | Purpose |
|---|---|
| `data/wishdrop-push-notifications.sql` | Tables, `profiles.push_offers`, chat trigger |
| `lib/push/server.ts` | Sends pushes (server only; holds the private key) |
| `lib/push/audience.ts` | Broadcast audiences and how they're resolved |
| `app/api/push/chat-message/route.ts` | Called by the trigger for each staff message |
| `app/api/push/subscribe/route.ts` | Register / unregister a device |
| `app/api/push/preferences/route.ts` | Customer's offers on/off |
| `app/api/admin/push/broadcast/route.ts` | Broadcast preview, test, send, history |
| `app/api/admin/push/customers/route.ts` | Customer search for specific-customer broadcasts |
| `app/admin/(protected)/(manager)/broadcasts/page.tsx` | Admin Broadcasts page |
| `lib/pwa/push.ts` | Browser side: permission, subscribe, status hook |
| `components/pwa/PushOptIn.tsx` | "Get notified when we reply" prompt on My Messages |
| `components/pwa/NotificationSettings.tsx` | Notifications section on My Profile (`/account/profile`) |
| `components/pwa/PushSync.tsx` | Re-links a device when a customer signs in |
| `public/sw.js` | `push`, `notificationclick`, `pushsubscriptionchange` handlers |

## Other changes in this update

- **Security:** `/api/whatsapp/relay-outbound` now requires an active staff
  session. Before, anyone who obtained a chat thread id could make the
  business WhatsApp number send that customer a message.
- **Toggle switch fix:** `components/admin/Toggleswitch.tsx` — the knob
  wasn't anchored, so it sat off-centre (off) or overflowed (on). This
  also fixes the admin *Settings → Notifications* page.
