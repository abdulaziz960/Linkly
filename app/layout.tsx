import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import Script from "next/script";
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
      <head>
        {/*
          Google Tag Manager (container GTM-TXWK77FV) loads on every page so
          Google's tag checker can see it, but under Google Consent Mode v2:
          everything starts "denied" (no analytics cookies/storage), and is
          switched to "granted" only when the visitor accepted the cookie
          banner - either earlier (the linkly_consent cookie) or right now
          (see CookieConsent.tsx). GA4 lives inside the GTM container, not
          in this code.
        */}
        <Script
          id="google-tag-manager"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `if(location.pathname.indexOf('/linkly-admin007')!==0){window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};var gtag=window.gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});
if(document.cookie.indexOf('linkly_consent=accepted')!==-1){gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});}
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-TXWK77FV');}`
          }}
        />
      </head>
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
