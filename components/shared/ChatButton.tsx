// components/shared/ChatButton.tsx
'use client'

import { MessageCircle, X } from 'lucide-react'
import { useChat } from '@/contexts/ChatContext'

export default function ChatButton({
  // Default matches the original landing-page placement. AccountShell
  // overrides this with its own offset so the button still sits above
  // MobileBottomNav on small screens and drops to a plain bottom-6 on
  // desktop, same as it already did before this button was wired up.
  positionClassName = 'bottom-6 right-6',
  // While true, the button is not rendered at all — used so it
  // disappears while ItemInfoModal (or any other full-screen overlay)
  // is covering the account area, rather than floating on top of it.
  hidden = false,
}: {
  positionClassName?: string
  hidden?: boolean
}) {
  const { isOpen, toggleChat, unreadCount } = useChat()

  if (hidden) return null

  return (
    <>
      {/* Scoped pulse animation, colored from --color-teal (0e8c9c) so it
          matches the theme rather than an unrelated hardcoded color. */}
      <style jsx>{`
        @keyframes chatPulse {
          0% { box-shadow: 0 0 0 0 rgba(14, 140, 156, 0.35); }
          70% { box-shadow: 0 0 0 14px rgba(14, 140, 156, 0); }
          100% { box-shadow: 0 0 0 0 rgba(14, 140, 156, 0); }
        }
        .chat-fab {
          animation: chatPulse 2.8s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-fab { animation: none; }
        }
      `}</style>

      <button
        type="button"
        aria-label={isOpen ? 'Close chat' : 'Chat with support'}
        onClick={toggleChat}
        className={`group fixed z-40 flex h-14 items-center gap-2.5 rounded-full bg-teal-deep pl-4 pr-4 text-parchment shadow-lift transition-all duration-300 ease-out hover:bg-indigo-deep hover:pl-5 hover:pr-6 ${positionClassName} ${
          isOpen ? '' : 'chat-fab'
        }`}
      >
        <span className="relative grid h-6 w-6 shrink-0 place-items-center">
          <MessageCircle
            size={22}
            className={`absolute transition-all duration-200 ${
              isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
            }`}
          />
          <X
            size={20}
            className={`absolute transition-all duration-200 ${
              isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            }`}
          />
        </span>

        {!isOpen && (
          <span className="max-w-0 overflow-hidden whitespace-nowrap font-body text-sm font-semibold opacity-0 transition-all duration-300 ease-out group-hover:max-w-[8rem] group-hover:opacity-100">
            Chat with us
          </span>
        )}

        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1 font-body text-[10px] font-bold text-ink shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </>
  )
}