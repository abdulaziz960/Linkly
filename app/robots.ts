import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/en", "/privacy", "/terms", "/contact"],
      disallow: ["/api/", "/admin/", "/dashboard/", "/activate", "/billing/", "/checkout/"]
    },
    sitemap: "https://linklysa.io/sitemap.xml",
    host: "https://linklysa.io"
  };
}
