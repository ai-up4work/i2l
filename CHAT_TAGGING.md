# Wishdrop — Fixing chat message tags (admin)

Customers tag chat messages to an order as they chat. When they pick the
wrong one — or none — the message doesn't show up in that order's chat
panel. Staff can now fix any message's tag from the main inbox.

## Setup

Run `data/Wishdrop-chat-message-retag.sql` in Supabase (safe to re-run).
It only adds audit columns; existing tags are untouched.

## How to use it (Admin → Customer chat)

1. Open the conversation and hover the message. Click the **tag icon**
   (next to Reply). Untagged customer messages keep a faint tag icon
   visible, so you can spot what still needs sorting.
2. The **Tag this message** dialog shows:
   - the message, and who last re-tagged it (if anyone);
   - **Mentioned in this message** — any `WD-…` / `REQ-…` numbers in the
     text that belong to this customer, ready to pick (it understands
     "wd10499", "WD 10499", "req-10005");
   - a warning if the text mentions a number that **isn't** this
     customer's;
   - all their **orders** and **requests**, newest first, with status,
     date and first item — searchable when there are many;
   - **No tag — general message**.
3. **Save tag.** The message immediately moves to that order's/request's
   chat panel (and out of the old one), the inbox list and its filters
   update, and the tag pill shows ✎ — hover it to see who re-tagged it.

Only the customer's **own** orders and requests can be chosen — the
server rejects anything else. Managers, Sales and Super Admins can re-tag.

## What's recorded

On each message: who re-tagged it, when, and the **original** tag from
before the first edit (never overwritten) — so any mistake can be traced
and put back.

## Files

| File | Purpose |
|---|---|
| `data/Wishdrop-chat-message-retag.sql` | Audit columns on `chat_messages` |
| `app/api/admin/chat/messages/[messageId]/tag/route.ts` | Options + suggestions (GET), save with ownership check and inbox rollup (PATCH) |
| `components/admin/chat/RetagMessageDialog.tsx` | The dialog |
| `app/admin/(protected)/(common)/chat/page.tsx` | Tag button on messages, ✎ marker, live update after saving |
