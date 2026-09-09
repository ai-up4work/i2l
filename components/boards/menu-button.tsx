"use client"

import { useEffect, useRef, useState } from "react"
import { MoreVertical, Plus, Trash2 } from "lucide-react"

interface MenuButtonProps {
  onAddItems?: () => void
  onDelete?: () => void
  onOpenChange?: (open: boolean) => void
  isVisible?: boolean
}

export function MenuButton({ onAddItems, onDelete, onOpenChange, isVisible = false }: MenuButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const setOpen = (open: boolean) => {
    setIsOpen(open)
    onOpenChange?.(open)
  }

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative" data-menu>
      <button
        type="button"
        aria-label="Board options"
        data-menu
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!isOpen)
        }}
        className={`grid h-7 w-7 place-items-center rounded-md transition-all duration-150 ${
          isOpen ? "bg-ink/[0.1]" : "hover:bg-ink/[0.08]"
        } ${isVisible || isOpen ? "opacity-100" : "opacity-0"}`}
      >
        <MoreVertical size={16} className={isOpen ? "text-ink/70" : "text-ink/40"} />
      </button>

      {isOpen && (
        <div
          data-menu
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full right-0 z-20 mb-1.5 w-40 overflow-hidden rounded-lg bg-card shadow-[0_8px_30px_rgba(32,36,43,0.15)]"
          style={{ border: "1px solid rgba(32, 36, 43, 0.08)" }}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onAddItems?.()
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink/70 transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <Plus size={15} />
            Add items
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onDelete?.()
            }}
            className="group flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink/70 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={15} className="text-ink/70 transition-colors group-hover:text-red-500" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}