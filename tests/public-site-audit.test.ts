import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ seo: vi.fn(), landing: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: { pageSeo: { findMany: db.seo }, landingContent: { findMany: db.landing } } }));
vi.mock("../lib/database", () => ({ ensureSchema: async () => undefined }));
vi.mock("../lib/redirects", () => ({ findRedirect: async () => null }));

beforeEach(async () => {
  db.seo.mockReset().mockResolvedValue([]);
  db.landing.mockReset().mockResolvedValue([]);
  (await import("../lib/page-seo")).clearPageSeoCache();
  (await import("../lib/landing-content")).clearLandingCache();
});

describe("public site audit regressions", () => {
  it("uses the page language and managed metadata in social previews", async () => {
    const { applyPageSeo } = await import("../lib/page-seo");
    const metadata = await applyPageSeo("/en", { alternates: { canonical: "/en" } });
    expect(metadata.twitter).toMatchObject({ title: "Linkly | Every customer conversation in one place", card: "summary_large_image" });
    expect(metadata.description).not.toContain("TikTok chats");
  });

  it("lets crawlers read noindex on public account entry pages", async () => {
    const robots = (await import("../app/robots")).default();
    for (const rule of Array.isArray(robots.rules) ? robots.rules : [robots.rules]) {
      expect(rule.disallow).not.toContain("/signup");
      expect(rule.disallow).not.toContain("/login");
      expect(rule.disallow).not.toContain("/forgot-password");
    }
  });

  it("coalesces concurrent landing text reads into one database lookup", async () => {
    const { getLandingText } = await import("../lib/landing-content");
    const results = await Promise.all(Array.from({ length: 20 }, () => getLandingText()));
    expect(db.landing).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result === results[0])).toBe(true);
  });

  it("redirects www to the canonical host without losing the path or query", async () => {
    const { proxy } = await import("../proxy");
    const response = await proxy(new NextRequest("https://www.linklysa.io/en/contact?source=demo"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://linklysa.io/en/contact?source=demo");
  });

  it("generates a fresh trusted nonce for each document and disables inline script bypass", async () => {
    const { proxy } = await import("../proxy");
    const first = await proxy(new NextRequest("https://linklysa.io/", { headers: { "x-nonce": "attacker" } }));
    const second = await proxy(new NextRequest("https://linklysa.io/"));
    const nonce = first.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{24}$/);
    expect(nonce).not.toBe(second.headers.get("x-middleware-request-x-nonce"));
    const csp = first.headers.get("content-security-policy")!;
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp.split(";").find((directive) => directive.trim().startsWith("script-src"))).not.toContain("'unsafe-inline'");
    expect(first.headers.get("cache-control")).toMatch(/private/);
    expect(first.headers.get("cache-control")).toContain("no-cache");
  });
});
