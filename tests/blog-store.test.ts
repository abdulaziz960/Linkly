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
    const blocks = parseBlogBody("مقدمة\n\n## عنوان فرعي\nفقرة تحت العنوان\n\nفقرة أخيرة");
    expect(blocks).toEqual([{ type: "p", text: "مقدمة" }, { type: "h2", text: "عنوان فرعي" }, { type: "p", text: "فقرة تحت العنوان" }, { type: "p", text: "فقرة أخيرة" }]);
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
