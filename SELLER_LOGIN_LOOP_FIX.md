# Fixed: /seller/login redirect loop

## Root cause (two compounding bugs)

1. **The whole seller portal was sitting under a route *group*, not a real
   URL segment.** `app/(seller)/...` — parentheses mean "organize files,
   contribute nothing to the URL." So `app/(seller)/login/page.tsx`
   actually served at `/login`, `app/(seller)/(dashboard)/products/page.tsx`
   served at `/products`, and `app/(seller)/(dashboard)/page.tsx` served at
   `/` — colliding with the real public homepage (`app/page.tsx`).

2. **The auth-gating layout wrapped the login page too.**
   `app/(seller)/layout.tsx` sat one level above `login/`, so every visit
   to the login page also ran through the layout's `if (!seller)
   redirect('/seller/login')` check. Not logged in yet (you're trying to
   log in) → redirect to `/seller/login` → same layout runs again → not
   logged in → redirect again. Infinite loop, which is exactly the
   repeating 307s you saw.

Two more breakages were downstream of bug #1: `layout.tsx` imported
`getCurrentSeller` from `@/lib/supabase/seller-auth`, but that file was
actually sitting at `data/sellers/seller-auth.ts` (its own header comment
said it belonged at `lib/supabase/seller-auth.ts` — just never moved). And
`layout.tsx` imported `./SellerSignOutButton` relatively, which only
resolves if the button lives in the *same* folder as the layout — it
didn't, because the layout was one directory too high.

Every misplaced file's own header comment agreed on where things were
supposed to live (`app/seller/(dashboard)/products/page.tsx`,
`.../SellerSignOutButton.tsx -- imported by ../layout.tsx`, etc.) — the
intended structure was never actually wrong, just never assembled.

## What changed

```
app/seller/
  login/page.tsx                 <- moved out from under the gate. Public.
  (dashboard)/
    layout.tsx                   <- moved here: gates ONLY this subtree now
    page.tsx                     <- redirect('/seller/products')
    products/page.tsx            <- the real product CRUD page
    SellerSignOutButton.tsx      <- sits next to layout.tsx again

lib/supabase/seller-auth.ts      <- moved from data/sellers/seller-auth.ts
```

`app/(seller)/` is deleted entirely. Nothing else in the codebase
referenced the old paths (checked).

## Why this shape and not something else

The login page needs to be reachable *without* passing the "are you
logged in" check — that's the one non-negotiable constraint for any
login page under an auth-gated section. Nesting the gate one level
deeper (`(dashboard)/layout.tsx` instead of a layout at the `seller/`
root) is the standard Next.js App Router pattern for "public entry point
+ protected area sharing a URL prefix," and it's exactly what the login
page's own comment already assumed: *"The (dashboard) layout checks
owner_user_id server-side on the next request..."* — it was just never
actually placed there.

## Worth checking on your end

Restart the dev server (or clear `.next/`) after pulling this in —
Next.js's route manifest is cached, and a route-group rename like this
won't always pick up cleanly on a hot reload alone.
