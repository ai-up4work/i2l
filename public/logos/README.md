# Partner logo files

`components/landing/Partners.tsx` renders these via `next/image`, so each
filename below needs to exist in this folder before the landing page will
build/render correctly (missing files 404 in dev, and fail the production
build's image optimization step):

- ebay.png
- rakuten.png
- mercari.png
- amazon.png
- qoo10.png
- lazada.png
- shopee.png
- jd.png
- aliexpress.png

Source these directly from each brand's press/media kit (most publish an
official logo pack) rather than screenshotting or scraping — that's the
usual constraint on using third-party brand marks. Recommended: square-ish
transparent PNGs, roughly 200x200px minimum, cropped tight to the mark so
the `grayscale` hover treatment in `Partners.tsx` reads cleanly.

To add or remove a partner, edit the `partners` array in
`components/landing/data.ts` — each entry's `logo` path just needs to
match a file placed here.
