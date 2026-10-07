import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import CookieConsent from "./CookieConsent";
import "./globals.css";

const appFont = localFont({
  src: [
    { path: "../public/fonts/thmanyah/sans/thmanyahsans-Light.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/thmanyah/sans/thmanyahsans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/thmanyah/sans/thmanyahsans-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/thmanyah/sans/thmanyahsans-Bold.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/thmanyah/sans/thmanyahsans-Black.woff2", weight: "900", style: "normal" }
  ],
  variable: "--font-app",
  // Only the display face is LCP-critical. Let the browser fetch the sans
  // weights actually used instead of preloading all five on mobile.
  preload: false,
  display: "swap"
});

// Every heading that uses --font-display sets font-weight: 700 explicitly
// (see .hero h1, .intro h2, .finalCta h2 in page.module.css) - the other
// three weights were dead preloaded weight on every page load, competing
// with the LCP text paint for bandwidth on throttled mobile connections.
const displayFont = localFont({
  src: [
    { path: "../public/fonts/thmanyah/serif-display/thmanyahserifdisplay-Bold.woff2", weight: "700", style: "normal" }
  ],
  variable: "--font-display",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://linklysa.io"),
  title: { default: "Linkly — صندوق واحد لمحادثات عملائك", template: "%s | Linkly" },
  description: "منصة سعودية تجمع محادثات واتساب وإنستغرام وتيليجرام والبريد وتيك توك في صندوق واحد لفريقك.",
  applicationName: "Linkly",
  alternates: { canonical: "/", languages: { "ar-SA": "/", "en": "/en" } },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    alternateLocale: "en_US",
    siteName: "Linkly",
    title: "Linkly — صندوق واحد لمحادثات عملائك",
    description: "اجمع قنوات خدمة العملاء في صندوق واحد واضح لفريقك.",
    url: "/",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Linkly — صندوق موحد لمحادثات العملاء" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Linkly — صندوق واحد لمحادثات عملائك",
    description: "اجمع قنوات خدمة العملاء في صندوق واحد واضح لفريقك.",
    images: ["/opengraph-image"]
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const english = (await headers()).get("x-linkly-lang") === "en";
  return (
    <html lang={english ? "en" : "ar"} dir={english ? "ltr" : "rtl"} className={`${appFont.variable} ${displayFont.variable}`}>
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
