import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { blogPosts as defaultPosts, type BlogBlock, type BlogLocale } from "./blog";

/**
 * Blog posts, managed from the admin panel. While nobody has added or edited
 * a post, the built-in posts in lib/blog.ts are shown; the first time the admin
 * page is opened they are copied into the table so they can be edited.
 *
 * A body is plain text: a line starting with "## " is a heading, and text
 * separated by blank lines is a paragraph.
 */

export type PublicPost = { slug: string; date: string; ar: BlogLocale; en: BlogLocale | null };
export type BlogAdminRow = { id: string; slug: string; date: string; titleAr: string; descriptionAr: string; bodyAr: string; titleEn: string; descriptionEn: string; bodyEn: string; published: boolean };

export const BLOG_LIMITS = { title: 200, description: 400, body: 30000, posts: 500 };

export function parseBlogBody(body: string): BlogBlock[] {
  const blocks: BlogBlock[] = [];
  for (const chunk of body.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((line) => line.trimEnd());
    let paragraph: string[] = [];
    const flush = () => {
      const text = paragraph.join("\n").trim();
      if (text) blocks.push({ type: "p", text });
      paragraph = [];
    };
    for (const line of lines) {
      if (line.startsWith("## ")) {
        flush();
        const heading = line.slice(3).trim();
        if (heading) blocks.push({ type: "h2", text: heading });
      } else {
        paragraph.push(line);
      }
    }
    flush();
  }
  return blocks;
}

export function blocksToBody(blocks: BlogBlock[]): string {
  return blocks.map((block) => (block.type === "h2" ? `## ${block.text}` : block.text)).join("\n\n");
}

export function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function toAdminRow(row: { id: string; slug: string; postDate: string; titleAr: string; descriptionAr: string; bodyAr: string; titleEn: string; descriptionEn: string; bodyEn: string; published: number }): BlogAdminRow {
  return { id: row.id, slug: row.slug, date: row.postDate, titleAr: row.titleAr, descriptionAr: row.descriptionAr, bodyAr: row.bodyAr, titleEn: row.titleEn, descriptionEn: row.descriptionEn, bodyEn: row.bodyEn, published: row.published === 1 };
}

function toPublic(row: BlogAdminRow): PublicPost {
  return {
    slug: row.slug,
    date: row.date,
    ar: { title: row.titleAr, description: row.descriptionAr, blocks: parseBlogBody(row.bodyAr) },
    // A post without an English version simply isn't listed under /en.
    en: row.titleEn.trim() && row.bodyEn.trim() ? { title: row.titleEn, description: row.descriptionEn, blocks: parseBlogBody(row.bodyEn) } : null
  };
}

const defaultsAsPublic: PublicPost[] = defaultPosts.map((post) => ({ slug: post.slug, date: post.date, ar: post.ar, en: post.en }));
const CACHE_MS = 30_000;
let cache: { at: number; posts: PublicPost[] | null } | null = null;
export function clearBlogCache() { cache = null; }

/** Published posts, newest first. Never throws: any database problem falls back to the built-in posts. */
export async function getPublicPosts(): Promise<PublicPost[]> {
  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      await ensureSchema();
      const rows = await prisma.blogPost.findMany({ orderBy: [{ postDate: "desc" }, { createdAt: "desc" }] });
      cache = { at: Date.now(), posts: rows.length ? rows.filter((row) => row.published === 1).map((row) => toPublic(toAdminRow(row))).filter((post) => post.ar.title.trim() && post.ar.blocks.length) : null };
    }
    return cache.posts ?? [...defaultsAsPublic].sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("Blog read failed, using built-in posts", error);
    return [...defaultsAsPublic].sort((a, b) => b.date.localeCompare(a.date));
  }
}

export async function getPublicPost(slug: string): Promise<PublicPost | null> {
  return (await getPublicPosts()).find((post) => post.slug === slug) ?? null;
}

export async function listAdminPosts(): Promise<BlogAdminRow[]> {
  await ensureSchema();
  return (await prisma.blogPost.findMany({ orderBy: [{ postDate: "desc" }, { createdAt: "desc" }] })).map(toAdminRow);
}

export async function seedDefaultPostsIfEmpty(): Promise<void> {
  await ensureSchema();
  if ((await prisma.blogPost.count()) > 0) return;
  const now = new Date().toISOString();
  await prisma.blogPost.createMany({
    data: defaultPosts.map((post) => ({
      id: `post-${randomUUID()}`,
      slug: post.slug,
      postDate: post.date,
      titleAr: post.ar.title,
      descriptionAr: post.ar.description,
      bodyAr: blocksToBody(post.ar.blocks),
      titleEn: post.en.title,
      descriptionEn: post.en.description,
      bodyEn: blocksToBody(post.en.blocks),
      published: 1,
      createdAt: now,
      updatedAt: now
    }))
  });
  clearBlogCache();
}

export type BlogInput = { slug?: unknown; date?: unknown; titleAr?: unknown; descriptionAr?: unknown; bodyAr?: unknown; titleEn?: unknown; descriptionEn?: unknown; bodyEn?: unknown; published?: unknown };
export type CleanBlog = { slug: string; date: string; titleAr: string; descriptionAr: string; bodyAr: string; titleEn: string; descriptionEn: string; bodyEn: string; published: boolean };

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function cleanBlogInput(input: BlogInput): { ok: true; data: CleanBlog } | { ok: false; error: string } {
  const data: CleanBlog = {
    slug: normalizeSlug(typeof input.slug === "string" ? input.slug : ""),
    date: text(input.date, 10),
    titleAr: text(input.titleAr, BLOG_LIMITS.title),
    descriptionAr: text(input.descriptionAr, BLOG_LIMITS.description),
    bodyAr: text(input.bodyAr, BLOG_LIMITS.body),
    titleEn: text(input.titleEn, BLOG_LIMITS.title),
    descriptionEn: text(input.descriptionEn, BLOG_LIMITS.description),
    bodyEn: text(input.bodyEn, BLOG_LIMITS.body),
    published: input.published === undefined ? true : Boolean(input.published)
  };
  if (!data.slug) return { ok: false, error: "الرابط المختصر (slug) مطلوب: حروف إنجليزية وأرقام وشرطات فقط" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date))) return { ok: false, error: "التاريخ غير صالح" };
  if (!data.titleAr || !data.bodyAr) return { ok: false, error: "العنوان والمحتوى بالعربية مطلوبان" };
  const anyEn = data.titleEn || data.bodyEn;
  if (anyEn && (!data.titleEn || !data.bodyEn)) return { ok: false, error: "أكمل عنوان ومحتوى النسخة الإنجليزية معًا أو اتركهما فارغين" };
  return { ok: true, data };
}

export type SaveResult = { ok: true; post: BlogAdminRow } | { ok: false; error: string; status: number };

export async function createBlogPost(data: CleanBlog): Promise<SaveResult> {
  await ensureSchema();
  if ((await prisma.blogPost.count()) >= BLOG_LIMITS.posts) return { ok: false, error: "وصلت للحد الأقصى من المقالات", status: 400 };
  if (await prisma.blogPost.findUnique({ where: { slug: data.slug } })) return { ok: false, error: "هذا الرابط المختصر مستخدم في مقال آخر", status: 409 };
  const now = new Date().toISOString();
  const row = await prisma.blogPost.create({ data: { id: `post-${randomUUID()}`, slug: data.slug, postDate: data.date, titleAr: data.titleAr, descriptionAr: data.descriptionAr, bodyAr: data.bodyAr, titleEn: data.titleEn, descriptionEn: data.descriptionEn, bodyEn: data.bodyEn, published: data.published ? 1 : 0, createdAt: now, updatedAt: now } });
  clearBlogCache();
  return { ok: true, post: toAdminRow(row) };
}

export async function updateBlogPost(id: string, data: CleanBlog): Promise<SaveResult> {
  await ensureSchema();
  const clash = await prisma.blogPost.findUnique({ where: { slug: data.slug } });
  if (clash && clash.id !== id) return { ok: false, error: "هذا الرابط المختصر مستخدم في مقال آخر", status: 409 };
  const updated = await prisma.blogPost.updateMany({ where: { id }, data: { slug: data.slug, postDate: data.date, titleAr: data.titleAr, descriptionAr: data.descriptionAr, bodyAr: data.bodyAr, titleEn: data.titleEn, descriptionEn: data.descriptionEn, bodyEn: data.bodyEn, published: data.published ? 1 : 0, updatedAt: new Date().toISOString() } });
  clearBlogCache();
  if (updated.count === 0) return { ok: false, error: "المقال غير موجود", status: 404 };
  const row = await prisma.blogPost.findUnique({ where: { id } });
  return row ? { ok: true, post: toAdminRow(row) } : { ok: false, error: "المقال غير موجود", status: 404 };
}

export async function deleteBlogPost(id: string): Promise<boolean> {
  await ensureSchema();
  const result = await prisma.blogPost.deleteMany({ where: { id } });
  clearBlogCache();
  return result.count > 0;
}
