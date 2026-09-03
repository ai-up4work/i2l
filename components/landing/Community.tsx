import { Heart } from 'lucide-react'
import { community } from './data'

export default function Community() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
      <div className="flex flex-col gap-14 lg:flex-row lg:items-start">
        <div className="lg:w-80 lg:flex-none">
          <h2 className="font-display text-4xl text-ink">Shopping community</h2>
          <p className="mt-4 font-body text-sm leading-relaxed text-ink/60">
            Find shopping tips and amazing deals from millions of members all
            over the world.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="/account"
              className="rounded-full bg-ink px-6 py-3 font-body text-sm font-semibold text-parchment transition-colors hover:bg-teal-deep"
            >
              View posts
            </a>
            <a
              href="#"
              className="rounded-full border-2 border-ink px-6 py-3 font-body text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-parchment"
            >
              Learn more
            </a>
          </div>

          <ul className="mt-8 flex flex-col gap-3 font-body text-sm text-ink/70">
            {['Check out product reviews', 'Get shopping tips', 'Enjoy limited-time deals'].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-gold/15 text-[10px] font-bold text-gold-deep">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* 2 columns on mobile, 6 columns on desktop */}
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {community.map((post) => (
            <figure
              key={post.user}
              className="group overflow-hidden rounded-xl bg-ink/5 transition-shadow duration-300 hover:shadow-lg"
            >
              <div className="overflow-hidden">
                <img
                  src={post.img}
                  alt=""
                  className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <figcaption className="flex items-center justify-between px-2.5 py-2 font-body text-xs text-ink/60">
                <span className="truncate">@{post.user}</span>
                <span className="flex flex-none items-center gap-1">
                  <Heart size={12} className="text-gold" fill="currentColor" aria-hidden="true" />
                  {post.likes}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}