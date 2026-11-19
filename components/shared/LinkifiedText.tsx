// components/shared/LinkifiedText.tsx
//
// Plain text with web addresses turned into links. Used for messages FROM
// Wishdrop (e.g. the welcome's "add your number" link). Customer messages
// are deliberately left as plain text.
import type { ReactNode } from 'react'

const URL_RE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g

export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, i): ReactNode =>
        i % 2 === 1 ? (
          <a key={i} href={part} className="font-semibold underline underline-offset-2 hover:opacity-80">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  )
}
