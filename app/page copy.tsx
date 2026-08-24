"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Globe2,
  Instagram,
  Link2,
  Package,
  Plane,
  Quote,
  ShieldCheck,
  ShoppingBag,
  Star,
  Tag,
  Truck,
  Users,
  WalletCards,
  Youtube,
} from "lucide-react";

const partners = [
  "DHL",
  "aramex",
  "BLUE DART",
  "DTDC",
  "FedEx",
];

const services = [
  {
    icon: ShoppingBag,
    title: "Shop Any Store",
    text: "Shop from any Indian website you love.",
  },
  {
    icon: Package,
    title: "We Receive",
    text: "We receive your items at our Indian warehouse.",
  },
  {
    icon: Package,
    title: "We Consolidate",
    text: "We pack and consolidate to save you more.",
  },
  {
    icon: Plane,
    title: "We Ship",
    text: "Fast & reliable shipping to Sri Lanka.",
  },
  {
    icon: Truck,
    title: "We Deliver",
    text: "Right to your doorstep, safely.",
  },
];

const steps = [
  {
    number: "01",
    icon: Link2,
    title: "Add Product Link",
    text: "Paste any product link from an Indian store.",
  },
  {
    number: "02",
    icon: ShoppingBag,
    title: "We Fetch Details",
    text: "We fetch product details and give you a quote.",
  },
  {
    number: "03",
    icon: WalletCards,
    title: "You Confirm",
    text: "Confirm and pay a small processing fee.",
  },
  {
    number: "04",
    icon: Package,
    title: "We Receive",
    text: "We receive your item at our Indian warehouse.",
  },
  {
    number: "05",
    icon: Plane,
    title: "We Ship",
    text: "We ship your parcel to Sri Lanka.",
  },
  {
    number: "06",
    icon: Globe2,
    title: "You Receive",
    text: "Get your parcel delivered to your doorstep.",
  },
];

const deals = [
  {
    brand: "Amazon.in",
    logo: "a",
    offer: "Up to 10% OFF",
    category: "Electronics & Accessories",
  },
  {
    brand: "Myntra",
    logo: "M",
    offer: "Up to 12% OFF",
    category: "Fashion & Lifestyle",
  },
  {
    brand: "Flipkart",
    logo: "F",
    offer: "Up to 10% OFF",
    category: "Mobiles & More",
  },
  {
    brand: "AJIO",
    logo: "AJIO",
    offer: "Up to 15% OFF",
    category: "Clothing & Footwear",
  },
  {
    brand: "Tata CLiQ",
    logo: "CLiQ",
    offer: "Up to 12% OFF",
    category: "Top Brands",
  },
];

const stats = [
  ["20,000+", "Happy Customers", Users],
  ["1.2M+", "Parcels Delivered", Package],
  ["150+", "Partner Stores", ShoppingBag],
  ["4–7 Days", "Average Delivery", Clock3],
  ["99.5%", "On-time Delivery", Check],
];

const testimonials = [
  {
    name: "Tharindu P.",
    city: "Colombo",
    text: "Best parcel forwarding service ever! Fast delivery and excellent customer support.",
  },
  {
    name: "Dilini K.",
    city: "Kandy",
    text: "I saved so much time and money. They handle everything so professionally.",
  },
];

function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#C1272D]">
      <span className="h-px w-8 bg-[#C1272D]" />
      {children}
      <span className="h-px w-8 bg-[#C1272D]" />
    </div>
  );
}

function PostalStamp({
  children,
  rotate = "-6deg",
}: {
  children: React.ReactNode;
  rotate?: string;
}) {
  return (
    <div
      style={{ transform: `rotate(${rotate})` }}
      className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-[#C1272D]/40 text-center font-mono text-[9px] font-bold uppercase tracking-wider text-[#C1272D]/60"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#C1272D]/30">
        {children}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#F7F3EA] text-[#1C1A17]">
      {/* =========================================================
          AIRMAIL TOP STRIPE
      ========================================================== */}
      <div
        className="h-3 w-full"
        style={{
          background:
            "repeating-linear-gradient(135deg,#1E3A5F 0px,#1E3A5F 30px,#F7F3EA 30px,#F7F3EA 48px,#C1272D 48px,#C1272D 78px,#F7F3EA 78px,#F7F3EA 96px)",
        }}
      />

      {/* =========================================================
          NAVBAR
      ========================================================== */}
      <header className="border-b border-[#1E3A5F]/10 bg-[#F7F3EA]/95">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
          {/* Logo */}
          <a href="#" className="flex items-center gap-3">
            <div className="flex h-11 w-9 items-center justify-center border-2 border-[#C1272D] text-[#C1272D]">
              <Plane size={20} />
            </div>

            <div className="leading-none">
              <div className="font-sans text-[15px] font-black tracking-tight text-[#122A47]">
                INDIA
              </div>
              <div className="font-mono text-[10px] font-bold text-[#C1272D]">
                2
              </div>
              <div className="font-sans text-[15px] font-black tracking-tight text-[#122A47]">
                LANKA
              </div>
            </div>
          </a>

          <nav className="hidden items-center gap-8 lg:flex">
            {[
              "How It Works",
              "Services",
              "Destinations",
              "Rates",
              "Deals",
              "Community",
            ].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replaceAll(" ", "-")}`}
                className="text-sm font-semibold text-[#122A47] transition hover:text-[#C1272D]"
              >
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <button className="hidden items-center gap-2 text-sm font-medium lg:flex">
              <Globe2 size={16} />
              EN
            </button>

            <button className="hidden text-sm font-semibold text-[#122A47] sm:block">
              Log in
            </button>

            <button className="rounded-md bg-[#D98E2B] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#c57e20]">
              Sign up
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================
          HERO
      ========================================================== */}
      <section className="relative">
        {/* decorative route */}
        <svg
          className="pointer-events-none absolute left-[44%] top-24 hidden h-[360px] w-[280px] lg:block"
          viewBox="0 0 280 360"
          fill="none"
        >
          <path
            d="M30 40 C220 30 230 140 100 175 C0 202 80 270 230 310"
            stroke="#D98E2B"
            strokeWidth="1.5"
            strokeDasharray="7 9"
          />
          <path
            d="M30 40 L38 35 M30 40 L34 49"
            stroke="#D98E2B"
            strokeWidth="1.5"
          />
        </svg>

        <div className="mx-auto grid min-h-[720px] max-w-7xl items-center gap-16 px-5 py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-24">
          {/* Left */}
          <div className="relative z-10">
            <div className="mb-7 flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#C1272D]">
              <span className="h-px w-10 bg-[#C1272D]" />
              India to Sri Lanka
              <span className="h-px w-10 bg-[#C1272D]" />
            </div>

            <h1 className="max-w-2xl font-serif text-6xl font-semibold leading-[0.96] tracking-[-0.04em] text-[#122A47] sm:text-7xl lg:text-[86px]">
              Shop in India.
              <br />
              We get it to{" "}
              <span className="italic text-[#C1272D]">Lanka.</span>
            </h1>

            <p className="mt-8 max-w-xl text-lg leading-8 text-[#1C1A17]/70">
              Your trusted parcel forwarding partner. Shop from any Indian
              store and we'll deliver it directly to your doorstep in Sri
              Lanka.
            </p>

            {/* benefits */}
            <div className="mt-10 grid max-w-xl grid-cols-3 gap-5">
              {[
                {
                  icon: Tag,
                  title: "Best Rates",
                  text: "Lowest shipping costs",
                },
                {
                  icon: ShieldCheck,
                  title: "Safe & Secure",
                  text: "100% secure deliveries",
                },
                {
                  icon: Clock3,
                  title: "Fast Delivery",
                  text: "4–7 days average",
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.title}>
                    <Icon
                      className="mb-3 text-[#D98E2B]"
                      size={25}
                      strokeWidth={1.8}
                    />
                    <p className="text-sm font-bold text-[#122A47]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#1C1A17]/55">
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <button className="group flex items-center gap-4 rounded-md bg-[#D98E2B] px-7 py-4 font-bold text-white shadow-lg shadow-[#D98E2B]/20 transition hover:-translate-y-1">
                Sign up & Start Shipping
                <ArrowRight
                  size={18}
                  className="transition group-hover:translate-x-1"
                />
              </button>

              <button className="flex items-center gap-3 rounded-md border border-[#122A47]/20 bg-white/60 px-7 py-4 font-bold text-[#122A47] transition hover:border-[#122A47]/50">
                How it Works
                <ChevronRight size={17} />
              </button>
            </div>

            {/* stamp */}
            <div className="absolute -bottom-20 left-0 hidden xl:block">
              <PostalStamp rotate="-10deg">Bengaluru<br />India</PostalStamp>
            </div>
          </div>

          {/* Quote card */}
          <div className="relative">
            <div className="absolute -right-8 -top-10 hidden lg:block">
              <PostalStamp rotate="7deg">Colombo<br />Sri Lanka</PostalStamp>
            </div>

            <div className="relative rounded-[4px] border border-[#D98E2B]/20 bg-[#FCFAF5] p-6 shadow-[0_25px_80px_rgba(18,42,71,0.10)] sm:p-8">
              {/* perforation */}
              <div className="absolute right-14 top-0 h-full border-r border-dashed border-[#122A47]/15" />

              <div className="mb-7 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center border border-[#C1272D]/30 text-[#C1272D]">
                  <Package size={20} />
                </div>

                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#C1272D]">
                    Instant Quote
                  </p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-[#122A47]">
                    Ship from India
                  </h2>
                </div>
              </div>

              <div className="relative z-10 rounded-lg border border-[#122A47]/10 bg-white p-1">
                <div className="grid grid-cols-2">
                  <button className="border-b-2 border-[#D98E2B] px-4 py-3 text-sm font-bold text-[#122A47]">
                    Shop from any site
                  </button>
                  <button className="px-4 py-3 text-sm font-medium text-[#122A47]/50">
                    Calculate by weight
                  </button>
                </div>

                <div className="mt-3 flex items-center rounded-md border border-[#122A47]/10 px-4 py-4">
                  <input
                    placeholder="Paste product link (Amazon, Flipkart, etc.)"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#1C1A17]/35"
                  />
                  <Link2 size={19} className="text-[#122A47]/50" />
                </div>

                <button className="mt-3 flex w-full items-center justify-between rounded-md bg-[#122A47] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#1E3A5F]">
                  Get Product Details
                  <ArrowRight size={18} />
                </button>
              </div>

              <div className="mt-7 grid grid-cols-3 gap-4">
                {[
                  ["Auto fetch", "product info"],
                  ["Best shipping", "rates"],
                  ["No hidden", "charges"],
                ].map(([a, b]) => (
                  <div key={a} className="flex gap-2">
                    <Check
                      size={16}
                      className="mt-0.5 shrink-0 text-[#D98E2B]"
                    />
                    <div className="text-[11px] leading-4">
                      <p className="font-bold text-[#122A47]">{a}</p>
                      <p className="text-[#1C1A17]/50">{b}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-center gap-3 border-t border-[#122A47]/10 pt-6">
                <div className="flex -space-x-2">
                  {["S", "D", "T", "K"].map((letter) => (
                    <div
                      key={letter}
                      className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#FCFAF5] bg-[#122A47] text-xs font-bold text-white"
                    >
                      {letter}
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-semibold text-[#122A47]">
                    Trusted by 20,000+ Sri Lankans
                  </p>

                  <div className="mt-1 flex gap-1 text-[#D98E2B]">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={13} fill="currentColor" />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* plane */}
            <div className="absolute -bottom-12 -left-10 hidden rotate-[-8deg] lg:block">
              <Plane size={80} strokeWidth={1} className="text-[#122A47]/25" />
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          PARTNERS
      ========================================================== */}
      <section className="border-y border-[#122A47]/10 bg-[#FCFAF5]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-14 gap-y-6 px-5 py-9 lg:px-8">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#122A47]/50">
            Official Logistics Partners
          </span>

          {partners.map((partner) => (
            <div
              key={partner}
              className="font-sans text-xl font-black tracking-tight text-[#122A47]/70 grayscale"
            >
              {partner}
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================
          SERVICES
      ========================================================== */}
      <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <div className="grid overflow-hidden rounded-2xl border border-[#122A47]/10 bg-white shadow-[0_15px_60px_rgba(18,42,71,0.06)] md:grid-cols-5">
          {services.map((service, index) => {
            const Icon = service.icon;

            return (
              <div
                key={service.title}
                className={`relative flex min-h-[230px] flex-col items-center justify-center px-6 py-10 text-center ${
                  index !== services.length - 1
                    ? "border-b border-[#122A47]/10 md:border-b-0 md:border-r"
                    : ""
                }`}
              >
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#F7F3EA] text-[#122A47]">
                  <Icon size={30} strokeWidth={1.5} />
                </div>

                <h3 className="font-serif text-xl font-semibold text-[#122A47]">
                  {service.title}
                </h3>

                <p className="mt-3 max-w-[180px] text-sm leading-6 text-[#1C1A17]/55">
                  {service.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================
          HOW IT WORKS
      ========================================================== */}
      <section
        id="how-it-works"
        className="border-y border-[#122A47]/10 bg-[#FCFAF5]"
      >
        <div className="mx-auto max-w-7xl px-5 py-28 lg:px-8">
          <SectionLabel>How it works</SectionLabel>

          <h2 className="mx-auto max-w-3xl text-center font-serif text-5xl font-semibold leading-tight text-[#122A47] md:text-6xl">
            From your favourite Indian store
            <span className="italic text-[#C1272D]"> to your doorstep.</span>
          </h2>

          <div className="relative mt-20 grid gap-10 md:grid-cols-3 lg:grid-cols-6">
            {/* connecting line */}
            <div className="absolute left-[8%] right-[8%] top-9 hidden border-t border-dashed border-[#D98E2B]/50 lg:block" />

            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <div key={step.number} className="relative text-center">
                  <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[#D98E2B]/30 bg-[#F7F3EA]">
                    <Icon
                      size={25}
                      strokeWidth={1.5}
                      className="text-[#122A47]"
                    />

                    <span className="absolute -left-1 -top-3 font-mono text-[10px] font-bold text-[#C1272D]">
                      {step.number}
                    </span>
                  </div>

                  <h3 className="font-serif text-lg font-semibold text-[#122A47]">
                    {step.title}
                  </h3>

                  <p className="mx-auto mt-2 max-w-[150px] text-xs leading-5 text-[#1C1A17]/55">
                    {step.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================
          DEALS
      ========================================================== */}
      <section id="deals" className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <SectionLabel>Today's hot deals</SectionLabel>

            <h2 className="font-serif text-4xl font-semibold text-[#122A47] md:text-5xl">
              Shop more. Save more.
            </h2>
          </div>

          <button className="hidden items-center gap-2 text-sm font-bold text-[#122A47] sm:flex">
            View all deals
            <ArrowUpRight size={16} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {deals.map((deal) => (
            <div
              key={deal.brand}
              className="group rounded-xl border border-[#122A47]/10 bg-white p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#122A47]/5"
            >
              <div className="flex h-14 items-center justify-center font-sans text-3xl font-black text-[#122A47]">
                {deal.logo}
              </div>

              <div className="mt-6">
                <p className="text-sm font-bold text-[#122A47]">
                  {deal.brand}
                </p>

                <span className="mt-2 inline-flex rounded-full bg-[#C1272D]/10 px-2 py-1 text-[10px] font-bold text-[#C1272D]">
                  {deal.offer}
                </span>

                <p className="mt-3 text-xs text-[#1C1A17]/50">
                  {deal.category}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================
          STATS BAND
      ========================================================== */}
      <section className="relative overflow-hidden bg-[#122A47] text-white">
        <div className="absolute -left-20 top-0 h-48 w-48 rounded-full border border-white/10" />
        <div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full border border-white/10" />

        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/15 px-5 py-16 md:grid-cols-5 lg:px-8">
          {stats.map(([number, label, Icon]) => {
            const StatIcon = Icon as typeof Users;

            return (
              <div
                key={String(label)}
                className="flex flex-col items-center px-4 py-6 text-center"
              >
                <StatIcon
                  size={28}
                  strokeWidth={1.4}
                  className="mb-5 text-[#D98E2B]"
                />

                <p className="font-serif text-3xl font-semibold md:text-4xl">
                  {String(number)}
                </p>

                <p className="mt-2 text-xs font-medium text-white/55">
                  {String(label)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================
          COMMUNITY + TESTIMONIALS
      ========================================================== */}
      <section id="community" className="mx-auto max-w-7xl px-5 py-28 lg:px-8">
        <div className="grid items-center gap-20 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <SectionLabel>Shopping community</SectionLabel>

            <h2 className="font-serif text-5xl font-semibold leading-[1.05] text-[#122A47]">
              Join 15,000+
              <br />
              smart shoppers.
            </h2>

            <p className="mt-6 max-w-md text-base leading-7 text-[#1C1A17]/60">
              Share deals, ask questions, and get product reviews from our
              active community.
            </p>

            <button className="mt-8 flex items-center gap-3 rounded-md border border-[#122A47]/20 px-6 py-3 text-sm font-bold text-[#122A47] transition hover:bg-[#122A47] hover:text-white">
              Join Community
              <ArrowRight size={16} />
            </button>

            <div className="mt-8 flex items-center gap-3">
              <div className="flex -space-x-2">
                {["A", "N", "S", "D", "T"].map((x) => (
                  <div
                    key={x}
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#F7F3EA] bg-[#D98E2B] text-xs font-bold text-white"
                  >
                    {x}
                  </div>
                ))}
              </div>

              <span className="text-xs font-semibold text-[#122A47]/60">
                15K+ members
              </span>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* phone mockup */}
            <div className="mx-auto w-full max-w-[280px] rounded-[34px] border-[7px] border-[#122A47] bg-white p-4 shadow-2xl">
              <div className="mx-auto mb-6 h-1.5 w-20 rounded-full bg-[#122A47]" />

              <p className="font-serif text-xl font-semibold text-[#122A47]">
                India2Lanka
              </p>

              <div className="mt-6 rounded-xl bg-[#F7F3EA] p-4">
                <p className="text-xs font-bold text-[#122A47]">
                  Pinned Deal
                </p>

                <p className="mt-2 text-sm font-semibold">
                  Up to 10% OFF on Amazon.in
                </p>

                <span className="mt-2 inline-block text-[10px] text-[#C1272D]">
                  Electronics & Accessories
                </span>
              </div>

              {[1, 2, 3].map((x) => (
                <div
                  key={x}
                  className="border-b border-[#122A47]/10 py-5"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-[#122A47]" />
                    <div>
                      <p className="text-xs font-bold">Community member</p>
                      <p className="text-[9px] text-[#122A47]/40">
                        {x + 1}h ago
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-[#1C1A17]/60">
                    My recent delivery arrived in 5 days. Very happy with the
                    service!
                  </p>
                </div>
              ))}
            </div>

            {/* testimonials */}
            <div className="flex flex-col justify-center gap-5">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#122A47]">
                What our customers say
              </div>

              {testimonials.map((testimonial) => (
                <div
                  key={testimonial.name}
                  className="rounded-2xl border border-[#122A47]/10 bg-white p-7 shadow-[0_12px_40px_rgba(18,42,71,0.05)]"
                >
                  <div className="flex gap-1 text-[#D98E2B]">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={14} fill="currentColor" />
                    ))}
                  </div>

                  <Quote
                    size={28}
                    className="mt-5 text-[#C1272D]/20"
                    fill="currentColor"
                  />

                  <p className="mt-2 font-serif text-xl leading-8 text-[#122A47]">
                    “{testimonial.text}”
                  </p>

                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#122A47] text-sm font-bold text-white">
                      {testimonial.name[0]}
                    </div>

                    <div>
                      <p className="text-sm font-bold text-[#122A47]">
                        {testimonial.name}
                      </p>
                      <p className="text-xs text-[#122A47]/45">
                        {testimonial.city}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          REFERRAL
      ========================================================== */}
      <section className="mx-auto max-w-6xl px-5 pb-28 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-[#D98E2B]/20 bg-[#FCFAF5] px-8 py-12 md:px-14">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border-[20px] border-[#D98E2B]/10" />

          <div className="relative z-10 grid items-center gap-10 md:grid-cols-[160px_1fr_auto]">
            <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-[#C1272D] shadow-xl">
              <Package size={52} className="text-white" />
            </div>

            <div className="text-center md:text-left">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#C1272D]">
                Refer & Earn
              </p>

              <h2 className="mt-2 font-serif text-4xl font-semibold text-[#122A47]">
                Invite Friends, Earn Rewards!
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-6 text-[#1C1A17]/55">
                Refer your friends and earn credits on every successful
                shipment.
              </p>
            </div>

            <button className="flex items-center justify-center gap-3 rounded-md bg-[#D98E2B] px-7 py-4 text-sm font-bold text-white">
              Learn More
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================
          FOOTER
      ========================================================== */}
      <footer className="bg-[#122A47] text-white">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-9 items-center justify-center border-2 border-[#C1272D] text-[#C1272D]">
                  <Plane size={19} />
                </div>

                <div className="leading-none">
                  <p className="text-sm font-black">INDIA</p>
                  <p className="text-[9px] text-[#D98E2B]">2</p>
                  <p className="text-sm font-black">LANKA</p>
                </div>
              </div>

              <p className="mt-7 max-w-[220px] text-sm leading-6 text-white/50">
                Your trusted partner for parcel forwarding from India to Sri
                Lanka.
              </p>

              <div className="mt-7 flex gap-3">
                {[Instagram, Youtube, Globe2].map((Icon, i) => (
                  <div
                    key={i}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70"
                  >
                    <Icon size={15} />
                  </div>
                ))}
              </div>
            </div>

            {[
              {
                title: "Company",
                links: [
                  "About Us",
                  "How It Works",
                  "Rates & Calculator",
                  "Careers",
                  "Contact Us",
                ],
              },
              {
                title: "Customer Care",
                links: [
                  "Help Center",
                  "Shipping Guide",
                  "Prohibited Items",
                  "Tracking",
                  "FAQ",
                ],
              },
              {
                title: "My Account",
                links: ["Sign Up", "Log In", "My Shipments", "My Requests", "Credits"],
              },
              {
                title: "Legal",
                links: [
                  "Terms & Conditions",
                  "Privacy Policy",
                  "Refund Policy",
                  "Cookie Policy",
                ],
              },
            ].map((column) => (
              <div key={column.title}>
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#D98E2B]">
                  {column.title}
                </h3>

                <div className="mt-6 space-y-3">
                  {column.links.map((link) => (
                    <a
                      key={link}
                      href="#"
                      className="block text-sm text-white/55 transition hover:text-white"
                    >
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#D98E2B]">
                Download our app
              </h3>

              <div className="mt-6 space-y-3">
                <button className="flex w-full items-center gap-3 rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-left">
                  <div className="text-xl">▶</div>
                  <div>
                    <p className="text-[9px] text-white/50">GET IT ON</p>
                    <p className="text-sm font-bold">Google Play</p>
                  </div>
                </button>

                <button className="flex w-full items-center gap-3 rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-left">
                  <div className="text-xl">●</div>
                  <div>
                    <p className="text-[9px] text-white/50">DOWNLOAD ON THE</p>
                    <p className="text-sm font-bold">App Store</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-16 border-t border-white/10 pt-7 text-center text-xs text-white/35">
            © 2026 India2Lanka. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}