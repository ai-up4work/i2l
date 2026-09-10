// components/admin/admin-header.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, X } from "lucide-react"

// Static top header — sits to the right of AdminSidebar, not full-width.
export function AdminHeader() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header className="fixed left-64 right-0 top-0 z-40 p-4 md:p-6">
      <nav className="mx-auto max-w-7xl rounded-3xl border border-ink/10 bg-parchment/80 shadow-lg backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-4 md:h-20 md:px-8">
          <button
            className="p-2 lg:hidden"
            onClick={() => setIsOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="hidden items-center gap-8 lg:flex">
            <Link
              href="/admin/sellers"
              className="font-display text-md font-bold tracking-wider text-ink/55 transition-colors hover:text-ink"
            >
              Sellers
            </Link>
            <Link
              href="/admin/orders"
              className="font-display text-md font-bold tracking-wider text-ink/55 transition-colors hover:text-ink"
            >
              Orders
            </Link>
            <Link
              href="/admin/products"
              className="font-display text-md font-bold tracking-wider text-ink/55 transition-colors hover:text-ink"
            >
              Products
            </Link>
          </div>

          <div className="flex flex-1 justify-center lg:absolute lg:left-1/2 lg:flex-none lg:-translate-x-1/2">
            <Link href="/admin" className="flex items-center gap-2">
              <Image
                src="/alzia-logo.png"
                alt="Alz\u00eda Logo"
                width={120}
                height={40}
                className="w-20 object-contain md:w-28"
                priority
              />
            </Link>
          </div>

          {/* Reserved for account/actions once auth is wired back up */}
          <div className="h-5 w-5 md:h-8 md:w-8" />
        </div>

        {isOpen && (
          <div className="border-t border-ink/10 px-6 py-6 lg:hidden">
            <div className="flex flex-col gap-6">
              <Link
                href="/admin/sellers"
                className="font-display text-sm font-medium tracking-wider text-ink/55 hover:text-teal-deep"
                onClick={() => setIsOpen(false)}
              >
                Sellers
              </Link>
              <Link
                href="/admin/orders"
                className="font-display text-sm font-medium tracking-wider text-ink/55 hover:text-teal-deep"
                onClick={() => setIsOpen(false)}
              >
                Orders
              </Link>
              <Link
                href="/admin/products"
                className="font-display text-sm font-medium tracking-wider text-ink/55 hover:text-teal-deep"
                onClick={() => setIsOpen(false)}
              >
                Products
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}