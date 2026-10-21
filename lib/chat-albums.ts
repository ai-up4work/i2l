// lib/chat-albums.ts
//
// WhatsApp-style photo albums in chat. Each chat message holds one
// attachment (chat_messages.attachment_url is a single column), so photos
// picked together are stored as one message each. They're grouped back
// into one album bubble at display time instead. Photos / videos join one
// album when they come one after another with nothing in between, from
// the same sender, and:
//   - tagged to the same order or request → no time limit: they're about
//     the same thing (the day separator still starts a new album);
//   - untagged (general chat)             → each within ALBUM_WINDOW_MS of
//     the previous one, so unrelated photos don't all merge.
//
// Pure and framework-free: the customer chat, /account/messages and the
// admin inbox all call groupIntoAlbums with their own message shape.

/** Max gap between two UNTAGGED photos for them to stay in one album. */
export const ALBUM_WINDOW_MS = 60_000

export interface AlbumKey {
  sender: string
  hasMedia: boolean
  /** Sent time, ms. */
  at: number
  /** Order / request the message is tagged to ('' when untagged). */
  tag: string
  /** A reply (quoted message) always starts its own bubble. */
  isReply: boolean
}

/**
 * Splits `items` (already in send order) into runs: a run of 2+ items is
 * an album; a run of 1 is an ordinary message.
 */
export function groupIntoAlbums<T>(items: T[], key: (item: T) => AlbumKey): T[][] {
  const runs: T[][] = []
  let lastKey: AlbumKey | null = null
  for (const item of items) {
    const k = key(item)
    const joins =
      lastKey !== null &&
      lastKey.hasMedia &&
      k.hasMedia &&
      !k.isReply &&
      k.sender === lastKey.sender &&
      k.tag === lastKey.tag &&
      // Same order / request: no time limit. Untagged: within the window.
      (k.tag !== '' || (k.at - lastKey.at >= 0 && k.at - lastKey.at <= ALBUM_WINDOW_MS))
    if (joins) runs[runs.length - 1].push(item)
    else runs.push([item])
    lastKey = k
  }
  return runs
}


