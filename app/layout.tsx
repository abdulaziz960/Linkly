import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const appFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-app",
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
    <html lang="ar" dir="rtl" className={appFont.variable}>
      <body>{children}</body>
    </html>
  );
}
