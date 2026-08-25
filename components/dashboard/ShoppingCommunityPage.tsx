'use client'

import { useState } from 'react'
import { Heart, MessageCircle, Send } from 'lucide-react'
import { communityPosts } from './data'

// Deterministic avatar color per username so the feed doesn't read as one
// repeated blue circle — same person always gets the same color.
const AVATAR_COLORS = ['bg-blue', 'bg-rust', 'bg-gold', 'bg-ink', 'bg-blue-deep']
function avatarColor(name: string) {
  const hash = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

type Post = (typeof communityPosts)[number] & {
  id: string
  liked: boolean
}

export default function ShoppingCommunityPage() {
  const [draft, setDraft] = useState('')
  const [posts, setPosts] = useState<Post[]>(
    communityPosts.map((post, i) => ({ ...post, id: `${post.user}-${i}`, liked: false }))
  )
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [likePulse, setLikePulse] = useState<Record<string, number>>({})

  function submitPost(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return

    const newPost: Post = {
      id: `you-${Date.now()}`,
      user: 'you',
      tag: 'New',
      content: draft.trim(),
      likes: 0,
      comments: 0,
      liked: false,
    }

    setPosts((prev) => [newPost, ...prev])
    setDraft('')
    setHighlightId(newPost.id)
    setTimeout(() => setHighlightId((current) => (current === newPost.id ? null : current)), 1800)
  }

  function toggleLike(id: string) {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === id ? { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) } : post
      )
    )
    setLikePulse((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16 pt-8 lg:px-10">
      <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 motion-safe:[animation:fadeUp_0.35s_ease-out_both]">
        Shopping community
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink/60">
        Reviews, tips, and unboxings from other members — post your own once your next parcel lands.
      </p>

      <form
        onSubmit={submitPost}
        className="mt-8 flex flex-col gap-3 rounded-2xl border border-dashed border-ink/20 bg-card p-6 transition-colors focus-within:border-gold/50 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '60ms' }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Share a tip, a review, or show off your latest unboxing…"
          className="min-h-[80px] resize-y rounded-xl border border-ink/15 bg-paper p-4 text-sm outline-none transition-shadow placeholder:text-muted focus:ring-2 focus:ring-gold/50"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">{draft.length > 0 ? `${draft.length} characters` : ' '}</span>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-all duration-200 hover:bg-blue-deep active:scale-95 disabled:cursor-not-allowed disabled:bg-ink/25 disabled:active:scale-100"
          >
            <Send size={15} /> Post
          </button>
        </div>
      </form>

      <div className="mt-8 flex flex-col gap-4">
        {posts.map((post, i) => (
          <article
            key={post.id}
            className={`rounded-2xl border bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-ink/5 motion-safe:[animation:fadeUp_0.4s_ease-out_both] ${
              highlightId === post.id ? 'border-rust/40 ring-2 ring-rust/15' : 'border-ink/10'
            }`}
            style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <span
                className={`grid h-10 w-10 flex-none place-items-center rounded-full text-sm font-bold text-paper ${avatarColor(post.user)}`}
              >
                {post.user[0].toUpperCase()}
              </span>
              <div>
                <p className="font-semibold text-ink">@{post.user}</p>
                <span className="font-mono text-[11px] uppercase tracking-widest text-rust">{post.tag}</span>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-ink/75">{post.content}</p>

            <div className="mt-4 flex items-center gap-5 text-sm text-muted">
              <button
                onClick={() => toggleLike(post.id)}
                className={`flex items-center gap-1.5 transition-colors ${post.liked ? 'text-rust' : 'hover:text-ink/70'}`}
              >
                <span key={likePulse[post.id] ?? 0} className="motion-safe:[animation:heartPop_0.35s_ease-out]">
                  <Heart size={15} fill={post.liked ? 'currentColor' : 'none'} />
                </span>
                {post.likes}
              </button>
              <span className="flex items-center gap-1.5">
                <MessageCircle size={15} /> {post.comments}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}