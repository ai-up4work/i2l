# WishDrop — Send chat messages to WhatsApp (admin)

From the admin inbox, staff can send any of their messages — or a
"you have messages waiting" reminder — to a customer's **verified**
WhatsApp number. No Meta API, no templates, no cost: it opens WhatsApp on
the staff member's own device with the customer and the message already
filled in, and they press **Send**.

## Before you start

- Run `data/wishdrop-chat-whatsapp-handoff.sql` in Supabase.
- Staff computers must have **WhatsApp Web or WhatsApp Desktop logged in as
  the WishDrop business number** (WhatsApp Business app → Linked devices).
  The link opens whichever WhatsApp is logged in on that device — if it's a
  personal account, the customer gets it from that personal number.
- Only customers with a verified number (My Profile → WhatsApp Number,
  confirmed on Admin → WhatsApp verification) can be messaged this way.

## In the inbox (Admin → Customer chat)

A new bar at the top of each conversation shows the customer, their
WhatsApp status (`+94 77 123 4567 verified` or not verified) and when
someone last reached out on WhatsApp.

**One message** — hover one of your messages → WhatsApp icon.

**Several messages** — **Select** → tap your messages (they get a gold
outline) → **Send to WhatsApp** in the bar above the composer. They're
combined in order into one message.

**Reminder** — **Remind on WhatsApp** writes a short nudge, e.g.
"Hi Kavindi, you have 3 new messages from WishDrop about your order
*WD-10499*." (it counts your messages since the customer last wrote).

Every option opens the same review dialog:

- **Link in the message** — picked automatically: the order's tracking page
  when the messages are about one order, otherwise My Messages. You can
  switch to any order in the conversation, My Orders, or no link. Signed-out
  customers are asked to sign in, then land on that page.
- **Message** — fully editable. Changing the link rewrites it until you edit
  it yourself; **Reset** brings back the generated text. `*asterisks*` show
  as bold in WhatsApp. Photos can't go through a link, so they're counted
  ("We also sent you 2 photos — see them at the link below"). Long selections
  are shortened to fit ("…and 6 more messages").
- A warning if someone already reached out on WhatsApp in the last 24 hours.
- **Open WhatsApp** → press Send in WhatsApp.

## What's recorded

We can't see whether Send was pressed, so everything records that it was
**opened in WhatsApp**:
- forwarded messages get a small WhatsApp mark next to the time (hover for
  who and when);
- the conversation's "Last WhatsApp" time and person;
- a full log (`chat_whatsapp_handoffs`): exact text, link, number, staff
  member, time.

## Files

| File | Purpose |
|---|---|
| `data/wishdrop-chat-whatsapp-handoff.sql` | Columns on messages/threads + hand-off log |
| `lib/chat/whatsapp-handoff.ts` | Writes the combined message / reminder, links, length limits |
| `app/api/admin/chat/threads/[threadId]/whatsapp/route.ts` | Verified number + last reminder (GET), log a hand-off (POST) |
| `components/admin/chat/WhatsAppHandoffDialog.tsx` | The review-and-open dialog |
| `app/admin/(protected)/(common)/chat/page.tsx` | Header bar, Select mode, per-message button, markers |
