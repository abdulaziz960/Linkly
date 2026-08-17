import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const appFont = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800", "900"],
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
