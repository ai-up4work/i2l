'use client'

import { useState } from 'react'
import { Heart, MessageCircle, Send } from 'lucide-react'
import { communityPosts } from './data'

export default function ShoppingCommunityPage() {
  const [draft, setDraft] = useState('')

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16 pt-8 lg:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Shopping community</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink/60">
        Reviews, tips, and unboxings from other members — post your own once your next parcel lands.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          setDraft('')
        }}
        className="mt-8 flex flex-col gap-3 rounded-2xl border border-dashed border-ink/20 bg-card p-6"
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Share a tip, a review, or show off your latest unboxing…"
          className="min-h-[80px] resize-y rounded-xl border border-ink/15 bg-paper p-4 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-gold/50"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="ml-auto flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:bg-ink/25"
        >
          <Send size={15} /> Post
        </button>
      </form>

      <div className="mt-8 flex flex-col gap-4">
        {communityPosts.map((post) => (
          <article key={post.user} className="rounded-2xl border border-ink/10 bg-card p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-blue text-sm font-bold text-paper">
                {post.user[0].toUpperCase()}
              </span>
              <div>
                <p className="font-semibold text-ink">@{post.user}</p>
                <span className="font-mono text-[11px] uppercase tracking-widest text-rust">{post.tag}</span>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-ink/75">{post.content}</p>

            <div className="mt-4 flex items-center gap-5 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Heart size={15} /> {post.likes}
              </span>
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
