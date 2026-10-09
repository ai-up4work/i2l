# Media cleanup (no more ghost files)

Every night at **3:00 AM Sri Lanka time**, Wishdrop deletes every uploaded
photo or video that nothing links to any more. That covers:

- a photo **replaced** with a new one (product, cover, logo, avatar, QC photo)
- an image or video **removed** from a product or variant
- a product, store, chat or order **deleted**, including rows removed
  automatically along with them
- an upload that was **never saved** (form closed without saving)

It looks in both places files are kept:

| Where | What's there |
|---|---|
| Supabase Storage, bucket `uploads` | Wishdrop Mall photos, QC photos, avatars |
| Supabase Storage, bucket `chat-attachments` | Photos and videos sent in chat |
| Cloudinary, folder `wishdrop/` | Social-store photos and videos |

## How it decides a file is unused

1. It reads **every text column of every table** for Supabase and
   Cloudinary links, plus the profile data on each login. New tables
   and columns are picked up on their own; nobody has to keep a list.
   The `audit_log` is skipped, so an old photo mentioned in a log entry
   doesn't keep the file.
2. It lists every file in the buckets and folder above.
3. A file is deleted only if **no link points to it** and it's **more
   than 24 hours old**. A photo someone has just uploaded but not saved
   yet is safe.

A file used in two places (say a variant reusing a product photo) stays
until the last link to it is gone.

## Safety stops

- If it can't find **any** links in the database, it deletes nothing.
- If **more than half** of all files (when there are 20 or more) look
  unused, the nightly run stops and only reports. A Super Admin can look
  at the files on **Media cleanup** and confirm.

The first run on an existing project may hit the second stop, because
years of replaced Mall photos all show up at once. Open Media cleanup,
press **Check now**, look through the files, then delete.

## Setup (once)

1. Run `data/wishdrop-media-sweep.sql` in the Supabase SQL editor.
2. In Vercel → Settings → Environment Variables, add `CRON_SECRET`
   (any long random string, e.g. from `openssl rand -hex 32`). Vercel
   sends it with every scheduled call; anyone else gets "Not authorised".
   The schedule is already in `vercel.json` and starts on the next deploy.
3. Cloudinary keys must be set (see CLOUDINARY_SETUP.md). Without them,
   only Supabase files are cleaned.
4. Turn off the old weekly storage job so there's only one cleanup:

   ```sql
   select cron.unschedule('weekly-storage-cleanup');
   ```

   (If it says the job doesn't exist, there's nothing to do.)

## By hand

**Admin → Super Admin → Media cleanup**

- **Check now** lists unused files with previews (largest first), how
  much space they use, and how many are in use or too new to touch.
  Nothing is deleted.
- **Delete N unused files** deletes them, after a confirmation.
- **Recent cleanups** shows the last 10 runs, nightly and by hand.

## Files

- `lib/media-sweep.ts` — the cleanup
- `app/api/cron/media-sweep/route.ts` — nightly run (Vercel Cron)
- `app/api/admin/media-sweep/route.ts` — Super Admin check / delete
- `app/admin/(protected)/super-admin/media-cleanup/page.tsx` — the page
- `data/wishdrop-media-sweep.sql` — database helpers and run history

## Good to know

- Deleting from Cloudinary also clears its CDN copy, so the old link
  stops working within minutes.
- Seller logos added in the old seller wizard are stored inside the
  database (not as files), so there's nothing to clean for those.
- Links to files stored somewhere else (Instagram, the shop's own site)
  are never touched; only Wishdrop's own buckets and Cloudinary folder.
