import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-seo-cms.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("managed redirects", () => {
  it("validates input", async () => {
    const { cleanRedirectInput } = await import("../lib/redirects");
    expect(cleanRedirectInput({ fromPath: "/old/", toUrl: "/new", statusCode: 301 })).toMatchObject({ ok: true, data: { fromPath: "/old", toUrl: "/new", statusCode: 301 } });
    expect(cleanRedirectInput({ fromPath: "/old?x=1#y", toUrl: "https://example.com/x" })).toMatchObject({ ok: true, data: { fromPath: "/old" } });
    expect(cleanRedirectInput({ fromPath: "/same", toUrl: "/same/" }).ok).toBe(false); // self loop
    expect(cleanRedirectInput({ fromPath: "/dashboard/x", toUrl: "/y" }).ok).toBe(false); // reserved
    expect(cleanRedirectInput({ fromPath: "/api/x", toUrl: "/y" }).ok).toBe(false);
    expect(cleanRedirectInput({ fromPath: "/a", toUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(cleanRedirectInput({ fromPath: "/a", toUrl: "" }).ok).toBe(false);
    expect(cleanRedirectInput({ fromPath: "/a", toUrl: "/b", statusCode: 307 }).ok).toBe(false);
    expect(cleanRedirectInput({ fromPath: "/gone", statusCode: 410 })).toMatchObject({ ok: true, data: { toUrl: "", statusCode: 410 } });
  });

  it("stores rules, rejects duplicates and loops, and the proxy applies them", async () => {
    const { cleanRedirectInput, createRedirect, updateRedirect, deleteRedirect, clearRedirectCache } = await import("../lib/redirects");
    const make = (input: Parameters<typeof cleanRedirectInput>[0]) => {
      const cleaned = cleanRedirectInput(input);
      if (!cleaned.ok) throw new Error(cleaned.error);
      return cleaned.data;
    };
    const first = await createRedirect(make({ fromPath: "/old-pricing", toUrl: "/faq", statusCode: 301 }));
    expect(first.ok).toBe(true);
    expect(await createRedirect(make({ fromPath: "/old-pricing", toUrl: "/contact" }))).toMatchObject({ ok: false, status: 409 });
    // /faq -> /old-pricing would close a loop
    expect(await createRedirect(make({ fromPath: "/faq", toUrl: "/old-pricing" }))).toMatchObject({ ok: false, status: 400 });
    expect((await createRedirect(make({ fromPath: "/removed-page", statusCode: 410 }))).ok).toBe(true);
    const off = await createRedirect(make({ fromPath: "/paused", toUrl: "/contact", enabled: false }));
    expect(off.ok).toBe(true);
    clearRedirectCache();

    const { NextRequest } = await import("next/server");
    const { proxy } = await import("../proxy");
    const moved = await proxy(new NextRequest("http://localhost/old-pricing"));
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe("http://localhost/faq");
    const slash = await proxy(new NextRequest("http://localhost/old-pricing/"));
    expect(slash.status).toBe(301);
    const gone = await proxy(new NextRequest("http://localhost/removed-page"));
    expect(gone.status).toBe(410);
    const paused = await proxy(new NextRequest("http://localhost/paused"));
    expect(paused.status).toBe(200); // disabled rules do nothing
    const post = await proxy(new NextRequest("http://localhost/old-pricing", { method: "POST" }));
    expect(post.status).toBe(200); // only GET/HEAD are redirected
    const legacy = await proxy(new NextRequest("http://localhost/terms.html"));
    expect(legacy.status).toBe(308);

    if (first.ok) {
      expect((await updateRedirect(first.rule.id, make({ fromPath: "/old-pricing", toUrl: "/contact" }))).ok).toBe(true);
      clearRedirectCache();
      expect((await proxy(new NextRequest("http://localhost/old-pricing"))).headers.get("location")).toBe("http://localhost/contact");
      expect(await deleteRedirect(first.rule.id)).toBe(true);
      clearRedirectCache();
      expect((await proxy(new NextRequest("http://localhost/old-pricing"))).status).toBe(200);
    }
  });
});

describe("page SEO overrides", () => {
  it("applies overrides on top of the built-in metadata and reports noindex pages", async () => {
    const { cleanPageSeoInput, savePageSeo, applyPageSeo, getNoindexPaths, clearPageSeoCache } = await import("../lib/page-seo");
    expect(cleanPageSeoInput("/not-a-page", {}).ok).toBe(false);
    expect(cleanPageSeoInput("/faq", { canonicalUrl: "/relative" }).ok).toBe(false);

    const base = { title: "Base", description: "Base description", alternates: { canonical: "/faq" }, openGraph: { siteName: "Linkly" } };
    clearPageSeoCache();
    expect(await applyPageSeo("/faq", base)).toMatchObject({ title: "Base", description: "Base description" });

    const cleaned = cleanPageSeoInput("/faq", { metaTitle: "عنوان مخصص", ogImage: "/media/x-1234abcd.webp", noindex: true });
    if (!cleaned.ok) throw new Error(cleaned.error);
    await savePageSeo(cleaned.data);

    const merged = await applyPageSeo("/faq", base);
    expect(merged.title).toEqual({ absolute: "عنوان مخصص" });
    expect(merged.description).toBe("Base description"); // blank override keeps the default
    expect(merged.robots).toEqual({ index: false, follow: true });
    expect((merged.openGraph as { siteName?: string }).siteName).toBe("Linkly");
    expect((merged.openGraph as { images?: unknown[] }).images).toEqual([{ url: "/media/x-1234abcd.webp" }]);
    expect((await getNoindexPaths()).has("/faq")).toBe(true);

    const sitemap = (await import("../app/sitemap")).default;
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).not.toContain("https://linklysa.io/faq");
    expect(urls).toContain("https://linklysa.io/contact");
  });
});

describe("images uploaded from the admin panel", () => {
  it("converts to WebP, stores in the database and serves from /media", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#178a82" } }).png().toBuffer();
    const { saveUploadedImage, getCmsImage, friendlyImageName } = await import("../lib/cms-images");

    expect(friendlyImageName("My Photo (1).PNG")).toMatch(/^my-photo-1-[0-9a-f]{8}\.webp$/);
    expect(await saveUploadedImage({ data: Buffer.from("not an image"), mime: "image/png", filename: "x.png" })).toMatchObject({ ok: false });
    expect(await saveUploadedImage({ data: png, mime: "application/pdf", filename: "x.pdf" })).toMatchObject({ ok: false });

    const saved = await saveUploadedImage({ data: png, mime: "image/png", filename: "Hero Banner.png" });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.width).toBe(1600); // shrunk to the max width, never enlarged
    expect(saved.url).toMatch(/^\/media\/hero-banner-[0-9a-f]{8}\.webp$/);

    const stored = await getCmsImage(saved.name);
    expect(stored?.mime).toBe("image/webp");
    expect((await sharp(stored!.data).metadata()).format).toBe("webp");
    expect(await getCmsImage("../../etc/passwd")).toBeNull();

    const { GET } = await import("../app/media/[name]/route");
    const ok = await GET(new Request("http://localhost/media/x"), { params: Promise.resolve({ name: saved.name }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("immutable");
    const missing = await GET(new Request("http://localhost/media/x"), { params: Promise.resolve({ name: "nope-12345678.webp" }) });
    expect(missing.status).toBe(404);
  });

  it("keeps the admin endpoints for platform admins only", async () => {
    vi.resetModules();
    vi.doMock("../lib/admin-auth", () => ({ requirePlatformAdmin: async () => null }));
    const media = await import("../app/api/admin/media/route");
    const redirects = await import("../app/api/admin/redirects/route");
    const seo = await import("../app/api/admin/page-seo/route");
    const { NextRequest } = await import("next/server");
    expect((await media.POST(new NextRequest("http://localhost/api/admin/media", { method: "POST" }))).status).toBe(403);
    expect((await redirects.POST(new NextRequest("http://localhost/api/admin/redirects", { method: "POST", body: "{}" }))).status).toBe(403);
    expect((await redirects.GET()).status).toBe(403);
    expect((await seo.PUT(new NextRequest("http://localhost/api/admin/page-seo", { method: "PUT", body: "{}" }))).status).toBe(403);
    vi.doUnmock("../lib/admin-auth");
  });
});

describe("blog categories, related posts and inline links", () => {
  it("cleans category/related input and computes related posts", async () => {
    vi.resetModules();
    const store = await import("../lib/blog-store");
    expect(store.cleanSlugList("A One, b-two\nA One, c_three, , d")).toBe("a-one,b-two,c-three,d");
    const bad = store.cleanBlogInput({ slug: "x", date: "2026-12-01", titleAr: "ع", bodyAr: "ن", categorySlug: "cat" });
    expect(bad.ok).toBe(false); // a category needs a name

    const make = (slug: string, date: string, category?: { slug: string; ar: string }, related = "") => {
      const cleaned = store.cleanBlogInput({ slug, date, titleAr: `عنوان ${slug}`, bodyAr: "نص", titleEn: `Title ${slug}`, bodyEn: "Body", ...(category ? { categorySlug: category.slug, categoryAr: category.ar, categoryEn: category.slug } : {}), relatedSlugs: related, authorName: "فريق لنكلي" });
      if (!cleaned.ok) throw new Error(cleaned.error);
      return store.createBlogPost(cleaned.data);
    };
    await make("rel-a", "2026-12-01", { slug: "ops", ar: "التشغيل" });
    await make("rel-b", "2026-12-02", { slug: "ops", ar: "التشغيل" });
    await make("rel-c", "2026-12-03", { slug: "sales", ar: "المبيعات" }, "rel-a");
    store.clearBlogCache();
    const posts = await store.getPublicPosts();
    const a = posts.find((post) => post.slug === "rel-a")!;
    const c = posts.find((post) => post.slug === "rel-c")!;
    expect(a.author).toBe("فريق لنكلي");
    expect(a.category).toEqual({ slug: "ops", ar: "التشغيل", en: "ops" });
    expect(store.relatedPosts(a, posts, "ar")[0].slug).toBe("rel-b"); // same category first
    expect(store.relatedPosts(c, posts, "ar")[0].slug).toBe("rel-a"); // hand-picked first
    expect(store.listCategories(posts, "ar").find((category) => category.slug === "ops")).toMatchObject({ name: "التشغيل", count: 2 });
    expect(store.postsInCategory(posts, "sales", "ar").map((post) => post.slug)).toEqual(["rel-c"]);
  });
});
