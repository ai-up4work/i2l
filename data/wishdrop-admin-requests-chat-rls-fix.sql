-- data/Wishdrop-admin-requests-chat-rls-fix.sql
--
-- Same root cause as Wishdrop-admin-orders-rls-fix.sql, applied to the
-- three tables the Channel 3 (manual-quote) flow depends on:
--
--   create policy "own requests" on public.requests
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--   create policy "own chat threads" on public.chat_threads
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--   create policy "own thread messages" on public.chat_messages
--     for all using (exists (select 1 from public.chat_threads t
--       where t.id = thread_id and t.user_id = auth.uid()));
--
-- These are worse than the orders case: they're `for all`, not just
-- `for select` — so without this fix, the admin panel can't just fail to
-- SEE another customer's request, it fails to WRITE to it too. Concretely,
-- until this is applied:
--   - /admin/requests only ever shows requests belonging to whichever
--     customer happens to be logged into that browser tab (if any).
--   - Quoting a request (setQuote), confirming it (confirmRequest),
--     declining it, or reassigning it all silently fail for any request
--     that isn't "yours" in that same sense.
--   - A staff reply in /admin/chat or on a request's linked thread fails
--     to insert, because chat_messages' policy requires the thread's
--     user_id to match auth.uid() — which it never will for a staff
--     session replying to a customer's thread.
--
-- INTERIM FIX (this file): widen every one of these to any authenticated
-- session, same reasoning and same caveat as the orders fix — this is
-- NOT a real access-control layer, it's the minimum change to unblock
-- the admin panel today, given there's no staff-auth-aware policy or
-- service-role server route in front of these tables yet. Revisit before
-- this goes anywhere near production with real customer data.

drop policy if exists "own requests" on public.requests;
create policy "own requests or any authenticated (admin) session"
  on public.requests for all
  using (auth.uid() = user_id or auth.role() = 'authenticated')
  with check (auth.uid() = user_id or auth.role() = 'authenticated');

drop policy if exists "own chat threads" on public.chat_threads;
create policy "own chat threads or any authenticated (admin) session"
  on public.chat_threads for all
  using (auth.uid() = user_id or auth.role() = 'authenticated')
  with check (auth.uid() = user_id or auth.role() = 'authenticated');

drop policy if exists "own thread messages" on public.chat_messages;
create policy "own thread messages or any authenticated (admin) session"
  on public.chat_messages for all
  using (
    exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid())
    or auth.role() = 'authenticated'
  )
  with check (
    exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid())
    or auth.role() = 'authenticated'
  );
