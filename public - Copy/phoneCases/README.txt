CASE CRAFT — IMAGES STILL NEEDED
================================

Everything here mirrors public/phoneCases. Every yellow "PLACEHOLDER" image
marks one image to get; checklist.csv lists all of them (open it in Excel).

1) PHOTOS  (case_images/...)
   One photo per phone, for the "Real look" preview:
     - a blank WHITE case, nothing printed on it
     - the back of the case, straight on (not angled)
     - on a pure white background, nothing else in the frame
     - camera cut-out clearly visible
     - at least 700 x 1000 px, JPG or PNG
   Put it in the phone's folder (any file name) and delete the placeholder.
   Extra lifestyle photos are fine but not needed.
   Samsung folders are grouped by series (Galaxy S / Galaxy A). Your existing
   Samsung folders can stay where they are or move into "Galaxy S" — either works.

2) TEMPLATES  (templates/)
   The factory print template, the same kind as "ToughCases iPhone 15.png".
   Save each one with the exact file name of its placeholder, into
   public/phoneCases/ (next to the other templates — NOT into a templates folder).

3) WHEN YOU HAVE THEM
   Copy the case_images folders into public/phoneCases/case_images, and the
   templates into public/phoneCases. Then send them to Claude (or run):
     - new templates need adding to lib/store-modules/casecraft/catalog.ts
     - python3 scripts/casecraft-clean-templates.py public/phoneCases public/phoneCases/clean   (case outline + camera)
     - python3 scripts/casecraft-real-mockups.py lib/store-modules/casecraft/catalog.ts public/phoneCases public/phoneCases/case_images public/phoneCases/real

   Don't copy the yellow placeholder files into the site — the scripts ignore
   them, but they'd still be served.

Notes
 - "iPhone 7" / "iPhone 6s" / "iPhone 6s Plus" / "iPhone 5s" photos also cover the
   Classic series' "iPhone 7 & 8", "6 & 6s", "6 & 6s Plus" and "5 & 5s & 5se".
   If you add an "iPhone 8" photo, the "iPhone 7" one isn't needed.
 - iPhone 18, 18e and Air 2 are expected in early 2027; add them when released.
