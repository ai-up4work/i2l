// app/(public)/blog/[slug]/page.tsx — /blog/<slug>
//
// Blog post page. Content: content/blog.ts. Structured data: Article
// (+ FAQPage when the post has FAQs) + Breadcrumbs.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CtaEnvelope, FAQ, PageHero, Section } from '@/components/public/PageKit'
import JsonLd, { articleSchema, breadcrumbSchema, faqSchema } from '@/components/seo/JsonLd'
import { BLOG_POSTS, getBlogPost } from '@/content/blog'
import { pageMetadata } from '@/lib/seo'

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }))
}
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const post = getBlogPost((await params).slug)
  if (!post) return {}
  return pageMetadata({ title: post.title, description: post.description, path: `/blog/${post.slug}`, type: 'article' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getBlogPost((await params).slug)
  if (!post) notFound()
  const path = `/blog/${post.slug}`

  return (
    <main>
      <JsonLd
        data={[
          articleSchema({
            title: post.title,
            description: post.description,
            path,
            datePublished: post.published,
            dateModified: post.updated,
          }),
          ...(post.faqs?.length ? [faqSchema(post.faqs)] : []),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: post.title, path },
          ]),
        ]}
      />

      <PageHero
        eyebrow={post.tag}
        title={post.title}
        meta={
          <>
            By {post.author} · <time dateTime={post.published}>{formatDate(post.published)}</time>
            {post.updated && post.updated !== post.published && (
              <>
                {' '}· Updated <time dateTime={post.updated}>{formatDate(post.updated)}</time>
              </>
            )}
          </>
        }
      />

      <Section>
        <article className="max-w-3xl font-body text-[16px] leading-relaxed text-ink/75">
          {post.sections.map((s) => (
            <section key={s.heading} className="mb-9">
              <h2 className="mb-3 font-display text-2xl font-semibold text-indigo">{s.heading}</h2>
              {s.paragraphs.map((p) => (
                <p key={p} className="mb-3">{p}</p>
              ))}
              {s.bullets && (
                <ul className="mt-2 space-y-2">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex gap-3">
                      <span aria-hidden className="mt-2.5 h-1.5 w-1.5 flex-none rounded-full bg-gold" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {post.related?.length ? (
            <aside className="rounded-2xl bg-card p-5 ring-1 ring-ink/[0.08]">
              <p className="font-body text-xs font-semibold uppercase tracking-[0.16em] text-teal-deep">Read next</p>
              <ul className="mt-2 space-y-1.5">
                {post.related.map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="font-semibold text-indigo underline decoration-teal/40 underline-offset-4 hover:decoration-teal">
                      {r.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </article>
      </Section>

      {post.faqs?.length ? (
        <Section eyebrow="Questions" title="FAQs">
          <FAQ items={post.faqs} />
        </Section>
      ) : null}

      <CtaEnvelope
        title="Shopping from India?"
        accent="We’ll drop it."
        text="See the delivered price in rupees before you commit."
        primary={{ href: '/estimate', label: 'Price an item' }}
        secondary={{ href: '/shop-from-india', label: 'Store guides' }}
      />
    </main>
  )
}
