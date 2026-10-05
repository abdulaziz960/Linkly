import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-blog-store.db");

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

describe("blog managed from the admin panel", () => {
  it("parses the plain-text body into headings and paragraphs, and back", async () => {
    const { parseBlogBody, blocksToBody } = await import("../lib/blog-store");
    const blocks = parseBlogBody("مقدمة\n\n## عنوان فرعي\nفقرة تحت العنوان\n\n### عنوان أصغر\nنص\n\nفقرة أخيرة");
    expect(blocks).toEqual([{ type: "p", text: "مقدمة" }, { type: "h2", text: "عنوان فرعي" }, { type: "p", text: "فقرة تحت العنوان" }, { type: "h3", text: "عنوان أصغر" }, { type: "p", text: "نص" }, { type: "p", text: "فقرة أخيرة" }]);
    expect(parseBlogBody(blocksToBody(blocks))).toEqual(blocks);
  });

  it("shows the built-in posts until configured, then serves published posts newest first", async () => {
    const { getPublicPosts, getPublicPost, seedDefaultPostsIfEmpty, listAdminPosts, createBlogPost, updateBlogPost, deleteBlogPost, cleanBlogInput, clearBlogCache } = await import("../lib/blog-store");
    const { blogPosts } = await import("../lib/blog");
    clearBlogCache();
    expect((await getPublicPosts()).map((post) => post.slug)).toEqual(blogPosts.map((post) => post.slug));

    await seedDefaultPostsIfEmpty();
    await seedDefaultPostsIfEmpty();
    const seeded = await listAdminPosts();
    expect(seeded).toHaveLength(blogPosts.length);
    expect(seeded[0].bodyAr).toContain("## ");

    const arOnly = cleanBlogInput({ slug: "Arabic Only Post!", date: "2026-11-01", titleAr: "مقال عربي فقط", descriptionAr: "وصف", bodyAr: "## عنوان\n\nنص" });
    expect(arOnly.ok && arOnly.data.slug).toBe("arabic-only-post");
    const created = await createBlogPost(arOnly.ok ? arOnly.data : (undefined as never));
    expect(created.ok).toBe(true);

    clearBlogCache();
    const posts = await getPublicPosts();
    expect(posts[0].slug).toBe("arabic-only-post"); // newest date first
    expect(posts[0].en).toBeNull(); // no English version -> not offered under /en

    // A duplicate slug is refused; hiding removes it from the public list; deleting removes it for good.
    const clash = await createBlogPost(arOnly.ok ? arOnly.data : (undefined as never));
    expect(clash).toMatchObject({ ok: false, status: 409 });
    if (created.ok) {
      await updateBlogPost(created.post.id, { ...(arOnly.ok ? arOnly.data : (undefined as never)), published: false });
      expect(await getPublicPost("arabic-only-post")).toBeNull();
      expect(await deleteBlogPost(created.post.id)).toBe(true);
    }
  });

  it("validates the input", async () => {
    const { cleanBlogInput } = await import("../lib/blog-store");
    expect(cleanBlogInput({ slug: "!!!", date: "2026-11-01", titleAr: "ع", bodyAr: "ن" }).ok).toBe(false);
    expect(cleanBlogInput({ slug: "ok", date: "not-a-date", titleAr: "ع", bodyAr: "ن" }).ok).toBe(false);
    expect(cleanBlogInput({ slug: "ok", date: "2026-11-01", titleAr: "", bodyAr: "ن" }).ok).toBe(false);
    expect(cleanBlogInput({ slug: "ok", date: "2026-11-01", titleAr: "ع", bodyAr: "ن", titleEn: "T" }).ok).toBe(false);
    expect(cleanBlogInput({ slug: "ok", date: "2026-11-01", titleAr: "ع", bodyAr: "ن", titleEn: "T", bodyEn: "B" }).ok).toBe(true);
  });

  it("keeps the admin API for platform admins only", async () => {
    vi.resetModules();
    vi.doMock("../lib/admin-auth", () => ({ requirePlatformAdmin: async () => null }));
    const { POST } = await import("../app/api/admin/blog/route");
    const response = await POST(new Request("http://localhost/x", { method: "POST", body: "{}" }) as never);
    expect(response.status).toBe(403);
    vi.doUnmock("../lib/admin-auth");
  });
});

describe("blog SEO fields", () => {
  it("stores SEO fields, validates URLs, and builds metadata with fallbacks", async () => {
    const { cleanBlogInput, createBlogPost, getPublicPost, clearBlogCache } = await import("../lib/blog-store");
    const { postMetadata } = await import("../lib/blog-seo");
    const base = { slug: "seo-test-post", date: "2026-11-05", titleAr: "عنوان", descriptionAr: "وصف", bodyAr: "نص", titleEn: "Title", descriptionEn: "Desc", bodyEn: "Body" };

    expect(cleanBlogInput({ ...base, canonicalUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(cleanBlogInput({ ...base, canonicalUrl: "/blog/x" }).ok).toBe(false); // canonical must be absolute
    expect(cleanBlogInput({ ...base, featuredImage: "data:text/html,x" }).ok).toBe(false);
    expect(cleanBlogInput({ ...base, ogImage: "//evil.example/x.png" }).ok).toBe(false);

    const cleaned = cleanBlogInput({ ...base, metaTitleAr: "عنوان SEO", canonicalUrl: "https://linklysa.io/blog/custom", featuredImage: "/assets/linkly-logo.png", imageAltAr: "شعار", noindex: false });
    expect(cleaned.ok).toBe(true);
    if (!cleaned.ok) return;
    const created = await createBlogPost(cleaned.data);
    expect(created.ok).toBe(true);
    clearBlogCache();

    const post = await getPublicPost("seo-test-post");
    expect(post).not.toBeNull();
    const ar = postMetadata(post!, "ar");
    expect(ar.title).toBe("عنوان SEO");
    expect(ar.description).toBe("وصف"); // falls back to the article description
    expect(ar.alternates?.canonical).toBe("https://linklysa.io/blog/custom");
    expect(ar.robots).toBeUndefined();
    expect((ar.openGraph as { images?: Array<{ url: string; alt: string }> }).images?.[0]).toEqual({ url: "/assets/linkly-logo.png", alt: "شعار" });
    const en = postMetadata(post!, "en");
    expect(en.alternates?.canonical).toBe("/en/blog/seo-test-post"); // the override is for the Arabic page only
  });

  it("noindex posts are marked robots noindex and left out of the sitemap", async () => {
    const { cleanBlogInput, createBlogPost, getPublicPost, clearBlogCache } = await import("../lib/blog-store");
    const { postMetadata } = await import("../lib/blog-seo");
    const cleaned = cleanBlogInput({ slug: "hidden-from-search", date: "2026-11-06", titleAr: "مخفي", bodyAr: "نص", noindex: true });
    if (!cleaned.ok) throw new Error(cleaned.error);
    await createBlogPost(cleaned.data);
    clearBlogCache();
    const post = await getPublicPost("hidden-from-search");
    expect(postMetadata(post!, "ar").robots).toEqual({ index: false, follow: true });
    const sitemap = (await import("../app/sitemap")).default;
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.includes("hidden-from-search"))).toBe(false);
    expect(urls.some((url) => url.includes("seo-test-post"))).toBe(true);
  });
});
