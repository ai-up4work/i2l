import { MessageCircle } from 'lucide-react'

export default function ChatButton() {
  return (
    <button
      aria-label="Chat with support"
      className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-rust text-paper shadow-lift transition-transform hover:scale-105"
    >
      <MessageCircle />
    </button>
  )
}
