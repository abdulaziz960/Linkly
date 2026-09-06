import type { MetadataRoute } from "next";

const disallow = [
  "/api/",
  "/linkly-admin007/",
  "/dashboard/",
  "/activate",
  "/billing/",
  "/checkout/",
  "/signup",
  "/forgot-password",
  "/login"
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/en", "/privacy", "/terms", "/contact", "/data-deletion"],
        disallow
      },
      // Explicitly welcome OpenAI's search crawler (distinct from GPTBot,
      // which crawls for model training, not search - not addressed here).
      {
        userAgent: "OAI-SearchBot",
        allow: ["/", "/en", "/privacy", "/terms", "/contact", "/data-deletion"],
        disallow
      }
    ],
    sitemap: "https://linklysa.io/sitemap.xml",
    host: "https://linklysa.io"
  };
}
