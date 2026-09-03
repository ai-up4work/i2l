'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Heart,
  ImagePlus,
  Images,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  X,
  Check,
  CornerDownRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import Image from 'next/image'
import { communityPosts } from './data'

const AVATAR_COLORS = [
  'bg-[#b5482f]', // terracotta
  'bg-[#2c4257]', // deep stone-blue
  'bg-[#8f6b3f]', // warm brown
  'bg-[#4a5a45]', // olive
  'bg-[#6b4a63]', // muted plum
  'bg-[#1c1a17]', // ink
]
function avatarColor(name: string) {
  const hash = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

const CURRENT_USER = 'you'

type Comment = {
  id: string
  user: string
  content: string
  replies: Comment[]
}

type Post = Omit<(typeof communityPosts)[number], 'image'> & {
  id: string
  liked: boolean
  avatar?: string
  images?: string[]
  edited?: boolean
  threadComments: Comment[]
}

function Avatar({ user, avatar, size = 10 }: { user: string; avatar?: string; size?: 8 | 10 }) {
  const [imgError, setImgError] = useState(false)
  const dim = size === 8 ? 'h-8 w-8' : 'h-10 w-10'

  if (avatar && !imgError) {
    return (
      <img
        src={avatar}
        alt={`@${user}`}
        onError={() => setImgError(true)}
        className={`${dim} flex-none rounded-full border border-ink/10 object-cover`}
      />
    )
  }

  return (
    <span
      className={`grid ${dim} flex-none place-items-center rounded-full text-xs font-bold text-paper ${avatarColor(user)}`}
    >
      {user[0].toUpperCase()}
    </span>
  )
}

// Recursively counts a comment and all its nested replies, so the header
// count reflects the full thread depth, not just top-level comments.
function countComments(comments: Comment[]): number {
  return comments.reduce((total, c) => total + 1 + countComments(c.replies), 0)
}

// Fullscreen image viewer for a post's photo set. Supports click-through
// navigation and keyboard control (arrows + escape).
function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: string[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % images.length)
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, images.length, onIndexChange, onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-6 motion-safe:[animation:scaleIn_0.15s_ease-out_both]"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close gallery"
        className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-paper/10 text-paper transition-colors hover:bg-paper/20"
      >
        <X size={18} />
      </button>

      {images.length > 1 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onIndexChange((index - 1 + images.length) % images.length)
          }}
          aria-label="Previous image"
          className="absolute left-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-paper/10 text-paper transition-colors hover:bg-paper/20"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      <img
        src={images[index]}
        alt={`Photo ${index + 1} of ${images.length}`}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain motion-safe:[animation:scaleIn_0.2s_ease-out_both]"
      />

      {images.length > 1 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onIndexChange((index + 1) % images.length)
          }}
          aria-label="Next image"
          className="absolute right-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-paper/10 text-paper transition-colors hover:bg-paper/20"
        >
          <ChevronRight size={20} />
        </button>
      )}

      {images.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-paper/10 px-3 py-1 text-xs font-semibold text-paper">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  )
}

// Thumbnail collage shown on the left of a post card. Single image fills the
// column; 2+ images lay out in a grid, with a "+N" overlay if there are more
// than four. Clicking any tile opens the lightbox at that image's index.
function PostImages({ images, onOpen }: { images: string[]; onOpen: (index: number) => void }) {
  // Single photo: flush against the card, no stacking needed.
  if (images.length === 1) {
    return (
      <button
        type="button"
        onClick={() => onOpen(0)}
        aria-label="View photo"
        className="h-48 w-full flex-none overflow-hidden border-b border-ink/10 sm:h-auto sm:w-48 sm:border-b-0 sm:border-r"
      >
        <img
          src={images[0]}
          alt=""
          className="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
        />
      </button>
    )
  }

  // Multiple photos: fan the first few out like a stack in a folder.
  const backLayers = images.slice(1, 3)

  return (
    <div className="h-48 flex-none border-b border-ink/10 bg-ink/[0.03] p-4 sm:h-auto sm:w-48 sm:border-b-0 sm:border-r">
      <button
        type="button"
        onClick={() => onOpen(0)}
        aria-label={`View photo gallery, ${images.length} photos`}
        className="group relative block h-full w-full"
      >
        {backLayers.map((src, idx) => {
          const depth = backLayers.length - idx
          const rotate = idx % 2 === 0 ? -(4 + depth * 2) : 4 + depth * 2
          return (
            <img
              key={idx}
              src={src}
              alt=""
              aria-hidden
              style={{ transform: `rotate(${rotate}deg)`, zIndex: idx }}
              className="absolute inset-0 h-full w-full rounded-xl border border-ink/10 object-cover shadow-sm"
            />
          )
        })}

        <img
          src={images[0]}
          alt=""
          style={{ zIndex: backLayers.length + 1 }}
          className="absolute inset-0 h-full w-full rounded-xl border border-ink/10 object-cover shadow-md transition-transform duration-200 group-hover:-translate-y-1"
        />

        <span
          style={{ zIndex: backLayers.length + 2 }}
          className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-semibold text-paper"
        >
          <Images size={11} /> {images.length}
        </span>
      </button>
    </div>
  )
}

export default function ShoppingCommunityPage() {
  const [draft, setDraft] = useState('')
  const [draftImages, setDraftImages] = useState<{ file: File; previewUrl: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [posts, setPosts] = useState<Post[]>(
    communityPosts.map((post, i) => {
      const { image, ...rest } = post as typeof post & { image?: string }
      return {
        ...rest,
        id: `${post.user}-${i}`,
        liked: false,
        threadComments: [],
        images: image ? [image] : undefined,
      }
    })
  )
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [likePulse, setLikePulse] = useState<Record<string, number>>({})

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Thread UI state
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  // Which comment (by "postId:commentId") is currently showing a reply box.
  const [replyTarget, setReplyTarget] = useState<string | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})

  // Gallery lightbox state: which post's images are open, and at what index.
  const [lightbox, setLightbox] = useState<{ postId: string; index: number } | null>(null)
  const lightboxPost = lightbox ? posts.find((p) => p.id === lightbox.postId) : null

  useEffect(() => {
    return () => {
      draftImages.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleImagePick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return
    setDraftImages((prev) => [...prev, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))])
    event.target.value = ''
  }

  function removeDraftImage(index: number) {
    setDraftImages((prev) => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  function submitPost(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.trim() && draftImages.length === 0) return

    const newPost: Post = {
      id: `you-${Date.now()}`,
      user: CURRENT_USER,
      tag: 'New',
      content: draft.trim(),
      likes: 0,
      comments: 0,
      liked: false,
      images: draftImages.length > 0 ? draftImages.map((img) => img.previewUrl) : undefined,
      threadComments: [],
    }

    setPosts((prev) => [newPost, ...prev])
    setDraft('')
    setDraftImages([])
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

  function startEdit(post: Post) {
    setOpenMenuId(null)
    setConfirmDeleteId(null)
    setEditingId(post.id)
    setEditDraft(post.content)
  }
  function cancelEdit() {
    setEditingId(null)
    setEditDraft('')
  }
  function saveEdit(id: string) {
    const trimmed = editDraft.trim()
    if (!trimmed) return
    setPosts((prev) => prev.map((post) => (post.id === id ? { ...post, content: trimmed, edited: true } : post)))
    setEditingId(null)
    setEditDraft('')
  }
  function requestDelete(id: string) {
    setOpenMenuId(null)
    setConfirmDeleteId(id)
  }
  function confirmDelete(id: string) {
    setPosts((prev) => {
      const target = prev.find((p) => p.id === id)
      target?.images?.forEach((src) => URL.revokeObjectURL(src))
      return prev.filter((p) => p.id !== id)
    })
    setConfirmDeleteId(null)
    setLightbox((current) => (current?.postId === id ? null : current))
  }

  function toggleThread(postId: string) {
    setOpenThreadId((current) => (current === postId ? null : postId))
    setReplyTarget(null)
  }

  function submitComment(postId: string) {
    const text = (commentDrafts[postId] ?? '').trim()
    if (!text) return

    const newComment: Comment = { id: `c-${Date.now()}`, user: CURRENT_USER, content: text, replies: [] }
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId ? { ...post, threadComments: [...post.threadComments, newComment] } : post
      )
    )
    setCommentDrafts((prev) => ({ ...prev, [postId]: '' }))
  }

  function submitReply(postId: string, parentCommentId: string) {
    const key = `${postId}:${parentCommentId}`
    const text = (replyDrafts[key] ?? '').trim()
    if (!text) return

    const newReply: Comment = { id: `r-${Date.now()}`, user: CURRENT_USER, content: text, replies: [] }
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post
        return {
          ...post,
          threadComments: post.threadComments.map((c) =>
            c.id === parentCommentId ? { ...c, replies: [...c.replies, newReply] } : c
          ),
        }
      })
    )
    setReplyDrafts((prev) => ({ ...prev, [key]: '' }))
    setReplyTarget(null)
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      {/* Guarantees the fadeUp/scaleIn/heartPop keyframes exist even if
          missing from global CSS — mirrors HomePage's inline style block
          so cards and interactions animate consistently across pages. */}
      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes heartPop {
          0% { transform: scale(1); }
          40% { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Header block — identical treatment to HomePage's hero, and scoped
          to the left/middle column only (nested inside the grid below)
          so the illustration never bleeds behind the guidelines sidebar. */}
      <div className="grid gap-8 mt-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:-mt-20 lg:items-start">
        <div className="min-w-0">
          <div className="relative -mt-24 flex min-h-[220px] flex-col justify-end overflow-hidden pt-8 sm:min-h-[260px]">
            <div
              className="absolute inset-0 z-0"
              style={{
                maskImage:
                  'radial-gradient(ellipse 75% 85% at 60% 35%, black 55%, transparent 100%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 75% 85% at 60% 35%, black 55%, transparent 100%)',
              }}
            >
              <Image
                src="/Refs/top-main-bg.png"
                alt=""
                fill
                sizes="(min-width: 1024px) 70vw, 100vw"
                className="object-cover object-top"
              />
            </div>

            <div className="relative z-10">
              <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink motion-safe:[animation:fadeUp_0.35s_ease-out_both]">
                Shopping community
              </h1>
              <p className="mt-2 max-w-3xl text-sm mb-4 leading-relaxed text-ink/70 font-semibold motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
                Reviews, tips, and unboxings from other members — post your own once your next parcel lands.
              </p>
            </div>
          </div>

          <form
            onSubmit={submitPost}
            className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-card p-6 mt-8 transition-colors focus-within:border-gold/50 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
            style={{ animationDelay: '60ms' }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Share a tip, a review, or show off your latest unboxing…"
              className="min-h-[80px] resize-y rounded-xl border border-ink/15 bg-parchment p-4 text-sm outline-none transition-shadow placeholder:text-ink/35 focus:ring-2 focus:ring-gold/50"
            />

            {draftImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {draftImages.map((img, idx) => (
                  <div key={img.previewUrl} className="relative w-fit motion-safe:[animation:scaleIn_0.25s_ease-out_both]">
                    <img
                      src={img.previewUrl}
                      alt="Selected upload preview"
                      className="h-28 w-28 rounded-xl border border-ink/10 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeDraftImage(idx)}
                      aria-label="Remove image"
                      className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-parchment shadow-sm transition-transform duration-150 hover:scale-110 active:scale-95"
                    >
                      <X size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImagePick}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-full border border-ink/15 bg-parchment px-3.5 py-1.5 text-xs font-semibold text-ink/70 transition-colors hover:border-gold/50 hover:text-ink"
                >
                  <ImagePlus size={14} /> {draftImages.length > 0 ? 'Add more photos' : 'Add photos'}
                </button>
                <span className="text-xs text-ink/40">{draft.length > 0 ? `${draft.length} characters` : ' '}</span>
              </div>
              <button
                type="submit"
                disabled={!draft.trim() && draftImages.length === 0}
                className="flex items-center gap-2 rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-indigo-deep active:scale-95 disabled:cursor-not-allowed disabled:bg-ink/25 disabled:active:scale-100"
              >
                <Send size={15} /> Post
              </button>
            </div>
          </form>

          <div className="mt-6 flex flex-col gap-4">
            {posts.map((post, i) => {
              const isOwn = post.user === CURRENT_USER
              const isEditing = editingId === post.id
              const isConfirmingDelete = confirmDeleteId === post.id
              const isMenuOpen = openMenuId === post.id
              const isThreadOpen = openThreadId === post.id
              const totalComments = post.comments + countComments(post.threadComments)
              const hasImages = !!post.images && post.images.length > 0

              return (
                <article
                  key={post.id}
                  className={`relative flex overflow-hidden rounded-2xl border bg-card transition-colors duration-300 hover:bg-ink/[0.015] motion-safe:[animation:fadeUp_0.4s_ease-out_both] ${
                    hasImages ? 'flex-col sm:flex-row' : 'flex-col'
                  } ${highlightId === post.id ? 'border-rust/40 ring-2 ring-rust/15' : 'border-ink/10'}`}
                  style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
                >
                  {hasImages && (
                    <PostImages
                      images={post.images!}
                      onOpen={(index) => setLightbox({ postId: post.id, index })}
                    />
                  )}

                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Avatar user={post.user} avatar={post.avatar} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">@{post.user}</p>
                          <span className="font-mono text-[11px] uppercase tracking-widest text-rust">{post.tag}</span>
                        </div>
                      </div>

                      {isOwn && (
                        <div className="relative flex-none">
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(isMenuOpen ? null : post.id)}
                            aria-label="Post options"
                            className="grid h-8 w-8 place-items-center rounded-full border border-ink/15 bg-parchment text-ink/60 transition-colors hover:bg-ink/10 hover:text-ink"
                          >
                            <MoreHorizontal size={16} />
                          </button>

                          {isMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                              <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-xl border border-ink/10 bg-card shadow-lg motion-safe:[animation:scaleIn_0.15s_ease-out_both]">
                                <button
                                  type="button"
                                  onClick={() => startEdit(post)}
                                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-ink/5"
                                >
                                  <Pencil size={14} /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDelete(post.id)}
                                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-rust transition-colors hover:bg-rust/5"
                                >
                                  <Trash2 size={14} /> Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mt-4 flex flex-col gap-2">
                        <textarea
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          autoFocus
                          className="min-h-[70px] resize-y rounded-xl border border-ink/15 bg-parchment p-3 text-sm outline-none focus:ring-2 focus:ring-gold/50"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink/60 transition-colors hover:bg-ink/5"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(post.id)}
                            disabled={!editDraft.trim()}
                            className="flex items-center gap-1.5 rounded-lg bg-teal-deep px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:bg-ink/25"
                          >
                            <Check size={13} /> Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm leading-relaxed text-ink/75">
                        {post.content}
                        {post.edited && <span className="ml-1.5 text-xs italic text-ink/35">(edited)</span>}
                      </p>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-5 text-sm text-ink/45">
                      <div className="flex items-center gap-5">
                        <button
                          onClick={() => toggleLike(post.id)}
                          className={`flex items-center gap-1.5 transition-colors ${post.liked ? 'text-rust' : 'hover:text-ink/70'}`}
                        >
                          <span key={likePulse[post.id] ?? 0} className="motion-safe:[animation:heartPop_0.35s_ease-out]">
                            <Heart size={15} fill={post.liked ? 'currentColor' : 'none'} />
                          </span>
                          {post.likes}
                        </button>
                        <button
                          onClick={() => toggleThread(post.id)}
                          className={`flex items-center gap-1.5 transition-colors ${isThreadOpen ? 'text-ink' : 'hover:text-ink/70'}`}
                        >
                          <MessageCircle size={15} /> {totalComments}
                        </button>
                      </div>

                      {isConfirmingDelete && (
                        <div className="flex items-center gap-2 motion-safe:[animation:scaleIn_0.15s_ease-out_both]">
                          <span className="text-xs text-ink/50">Delete?</span>
                          <button
                            type="button"
                            onClick={() => confirmDelete(post.id)}
                            className="rounded-full bg-rust px-2.5 py-1 text-xs font-semibold text-parchment transition-colors hover:bg-rust-deep"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-full px-2.5 py-1 text-xs font-semibold text-ink/60 transition-colors hover:bg-ink/5"
                          >
                            No
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Comment thread */}
                    {isThreadOpen && (
                      <div className="mt-4 flex flex-col gap-4 border-t border-ink/10 pt-4 motion-safe:[animation:fadeUp_0.25s_ease-out_both]">
                        {post.threadComments.length === 0 && (
                          <p className="text-sm text-ink/40">No comments yet — start the conversation.</p>
                        )}

                        {post.threadComments.map((comment) => {
                          const replyKey = `${post.id}:${comment.id}`
                          const isReplying = replyTarget === replyKey

                          return (
                            <div key={comment.id} className="flex flex-col gap-3">
                              <div className="flex items-start gap-2.5">
                                <Avatar user={comment.user} size={8} />
                                <div className="min-w-0 flex-1">
                                  <div className="rounded-2xl bg-ink/[0.04] px-3.5 py-2.5">
                                    <p className="text-xs font-semibold text-ink">@{comment.user}</p>
                                    <p className="mt-0.5 text-sm leading-relaxed text-ink/75">{comment.content}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setReplyTarget(isReplying ? null : replyKey)}
                                    className="mt-1 ml-1 text-xs font-semibold text-ink/45 transition-colors hover:text-ink"
                                  >
                                    Reply
                                  </button>

                                  {/* Nested replies */}
                                  {comment.replies.length > 0 && (
                                    <div className="mt-2 flex flex-col gap-2 border-l-2 border-ink/10 pl-3">
                                      {comment.replies.map((reply) => (
                                        <div key={reply.id} className="flex items-start gap-2.5">
                                          <Avatar user={reply.user} size={8} />
                                          <div className="min-w-0 flex-1 rounded-2xl bg-ink/[0.04] px-3.5 py-2.5">
                                            <p className="text-xs font-semibold text-ink">@{reply.user}</p>
                                            <p className="mt-0.5 text-sm leading-relaxed text-ink/75">{reply.content}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {isReplying && (
                                    <div className="mt-2 flex items-center gap-2 pl-1 motion-safe:[animation:scaleIn_0.15s_ease-out_both]">
                                      <CornerDownRight size={14} className="flex-none text-ink/30" />
                                      <input
                                        value={replyDrafts[replyKey] ?? ''}
                                        onChange={(event) =>
                                          setReplyDrafts((prev) => ({ ...prev, [replyKey]: event.target.value }))
                                        }
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter') submitReply(post.id, comment.id)
                                        }}
                                        autoFocus
                                        placeholder={`Reply to @${comment.user}…`}
                                        className="flex-1 rounded-full border border-ink/15 bg-parchment px-3.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-gold/50"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => submitReply(post.id, comment.id)}
                                        disabled={!(replyDrafts[replyKey] ?? '').trim()}
                                        className="flex-none rounded-full bg-teal-deep p-2 text-white transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:bg-ink/25"
                                      >
                                        <Send size={13} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        {/* New top-level comment */}
                        <div className="flex items-center gap-2">
                          <Avatar user={CURRENT_USER} size={8} />
                          <input
                            value={commentDrafts[post.id] ?? ''}
                            onChange={(event) =>
                              setCommentDrafts((prev) => ({ ...prev, [post.id]: event.target.value }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') submitComment(post.id)
                            }}
                            placeholder="Write a comment…"
                            className="flex-1 rounded-full border border-ink/15 bg-parchment px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-gold/50"
                          />
                          <button
                            type="button"
                            onClick={() => submitComment(post.id)}
                            disabled={!(commentDrafts[post.id] ?? '').trim()}
                            className="flex-none rounded-full bg-teal-deep p-2.5 text-white transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:bg-ink/25"
                          >
                            <Send size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <aside className="hidden lg:flex lg:w-[330px] lg:flex-none flex-col self-start rounded-2xl border border-ink/10 bg-card p-6 mt-0 lg:mt-[196px] motion-safe:[animation:fadeUp_0.4s_ease-out_0.1s_both]">
          <h2 className="font-display text-lg text-ink">Community guidelines</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-ink/65">
            <li>Be honest — share real experiences with real sellers and couriers.</li>
            <li>No spam or unrelated promotions.</li>
            <li>Keep it respectful, even when venting about a delay.</li>
          </ul>
        </aside>
      </div>

      {lightboxPost?.images && lightbox && (
        <Lightbox
          images={lightboxPost.images}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox({ postId: lightboxPost.id, index })}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}