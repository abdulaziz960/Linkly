import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Noto_Kufi_Arabic, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Latin text (the "Linkly" wordmark, digits) always resolves to Space
// Grotesk first; Arabic text falls through automatically since Space
// Grotesk has no Arabic glyphs - no separate numeral-specific styling
// needed anywhere, the font stack order alone handles it.
const latinFont = Space_Grotesk({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-latin",
  display: "swap"
});

const bodyArabicFont = IBM_Plex_Sans_Arabic({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["arabic"],
  variable: "--font-body-arabic",
  display: "swap"
});

// Every heading that uses --font-display sets font-weight: 700 explicitly
// (see .hero h1, .intro h2, .finalCta h2 in page.module.css, and the base
// h1-h6 rule in globals.css) - no other weight is ever requested, so only
// Bold is loaded.
const displayArabicFont = Noto_Kufi_Arabic({
  weight: ["700"],
  subsets: ["arabic"],
  variable: "--font-display-arabic",
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

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${latinFont.variable} ${bodyArabicFont.variable} ${displayArabicFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
