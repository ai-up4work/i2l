# WishDrop — WhatsApp number verification (staff-reviewed)

Customers verify their WhatsApp number by **sending us a WhatsApp
message**; staff confirm it in the admin panel. No Meta API, no templates,
no per-message cost. It replaces the old code-by-WhatsApp-template flow on
My Profile.

## Setup

1. Run `data/wishdrop-whatsapp-manual-verification.sql` in Supabase.
2. **Which number customers message.** By default they message
   `NEXT_PUBLIC_WHATSAPP_NUMBER` (the site's WhatsApp contact). That number
   must be one your team reads in the **WhatsApp or WhatsApp Business app**.
   If that number is connected to the WhatsApp Cloud API, messages to it do
   **not** show up in the app — then set a different, app-based number:

   ```
   NEXT_PUBLIC_WHATSAPP_VERIFY_NUMBER=94771234567   # digits, with country code
   ```

   (Add to `.env.local` and Vercel; restart / redeploy.)

## Unique chat handles

Run `data/wishdrop-unique-chat-handles.sql` too (before or after the file
above). The verification message includes the customer's chat handle, and
until now handles weren't unique — every Kavindi was "@kavindi".

- Every customer now gets a unique handle, stored on their profile:
  `@kavindi`, `@kavindi2`, `@kavindi3`… Titles are skipped ("Mrs. Anjali"
  → `@anjali`), accents become plain letters ("Émile" → `@emile`), and
  names without Latin letters (e.g. Sinhala or Tamil script) use the email
  instead ("kavi.s@gmail.com" → `@kavis`).
- New sign-ups get one automatically; existing customers are filled in by
  the migration, oldest account first, so early customers keep the plain
  first-name handle. A handle someone already had set is kept (tidied to
  lowercase, without "@").
- The database refuses duplicates (case-insensitive), including when many
  people sign up at the same moment.
- The customer's chat, their WhatsApp messages, the admin chat inbox, this
  verification page and the Broadcasts customer search (you can search
  `@kavindi2`) all show the stored handle.

Check after running — this should return no rows:

```sql
select lower(chat_handle), count(*) from public.profiles group by 1 having count(*) > 1;
```

## Customer flow (My Profile → Account security → WhatsApp Number)

1. **Add** → the number from their last checkout is pre-filled.
2. **Next** → a request is created with a reference like `WD-7K3D9Q`.
3. **Send on WhatsApp** → WhatsApp opens with this message ready to send:

   ```
   Hi WishDrop! Please verify my WhatsApp number.

   Reference: WD-7K3D9Q
   Name: Kavindi Silva
   Chat handle: @kavindi
   Email: kavindi@gmail.com
   Number: +94 77 123 4567
   ```

4. Status shows **Waiting for our team to confirm** (they can re-open
   WhatsApp, change the number, or cancel). The page checks back every
   20 seconds and when they return to it.
5. When staff decide, they get a notification in the bell (and a push, if
   notifications are on): **verified**, or **not verified** with the
   reason and a **Try again** button.

Limits: numbers must be Sri Lankan mobiles, or include a country code for
other countries (`+91…`, `+44…`). Max 5 attempts per day. A number already
verified on another account is refused with a "contact support" message.

## Staff flow (Admin → WhatsApp verification)

Visible to Manager, Sales and Super Admin; the sidebar shows how many are
waiting.

1. In the WishDrop WhatsApp, find the message — search the **reference**,
   or use **Open this chat in WhatsApp** on the card.
2. **Check who it came FROM.** WhatsApp shows the real sender number; the
   text inside the message can be typed by anyone. This check is what makes
   the verification trustworthy.
3. Decide:
   - **Verify +94 …** — sender matches the number shown.
   - **Sent from a different number** — paste the actual sender number and
     verify that one instead (the customer's typo is corrected).
   - **Reject** — pick a reason (the customer sees it): message not
     received, sent from a different number, number already on another
     account, or your own text.

Verifying writes the number to the customer's profile and login (the same
places the old flow wrote), so everything that relies on a verified number
— the WhatsApp relay, incoming WhatsApp matching, the "verify your phone"
banner — works unchanged. If the number is already on another account,
Verify is blocked and the card says which account.

**History** shows every decision, who made it, and the number verified.

## Files

| File | Purpose |
|---|---|
| `data/wishdrop-whatsapp-manual-verification.sql` | `whatsapp_verification_requests` table |
| `data/wishdrop-unique-chat-handles.sql` | Unique chat handles: generator, sign-up trigger, backfill, unique index |
| `lib/whatsapp/verification.ts` | Number normalizing, reference codes, the message text, reject reasons |
| `app/api/account/whatsapp/verification-request/route.ts` | Customer: start / check / cancel |
| `app/api/admin/whatsapp-verifications/route.ts` | Staff: list, count, verify, reject (+ notifies the customer) |
| `components/account/WhatsAppVerification.tsx` | The WhatsApp Number row on My Profile |
| `app/admin/(protected)/(common)/whatsapp-verifications/page.tsx` | Staff review page |

The old OTP routes (`app/api/account/whatsapp/send-code` and
`verify-code`) are no longer used by My Profile. They're left in place
untouched; delete them once you're happy with the new flow.
