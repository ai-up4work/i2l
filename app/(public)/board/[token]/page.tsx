// app/(public)/board/[token]/page.tsx
//
// A board someone shared ("Copy link" on a board). Boards are saved to the
// account now (data/wishdrop-account-sync.sql), so a shared link opens on
// any device. Only boards set to "Anyone with the link" or public show.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { imageThumb } from '@/lib/media'
import type { BoardItem } from '@/contexts/Wishlistcontext'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Shared board', robots: { index: false, follow: false } }

function itemHref(item: BoardItem): string {
  try {
    const u = new URL(item.url)
    return u.hostname.endsWith('wishdrop.shop') ? u.pathname + u.search : item.url
  } catch {
    return item.url
  }
}

export default async function SharedBoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length > 64) notFound()
  const { data } = await createServiceRoleClient()
    .from('boards')
    .select('name, description, visibility, items, updated_at')
    .eq('share_token', token)
    .in('visibility', ['link', 'public'])
    .maybeSingle()
  if (!data) notFound()
  const board = data as unknown as { name: string; description: string | null; items: BoardItem[] | null; updated_at: string }
  const items = (Array.isArray(board.items) ? board.items : []).slice().sort((a, b) => a.position - b.position)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-8">
      <p className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-teal-deep">Shared board</p>
      <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">{board.name}</h1>
      {board.description && <p className="mt-1 max-w-2xl text-sm text-ink/60">{board.description}</p>}
      <p className="mt-1 text-xs text-ink/45">{items.length} {items.length === 1 ? 'item' : 'items'}</p>

      {items.length === 0 ? (
        <p className="mt-10 rounded-3xl bg-card py-14 text-center text-sm text-ink/55 ring-1 ring-ink/10">This board is empty.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <a key={item.id} href={itemHref(item)} className="group min-w-0 overflow-hidden rounded-2xl bg-card ring-1 ring-ink/10">
              <span className="block aspect-[3/4] overflow-hidden bg-parchment">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageThumb(item.image, 400)} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : null}
              </span>
              <span className="block p-3">
                <span className="line-clamp-2 text-sm font-medium text-ink">{item.title}</span>
                {item.variant?.value && <span className="mt-0.5 block truncate text-xs text-ink/50">{item.variant.value}</span>}
              </span>
            </a>
          ))}
        </div>
      )}

      <Link href="/stores" className="mt-10 inline-flex items-center gap-1.5 rounded-full bg-indigo px-5 py-2.5 text-sm font-semibold text-parchment">
        Shop on Wishdrop <ArrowRight size={14} />
      </Link>
    </div>
  )
}
