import type { Metadata, Viewport } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import "./globals.css";
import {
  APPLE_STARTUP_IMAGES,
  OG_IMAGE_SIZE,
  PWA_ICONS,
  SEO_IMAGES,
  SITE,
  SITE_URL,
} from "@/lib/seo";
import JsonLd, { organizationSchema, websiteSchema } from "@/components/seo/JsonLd";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import AuthProvider from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/Cartcontext";
import { WishlistProvider } from "@/contexts/Wishlistcontext";
import { NotificationProvider } from "@/contexts/Notificationcontext";
import { LoyaltyProvider } from "@/contexts/Loyaltycontext";
import { ChatProvider } from "@/contexts/ChatContext";
import { RecentlyViewedProvider } from "@/contexts/RecentlyViewedContext";
import { OrdersProvider } from "@/contexts/Ordercontexts";

const fraunces = Fraunces({
  variable: "--font-serif-display",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Every relative URL in metadata (OG images, canonicals, icons) resolves
  // against this — without it, social cards get relative image URLs that
  // Facebook/WhatsApp/X can't fetch.
  metadataBase: new URL(SITE_URL),
  applicationName: SITE.name,
  title: {
    default: SITE.defaultTitle,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [...SITE.keywords],
  authors: [{ name: SITE.name, url: SITE_URL }],
  creator: SITE.name,
  publisher: SITE.name,
  category: 'shopping',
  referrer: 'origin-when-cross-origin',
  formatDetection: { telephone: false, email: false, address: false },
  // No `alternates.canonical` here on purpose: it would be inherited by
  // every page that doesn't set its own and point them all at "/". Each
  // page sets its canonical through pageMetadata() in lib/seo.ts.
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    locale: SITE.locale,
    url: SITE_URL,
    title: SITE.defaultTitle,
    description: SITE.description,
    images: [{ url: SEO_IMAGES.ogDefault, ...OG_IMAGE_SIZE, alt: SITE.defaultTitle }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.defaultTitle,
    description: SITE.description,
    images: [{ url: SEO_IMAGES.twitterDefault, alt: SITE.defaultTitle }],
    ...(SITE.twitterHandle ? { site: SITE.twitterHandle, creator: SITE.twitterHandle } : {}),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: PWA_ICONS.favicon, sizes: 'any' },
      { url: PWA_ICONS.favicon16, sizes: '16x16', type: 'image/png' },
      { url: PWA_ICONS.favicon32, sizes: '32x32', type: 'image/png' },
      { url: PWA_ICONS.icon192, sizes: '192x192', type: 'image/png' },
      { url: PWA_ICONS.icon512, sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: PWA_ICONS.appleTouch, sizes: '180x180', type: 'image/png' }],
    shortcut: [PWA_ICONS.favicon],
  },
  // <link rel="manifest"> is added automatically from app/manifest.ts.
  appleWebApp: {
    capable: true,
    title: SITE.shortName,
    statusBarStyle: 'default',
    startupImage: APPLE_STARTUP_IMAGES.map((img) => ({
      url: img.url,
      media: `(device-width: ${img.w}px) and (device-height: ${img.h}px) and (-webkit-device-pixel-ratio: ${img.dpr}) and (orientation: portrait)`,
    })),
  },
  // Search Console / Bing Webmaster ownership tokens. Set these env vars
  // on Vercel (values are the "content" strings those tools give you).
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.YANDEX_SITE_VERIFICATION ? { yandex: process.env.YANDEX_SITE_VERIFICATION } : {}),
    other: {
      ...(process.env.BING_SITE_VERIFICATION ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } : {}),
      ...(process.env.FACEBOOK_DOMAIN_VERIFICATION
        ? { 'facebook-domain-verification': process.env.FACEBOOK_DOMAIN_VERIFICATION }
        : {}),
    },
  },
  other: {
    // Older Android/Windows "add to home screen" paths still read these.
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': SITE.themeColor,
    'msapplication-TileImage': PWA_ICONS.icon192,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Don't cap maximumScale — blocking pinch-zoom fails WCAG 1.4.4.
  viewportFit: "cover",
  themeColor: [{ color: SITE.themeColor }],
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: some browser extensions (password
    // managers, ad blockers, etc.) inject attributes like
    // data-qb-installed onto <html> before React hydrates. That's a
    // mismatch between server-rendered and client HTML that has
    // nothing to do with our code — React's own hydration-mismatch
    // docs call this out explicitly (react.dev/link/hydration-mismatch).
    // suppressHydrationWarning only silences ATTRIBUTE mismatches on
    // this one element; it does not suppress mismatches in children,
    // so real hydration bugs elsewhere still surface normally.
    <html lang="en-LK" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${spaceGrotesk.variable} font-sans`}
      >
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <LoyaltyProvider >
                {/* Promoted here (was previously wrapped separately by
                    each of OrdersHubPage/track/cart/account-home) so
                    ChatProvider — mounted globally for the floating
                    ChatPanel — can read the customer's own order list
                    via useOrders() to default/offer an order to tag a
                    message to. Per-page OrdersProvider wraps were
                    removed; each of those now calls useOrders()
                    directly against this one, matching the exact
                    migration app/account/page.tsx's own comment already
                    called for ("remove this wrapper and just call
                    useOrders() directly") to avoid double-fetching. */}
                <OrdersProvider>
                  <ChatProvider>
                      <RecentlyViewedProvider>
                        <NotificationProvider>{children}</NotificationProvider>
                      </RecentlyViewedProvider>
                  </ChatProvider>
                </OrdersProvider>
              </LoyaltyProvider>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
        <ServiceWorkerRegister />
        <InstallPrompt />
        {/* Site-wide structured data: brand identity + site name. */}
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
      </body>
    </html>
  );
}