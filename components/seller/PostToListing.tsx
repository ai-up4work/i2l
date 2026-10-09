// components/seller/PostToListing.tsx
//
// The seller side's one illustration: an Instagram-style post on the left
// becomes a Wishdrop listing on the right, stamped with an airmail
// postmark. It says the whole pitch without words: "the post you already
// make becomes a product Sri Lankan shoppers can buy". Pure CSS/SVG, no
// image files. One entrance moment, skipped when reduced motion is on.

const fabric =
  'repeating-linear-gradient(135deg, #b5651d 0 14px, #c98a2a 14px 22px, #8c2f39 22px 30px, #c98a2a 30px 38px)'
const border = 'repeating-linear-gradient(90deg, #f0a93a 0 6px, #8c2f39 6px 12px)'

export default function PostToListing({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`relative mx-auto flex items-center justify-center ${compact ? 'gap-3' : 'gap-5'} [--d:0ms] motion-safe:[&>*]:animate-[ptl-in_700ms_cubic-bezier(.16,1,.3,1)_both]`}
      aria-hidden="true"
    >
      <style>{`@keyframes ptl-in{from{opacity:0;transform:translateY(14px) rotate(var(--r,0deg))}to{opacity:1;transform:translateY(0) rotate(var(--r,0deg))}}`}</style>

      {/* The post */}
      <div
        className={`${compact ? 'w-32' : 'w-44 sm:w-48'} flex-none rounded-2xl bg-white p-2 text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,.55)]`}
        style={{ transform: 'rotate(-4deg)', ['--r' as string]: '-4deg' }}
      >
        <div className="flex items-center gap-1.5 px-1 pb-1.5">
          <span className="h-5 w-5 rounded-full p-[1.5px]" style={{ background: 'conic-gradient(#f0a93a,#c1272d,#7a3b69,#f0a93a)' }}>
            <span className="block h-full w-full rounded-full border border-white" style={{ background: fabric }} />
          </span>
          <span className="text-[10px] font-semibold">meera.handlooms</span>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-lg" style={{ background: fabric }}>
          <div className="absolute inset-x-0 bottom-0 h-4" style={{ background: border }} />
        </div>
        <div className="flex gap-2 px-1 pt-1.5 text-ink/70">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z" /></svg>
        </div>
        <p className="px-1 pb-1 pt-0.5 text-[10px] leading-snug text-ink/75">
          <span className="font-semibold text-ink">meera.handlooms</span> New temple border drop. DM to order
        </p>
      </div>

      {/* The hop between them: a dashed flight path */}
      <svg className={`${compact ? 'w-8' : 'w-12'} flex-none text-white/60`} viewBox="0 0 48 24" fill="none" style={{ animationDelay: '150ms' }}>
        <path d="M2 18 C 16 2, 30 2, 44 12" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 4" strokeLinecap="round" />
        <path d="M38 8 L45 12 L38 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {/* The listing */}
      <div
        className={`${compact ? 'w-36' : 'w-48 sm:w-52'} relative flex-none rounded-2xl bg-parchment p-2.5 text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,.55)]`}
        style={{ transform: 'rotate(3deg)', ['--r' as string]: '3deg', animationDelay: '280ms' }}
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg" style={{ background: fabric }}>
          <div className="absolute inset-x-0 bottom-0 h-4" style={{ background: border }} />
          <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/90">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#c1272d"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>
          </span>
        </div>
        <p className="mt-2 text-[13px] font-bold">Rs 9,444</p>
        <p className="text-[10px] leading-snug text-ink/65">Temple border silk saree</p>
        <p className="mt-1.5 inline-block rounded-full bg-teal/10 px-2 py-0.5 text-[9px] font-semibold text-teal-deep">Delivered in Colombo</p>

        {/* Airmail postmark */}
        <svg className={`absolute ${compact ? '-right-4 -top-5 h-16 w-16' : '-right-6 -top-7 h-20 w-20'}`} viewBox="0 0 100 100">
          <defs>
            <path id="ptl-ring" d="M50 50 m-34 0 a34 34 0 1 1 68 0 a34 34 0 1 1 -68 0" />
          </defs>
          <circle cx="50" cy="50" r="44" fill="none" stroke="#1E3A5F" strokeWidth="2.5" opacity=".85" />
          <circle cx="50" cy="50" r="25" fill="none" stroke="#1E3A5F" strokeWidth="1.5" opacity=".85" />
          <text fontSize="9.5" fontWeight="700" fill="#1E3A5F" opacity=".9" letterSpacing="1.5">
            <textPath href="#ptl-ring">INDIA · SRI LANKA · WISHDROP ·</textPath>
          </text>
          <text x="50" y="55" textAnchor="middle" fontSize="14" fontWeight="800" fill="#C1272D">AIR</text>
        </svg>
      </div>
    </div>
  )
}
