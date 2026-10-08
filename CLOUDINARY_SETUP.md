# Seller photos and videos (Cloudinary)

Custom sellers (Instagram / Facebook sellers with no website feed) upload
product photos and videos from their phone. Files go straight from the
browser to your Cloudinary account, into
`Home/wishdrop/sellers/<store-slug>/`.

## Setup (once)

1. **Keys.** Cloudinary Console → Settings → API Keys. Add to `.env.local`
   and to Vercel → Settings → Environment Variables, then redeploy:

   ```
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...        # server only, never NEXT_PUBLIC_
   CLOUDINARY_FOLDER=wishdrop       # optional, this is the default
   ```

2. **Database.** Run `data/wishdrop-seller-media.sql` in the Supabase SQL
   editor (adds `products.videos`; safe to run twice). Until it's run,
   store pages keep working without videos, and saving a product shows a
   message asking for this file to be run.

No upload preset is needed: uploads are signed by the server.

## Limits

| | Per product | Per file | Types |
|---|---|---|---|
| Photos | 10 | 10 MB | JPG, PNG, WEBP, HEIC, GIF |
| Videos | 3 | 100 MB | MP4, MOV, WEBM |

Change them in **both** `lib/cloudinary.ts` (`MEDIA_LIMITS`) and
`lib/upload/useMediaUpload.ts` (`CLIENT_MEDIA_LIMITS`). Cloudinary's own
plan limit also applies (the free plan allows 10 MB photos and 100 MB
videos).

## Where it's used

- **Seller portal** `/seller/products`: add/edit a product with photos and
  videos, on a phone or computer.
- **Admin → Catalogues**: staff add a product for a seller, or edit one.
- **Store page**: videos appear in the product gallery after the photos,
  with a still frame as the thumbnail. A product with only a video uses
  that still frame as its picture on cards, in the cart and on orders.

## How it works

```
browser ── POST /api/media/sign {kind} ──► server checks seller/staff login,
                                           picks the folder, signs it
browser ── file + signature ─────────────► Cloudinary (direct)
browser ◄─ https://res.cloudinary.com/… ── Cloudinary
browser ── save product (links) ─────────► /api/seller/products or /api/admin/catalogues
```

- A seller can only upload into their own folder; staff must name the seller.
- Video links are only accepted if they come from your Cloudinary account.
- Photos are served resized and in a modern format; videos are served as
  MP4 (so iPhone .mov files play everywhere). Both are built from the
  link (`lib/media.ts`), nothing extra is stored.

## Known limits

- Removing a photo/video from a product, or deleting the product, does not
  delete the file from Cloudinary. Clear old files in the Media Library.
- The size limit is checked in the browser and by your Cloudinary plan,
  not by our server.

## Files

| File | Purpose |
|---|---|
| `data/wishdrop-seller-media.sql` | `products.videos` column |
| `lib/cloudinary.ts` | Server: config, signing, link check, limits |
| `lib/media.ts` | Thumbnails, video still frame, MP4 playback links |
| `app/api/media/sign/route.ts` | Signs one upload for a seller or staff |
| `lib/upload/useMediaUpload.ts` | Browser upload with progress |
| `components/media/MediaUploader.tsx` | Photo/video picker |
| `components/catalogue/ProductForm.tsx` | Product form shared by seller portal and admin |
| `app/seller/(dashboard)/products/page.tsx` | Seller catalogue |
| `app/admin/(protected)/(sales)/catalogues/**` | Admin list, add, edit |
| `app/api/admin/catalogues/**`, `app/api/seller/**` | Product APIs |
| `components/stores/ProductGallery.tsx` | Plays videos on the product page |
