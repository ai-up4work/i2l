"use client"

import { useEffect, useState } from "react"

interface NewBoardSlotProps {
  onClick?: () => void
}

export function NewBoardSlot({ onClick }: NewBoardSlotProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [displayedText, setDisplayedText] = useState("")
  const [isTypingComplete, setIsTypingComplete] = useState(false)
  const fullText = "Click to create..."

  useEffect(() => {
    if (isHovered) {
      setDisplayedText("")
      setIsTypingComplete(false)
      let currentIndex = 0
      const interval = setInterval(() => {
        if (currentIndex <= fullText.length) {
          setDisplayedText(fullText.slice(0, currentIndex))
          currentIndex++
        } else {
          clearInterval(interval)
          setIsTypingComplete(true)
        }
      }, 60)
      return () => clearInterval(interval)
    } else {
      setDisplayedText("")
      setIsTypingComplete(false)
    }
  }, [isHovered])

  return (
    <div
      className="group relative cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      <div
        className="relative w-[288px] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ perspective: "1200px" }}
      >
        <div
          className="absolute inset-0 z-20 flex items-start justify-center px-6 pt-12 transition-opacity duration-300 pointer-events-none"
          style={{ opacity: isHovered ? 1 : 0 }}
        >
          <p className="text-sm text-ink/50 font-mono text-center" style={{ lineHeight: "20px" }}>
            {displayedText}
            {isHovered && (
              <span
                className={`inline-block w-[2px] h-[14px] bg-ink/50 ml-0.5 ${isTypingComplete ? "boards-cursor" : ""}`}
                style={{ verticalAlign: "text-bottom" }}
              />
            )}
          </p>
        </div>

        <div
          className="relative z-0 rounded-2xl transition-all duration-500"
          style={{
            height: "224px",
            transformStyle: "preserve-3d",
            transformOrigin: "center bottom",
            transform: isHovered ? "rotateX(15deg)" : "rotateX(0deg)",
            background: "var(--color-card)",
            border: "1px dashed rgba(32, 36, 43, 0.06)",
          }}
        />

        <div
          className="absolute bottom-0 left-0 right-0 z-10 rounded-2xl overflow-hidden transition-all duration-500"
          style={{
            background: "rgba(255, 255, 255, 0.8)",
            border: "1px dashed rgba(32, 36, 43, 0.06)",
            transformStyle: "preserve-3d",
            transformOrigin: "center bottom",
            transform: isHovered ? "rotateX(-25deg)" : "rotateX(0deg)",
          }}
        >
          <div className="relative py-4 px-4">
            <h3 className="font-semibold text-ink/70 text-base leading-snug min-h-[2.75rem] transition-colors duration-300 group-hover:text-ink">
              New Board
            </h3>
          </div>
          <div className="relative h-[48px]">
            <div className="absolute inset-x-0 top-0 h-[1px] border-t border-dashed border-ink/[0.06]" />
            <div className="absolute inset-0 flex items-center justify-between px-4">
              <span className="text-[13px] text-ink/40 transition-colors duration-300 group-hover:text-ink/60">
                Group your saved items
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}