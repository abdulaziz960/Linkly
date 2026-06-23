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
  title: "AudienceW",
  description: "AudienceW customer messaging platform"
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
