"use client"

import { useState } from "react"

interface Product {
  brand?: string
  product_name?: string
  myntra_id?: string | number
  mrp?: number
  selling_price?: number
  discount_percent?: number
  rating?: number
  rating_count?: number
  images?: string[]
  available_sizes?: string[]
}

export default function ScrapePage() {
  const [url, setUrl] = useState("")
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleScrape() {
    if (!url.trim()) {
      setError("Please enter a Myntra product URL.")
      return
    }

    setLoading(true)
    setError("")
    setProduct(null)

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          url,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Failed to scrape product."
        )
      }

      setProduct(data.product)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <div className="mx-auto max-w-5xl">

        {/* Header */}

        <div className="mb-10 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-blue-400">
            Product Scraper
          </p>

          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Myntra Product Scraper
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-slate-400">
            Paste a Myntra product URL and extract product
            information, prices, images, ratings and available sizes.
          </p>
        </div>

        {/* Search Box */}

        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur">

          <div className="flex flex-col gap-3 md:flex-row">

            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleScrape()
                }
              }}
              placeholder="Paste Myntra product URL..."
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
            />

            <button
              onClick={handleScrape}
              disabled={loading}
              className="rounded-2xl bg-blue-600 px-8 py-4 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Scraping..." : "Scrape Product"}
            </button>

          </div>

        </div>

        {/* Error */}

        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}

        {loading && (
          <div className="mt-8 flex items-center justify-center gap-3 text-slate-400">

            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />

            Fetching product information...

          </div>
        )}

        {/* Product Result */}

        {product && (
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]">

            {/* Images */}

            <div className="space-y-4">

              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white">

                {product.images?.[0] ? (
                  <img
                    src={product.images[0]}
                    alt={product.product_name || "Product"}
                    className="aspect-square w-full object-contain"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-slate-900 text-slate-500">
                    No image available
                  </div>
                )}

              </div>

              {/* Thumbnail Images */}

              {product.images &&
                product.images.length > 1 && (
                  <div className="flex gap-3 overflow-x-auto">

                    {product.images.map(
                      (image, index) => (
                        <div
                          key={index}
                          className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white"
                        >
                          <img
                            src={image}
                            alt={`Product ${index + 1}`}
                            className="h-full w-full object-contain"
                          />
                        </div>
                      )
                    )}

                  </div>
                )}

            </div>

            {/* Product Details */}

            <div className="rounded-3xl border border-white/10 bg-white/5 p-7">

              <p className="text-sm font-semibold text-blue-400">
                {product.brand || "Unknown Brand"}
              </p>

              <h2 className="mt-2 text-3xl font-bold leading-tight">
                {product.product_name || "Unknown Product"}
              </h2>

              {product.myntra_id && (
                <p className="mt-3 text-sm text-slate-500">
                  Myntra ID: {product.myntra_id}
                </p>
              )}

              {/* Price */}

              <div className="mt-8 flex flex-wrap items-center gap-4">

                {product.selling_price && (
                  <span className="text-3xl font-bold">
                    ₹{product.selling_price}
                  </span>
                )}

                {product.mrp && (
                  <span className="text-lg text-slate-500 line-through">
                    ₹{product.mrp}
                  </span>
                )}

                {product.discount_percent && (
                  <span className="rounded-full bg-green-500/10 px-3 py-1 text-sm font-semibold text-green-400">
                    {product.discount_percent}% OFF
                  </span>
                )}

              </div>

              {/* Rating */}

              {product.rating && (
                <div className="mt-8 flex items-center gap-3">

                  <div className="rounded-lg bg-green-600 px-3 py-1 text-sm font-bold">
                    ★ {product.rating}
                  </div>

                  <span className="text-sm text-slate-400">
                    {product.rating_count
                      ? `${product.rating_count} ratings`
                      : ""}
                  </span>

                </div>
              )}

              {/* Sizes */}

              {product.available_sizes &&
                product.available_sizes.length > 0 && (
                  <div className="mt-8">

                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
                      Available Sizes
                    </h3>

                    <div className="flex flex-wrap gap-3">

                      {product.available_sizes.map(
                        (size, index) => (
                          <span
                            key={index}
                            className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm"
                          >
                            {typeof size === "string"
                              ? size
                              : JSON.stringify(size)}
                          </span>
                        )
                      )}

                    </div>

                  </div>
                )}

              {/* JSON */}

              <details className="mt-10 border-t border-white/10 pt-6">

                <summary className="cursor-pointer font-medium text-slate-300">
                  View Raw Scraped Data
                </summary>

                <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-black/40 p-5 text-xs leading-relaxed text-green-400">
                  {JSON.stringify(product, null, 2)}
                </pre>

              </details>

            </div>

          </div>
        )}

      </div>
    </main>
  )
}