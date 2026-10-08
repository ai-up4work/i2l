-- data/wishdrop-seller-media.sql
--
-- Seller product videos (Instagram / Facebook style sellers).
-- Safe to run more than once.
--
-- Photos keep living in products.images (text[]). Videos get their own
-- column so nothing that already reads `images` (cards, cart snapshots,
-- order lines) can ever be handed a video link by mistake.
-- Both hold Cloudinary links (folder: wishdrop/sellers/<store-slug>).

alter table public.products
  add column if not exists videos text[] not null default '{}';

comment on column public.products.videos is
  'Product video links (Cloudinary). Shown in the storefront gallery after the photos.';
