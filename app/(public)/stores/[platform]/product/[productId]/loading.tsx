// app/(public)/stores/[platform]/product/[productId]/loading.tsx
// app/(public)/stores/[platform]/product/[productId]/loading.tsx
//
// Next.js renders this automatically while the server component in
// page.tsx is awaiting fetchStoreProduct(). No wiring needed beyond
// dropping this file next to page.tsx.

export default function ProductDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 lg:px-10 animate-pulse">
      {/* Back link */}
      <div className="h-4 w-32 rounded bg-ink/10" />

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="aspect-square rounded-2xl bg-ink/10" />
          <div className="mt-3 flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 w-16 rounded-xl bg-ink/10" />
            ))}
          </div>
        </div>

        {/* Info column */}
        <div>
          {/* store/condition/rating line */}
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-ink/10" />
            <div className="h-3 w-28 rounded bg-ink/10" />
          </div>

          {/* Title */}
          <div className="mt-3 h-7 w-3/4 rounded bg-ink/10" />
          <div className="mt-2 h-7 w-1/2 rounded bg-ink/10" />

          {/* Specs row */}
          <div className="mt-3 h-3 w-40 rounded bg-ink/10" />

          {/* Price */}
          <div className="mt-4 h-9 w-32 rounded bg-ink/10" />

          {/* Sizes/colors */}
          <div className="mt-6 flex gap-6">
            <div>
              <div className="mb-2 h-2.5 w-10 rounded bg-ink/10" />
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-7 w-10 rounded-lg bg-ink/10" />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 h-2.5 w-12 rounded bg-ink/10" />
              <div className="flex gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-9 w-9 rounded-full bg-ink/10" />
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mt-6 space-y-2">
            <div className="h-3 w-full rounded bg-ink/10" />
            <div className="h-3 w-full rounded bg-ink/10" />
            <div className="h-3 w-2/3 rounded bg-ink/10" />
          </div>

          {/* CTA */}
          <div className="mt-6 h-12 w-full rounded-xl bg-ink/10 sm:w-48" />

          {/* Trust box */}
          <div className="mt-5 h-14 w-full rounded-xl bg-ink/10" />
        </div>
      </div>
    </div>
  )
}