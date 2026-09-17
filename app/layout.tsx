import type { Metadata, Viewport } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/Cartcontext";
import { WishlistProvider } from "@/contexts/Wishlistcontext";
import { NotificationProvider } from "@/contexts/Notificationcontext";
import { LoyaltyProvider } from "@/contexts/Loyaltycontext";
import { ChatProvider } from "@/contexts/ChatContext";
import { RecentlyViewedProvider } from "@/contexts/RecentlyViewedContext";

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
  title: "WishDrop — Wish it. We'll drop it.",
  description:
    "Shop from your favorite Indian stores — WishDrop buys it, quality-checks it, and delivers it to your door in Sri Lanka.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${spaceGrotesk.variable} font-sans`}
      >
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <LoyaltyProvider >
                <ChatProvider>
                    <RecentlyViewedProvider>
                      <NotificationProvider>{children}</NotificationProvider>
                    </RecentlyViewedProvider>
                </ChatProvider>
              </LoyaltyProvider>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}