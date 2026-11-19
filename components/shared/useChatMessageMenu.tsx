'use client'

// components/shared/useChatMessageMenu.tsx
//
// The WhatsApp-style message menu for the CUSTOMER chat (the floating widget
// and /account/messages share it): click or right-click a bubble for Reply,
// Copy text and — on your own messages — Delete. Staff messages can only be
// replied to or copied. Messages tagged to an order or request can't be
// deleted (they are part of that order's record).

import { useCallback, useState, type ReactNode } from 'react'
import { Copy, Reply, Trash2 } from 'lucide-react'
import { useChat, type ChatMessage, type ReplyPreview } from '@/contexts/ChatContext'
import { ConfirmDialog, ContextMenu, type MenuItem } from '@/components/shared/ContextMenu'

export function useChatMessageMenu({ onReply }: { onReply: (r: ReplyPreview) => void }): {
  openMessageMenu: (at: { x: number; y: number }, members: ChatMessage[], caption: string) => void
  /** Render this once, anywhere inside the chat UI. */
  menuNode: ReactNode
} {
  const { deleteMessages } = useChat()
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [confirm, setConfirm] = useState<{ ids: string[]; count: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  const openMessageMenu = useCallback(
    (at: { x: number; y: number }, members: ChatMessage[], caption: string) => {
      const m = members[0]
      const last = members[members.length - 1]
      const mine = m.sender === 'customer'
      const isAlbum = members.length > 1
      const tagged = members.some((x) => x.orderId || x.requestId)
      const items: MenuItem[] = [
        {
          key: 'reply',
          label: 'Reply',
          icon: <Reply size={16} />,
          onSelect: () => onReply({ id: last.id, sender: m.sender, text: caption || (isAlbum ? '📷 Photos' : '') }),
        },
      ]
      if (caption) {
        items.push({ key: 'copy', label: 'Copy text', icon: <Copy size={16} />, onSelect: () => void navigator.clipboard?.writeText(caption) })
      }
      if (mine) {
        items.push({
          key: 'delete',
          label: isAlbum ? `Delete ${members.length} photos` : 'Delete message',
          icon: <Trash2 size={16} />,
          danger: true,
          separatorAbove: true,
          disabledReason: tagged ? 'Part of an order or request, so it can’t be deleted' : undefined,
          onSelect: () => {
            setError(null)
            setConfirm({ ids: members.map((x) => x.id), count: members.length })
          },
        })
      }
      setMenu({ x: at.x, y: at.y, items })
    },
    [onReply],
  )

  const menuNode = (
    <>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.count > 1 ? `Delete ${confirm.count} photos?` : 'Delete this message?'}
          body="It will be removed from your chat and from ours. This can’t be undone."
          confirmLabel="Delete"
          busy={busy}
          error={error}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setBusy(true)
            setError(null)
            const res = await deleteMessages(confirm.ids)
            setBusy(false)
            if (res.ok) setConfirm(null)
            else setError(res.error ?? 'Could not delete the message.')
          }}
        />
      )}
    </>
  )

  return { openMessageMenu, menuNode }
}
