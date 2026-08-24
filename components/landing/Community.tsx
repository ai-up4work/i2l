import { Heart } from 'lucide-react'
import { community } from './data'

export default function Community() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
      <div className="flex flex-col gap-14 lg:flex-row lg:items-start">
        <div className="lg:w-80 lg:flex-none">
          <h2 className="font-display text-4xl text-ink">Shopping community</h2>
          <p className="mt-4 text-sm leading-relaxed text-ink/60">
            Find shopping tips and amazing deals from millions of members all
            over the world.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="/account"
              className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
            >
              View posts
            </a>
            <a
              href="#"
              className="rounded-full border-2 border-ink px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              Learn more
            </a>
          </div>

          <ul className="mt-8 flex flex-col gap-3 text-sm text-ink/70">
            {['Check out product reviews', 'Get shopping tips', 'Enjoy limited-time deals'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="font-semibold text-gold">&#10003;</span> {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid flex-1 grid-cols-3 gap-4">
          {community.map((post) => (
            <figure key={post.user} className="overflow-hidden rounded-xl bg-ink/5">
              <img src={post.img} alt="" className="aspect-square w-full object-cover" />
              <figcaption className="flex items-center gap-1.5 px-2.5 py-2 text-xs text-ink/60">
                @{post.user} <Heart size={12} aria-hidden="true" /> {post.likes}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
