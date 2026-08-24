export default function GiftBanner() {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-16 lg:px-10">
      <div className="rounded-[28px] bg-ink px-10 py-12 text-paper">
        <h3 className="font-display text-2xl sm:text-3xl">
          Welcome gift: <em className="not-italic text-gold">sign up for Rs 1,200 off</em>
        </h3>
        <p className="mt-2 max-w-md text-sm text-paper/60">
          New here? You&apos;ll get money off shipping for your first order.
        </p>
        <a
          href="/account"
          className="mt-6 inline-flex rounded-full bg-gold px-7 py-3 text-sm font-semibold text-ink transition-colors hover:bg-gold/90"
        >
          Sign up
        </a>
      </div>
    </section>
  )
}
