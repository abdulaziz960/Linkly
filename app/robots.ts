import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/en", "/privacy", "/terms", "/contact"],
      disallow: ["/api/", "/admin/", "/linkly-command-7f3a9/", "/dashboard/", "/activate", "/billing/", "/checkout/"]
    },
    sitemap: "https://audiencew.audience.sa/sitemap.xml",
    host: "https://audiencew.audience.sa"
  };
}
