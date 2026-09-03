export default function GiftBanner() {
  return (
    <div className="relative h-full overflow-hidden rounded-[28px] bg-ink px-10 py-12 text-parchment">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gold/10 blur-3xl" aria-hidden="true" />

      <div className="relative">
        <h3 className="font-display text-2xl sm:text-3xl">
          Welcome gift: <em className="not-italic text-gold">sign up for Rs 1,200 off</em>
        </h3>
        <p className="mt-2 max-w-md font-body text-sm text-parchment/60">
          New here? You&apos;ll get money off shipping for your first order.
        </p>
        <a
          href="/account"
          className="mt-6 inline-flex rounded-full bg-gold px-7 py-3 font-body text-sm font-semibold text-ink transition-colors hover:bg-gold-deep"
        >
          Sign up
        </a>
      </div>
    </div>
  )
}