import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SEO } from "../lib/page-seo-defaults";
import { KNOWN_PAGES } from "../lib/page-seo";

describe("default page SEO", () => {
  it("covers every page the admin panel lists, with every field filled", () => {
    for (const page of KNOWN_PAGES) {
      const seo = DEFAULT_PAGE_SEO[page.path];
      expect(seo, page.path).toBeDefined();
      for (const field of ["metaTitle", "metaDescription", "ogTitle", "ogDescription", "canonicalUrl", "ogImage"] as const) {
        expect(seo[field].trim().length, `${page.path} ${field}`).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(DEFAULT_PAGE_SEO).sort()).toEqual(KNOWN_PAGES.map((page) => page.path).sort());
  });

  it("keeps titles and descriptions within what search results show", () => {
    for (const [path, seo] of Object.entries(DEFAULT_PAGE_SEO)) {
      expect(seo.metaTitle.length, `${path} title`).toBeLessThanOrEqual(62);
      expect(seo.metaDescription.length, `${path} description`).toBeGreaterThanOrEqual(70);
      expect(seo.metaDescription.length, `${path} description`).toBeLessThanOrEqual(165);
      expect(seo.ogTitle.length, `${path} og title`).toBeLessThanOrEqual(70);
      expect(seo.ogDescription.length, `${path} og description`).toBeLessThanOrEqual(200);
    }
  });

  it("uses a full https canonical that points at the page itself, and a unique title and description per page", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const [path, seo] of Object.entries(DEFAULT_PAGE_SEO)) {
      expect(seo.canonicalUrl).toBe(path === "/" ? "https://linklysa.io/" : `https://linklysa.io${path}`);
      expect(seo.ogImage.startsWith("https://")).toBe(true);
      titles.add(seo.metaTitle);
      descriptions.add(seo.metaDescription);
    }
    expect(titles.size).toBe(Object.keys(DEFAULT_PAGE_SEO).length);
    expect(descriptions.size).toBe(Object.keys(DEFAULT_PAGE_SEO).length);
  });

  it("never mentions a price (prices change from the admin panel)", () => {
    for (const seo of Object.values(DEFAULT_PAGE_SEO)) {
      expect(`${seo.metaTitle} ${seo.metaDescription} ${seo.ogTitle} ${seo.ogDescription}`).not.toMatch(/\d{3,}\s*(ريال|SAR|ر\.س)/);
    }
  });
});
