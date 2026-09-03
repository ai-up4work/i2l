// app/api/scrape/route.ts
import { NextRequest, NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

export const runtime = "nodejs"

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/124.0.0.0 Safari/537.36",

      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

      "Accept-Language": "en-US,en;q=0.9",
    },

    cache: "no-store",
  })

  console.log("Myntra status:", response.status)

  if (!response.ok) {
    throw new Error(`Myntra returned HTTP ${response.status}`)
  }

  return await response.text()
}

function extractMyxState(html: string): Record<string, unknown> {
  const marker = "window.__myx"

  const markerIndex = html.indexOf(marker)

  if (markerIndex === -1) {
    throw new Error(
      "Could not find window.__myx in page HTML."
    )
  }

  const equalsIndex = html.indexOf(
    "=",
    markerIndex
  )

  if (equalsIndex === -1) {
    throw new Error(
      "Could not find assignment for window.__myx."
    )
  }

  const jsonStart = html.indexOf(
    "{",
    equalsIndex
  )

  if (jsonStart === -1) {
    throw new Error(
      "Could not find JSON object."
    )
  }

  let depth = 0
  let inString = false
  let escapeNext = false

  for (
    let i = jsonStart;
    i < html.length;
    i++
  ) {
    const char = html[i]

    // Handle characters inside JSON strings
    if (inString) {
      if (escapeNext) {
        escapeNext = false
        continue
      }

      if (char === "\\") {
        escapeNext = true
        continue
      }

      if (char === '"') {
        inString = false
      }

      continue
    }

    // Start of a string
    if (char === '"') {
      inString = true
      continue
    }

    // Opening object
    if (char === "{") {
      depth++
    }

    // Closing object
    if (char === "}") {
      depth--

      // Entire JSON object found
      if (depth === 0) {
        const jsonString = html.slice(
          jsonStart,
          i + 1
        )

        try {
          return JSON.parse(jsonString)
        } catch (error) {
          throw new Error(
            `Found window.__myx but JSON parsing failed: ${
              error instanceof Error
                ? error.message
                : "Unknown error"
            }`
          )
        }
      }
    }
  }

  throw new Error(
    "Could not find the end of window.__myx JSON."
  )
}

function summarizePdpData(
  pdpData: Record<string, any>
) {
  const summary: Record<string, any> = {}

  // Brand
  if (
    typeof pdpData.brand === "object" &&
    pdpData.brand !== null
  ) {
    summary.brand = pdpData.brand.name
  } else {
    summary.brand = pdpData.brand
  }

  // Product name
  summary.product_name = pdpData.name

  // Myntra ID
  summary.myntra_id =
    pdpData.id ||
    pdpData.styleId

  // Price
  const price = pdpData.price || {}

  if (typeof price === "object") {
    summary.mrp = price.mrp

    summary.selling_price =
      price.discounted ||
      price.selling

    summary.discount_percent =
      price.discountPercent ||
      price.discount

    // Calculate discount if missing
    if (
      !summary.discount_percent &&
      summary.mrp &&
      summary.selling_price
    ) {
      const mrp = Number(summary.mrp)
      const selling =
        Number(summary.selling_price)

      if (mrp > 0) {
        summary.discount_percent =
          Math.round(
            ((mrp - selling) / mrp) *
              100 *
              10
          ) / 10
      }
    }
  }

  // Ratings
  const ratings = pdpData.ratings || {}

  if (typeof ratings === "object") {
    summary.rating =
      ratings.averageRating

    summary.rating_count =
      ratings.totalCount
  }

  // Images
  const media = pdpData.media || {}

  if (
    typeof media === "object" &&
    media !== null
  ) {
    const albums =
      media.albums || []

    if (
      Array.isArray(albums) &&
      albums.length > 0
    ) {
      const images =
        albums[0]?.images || []

      summary.images = images
        .map(
          (img: any) =>
            img.src ||
            img.secureUrl ||
            img.url
        )
        .filter(Boolean)
        .slice(0, 10)
    }
  }

  // Sizes
  summary.available_sizes =
    pdpData.sizes ||
    pdpData.availableSizes ||
    []

  return summary
}

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json()

    const productUrl = body?.url

    if (
      !productUrl ||
      typeof productUrl !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Product URL is required.",
        },
        { status: 400 }
      )
    }

    // Basic URL validation
    const parsedUrl = new URL(productUrl)

    if (
      !parsedUrl.hostname.includes(
        "myntra.com"
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only Myntra product URLs are supported.",
        },
        { status: 400 }
      )
    }

    console.log(
      "Scraping:",
      productUrl
    )

    // Fetch Myntra HTML
    const html =
      await fetchHtml(productUrl)

    // Extract window.__myx
    const myxState =
      extractMyxState(html)

    // Get pdpData
    const pdpData =
      (myxState.pdpData as Record<
        string,
        any
      >) || {}

    // Generate cleaned summary
    const product =
      summarizePdpData(pdpData)

    return NextResponse.json({
      success: true,

      product,

      // Optional: return full data
      // pdpData,
    })
  } catch (error) {
    console.error(
      "Scraping error:",
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Failed to scrape product.",
      },
      { status: 500 }
    )
  }
}