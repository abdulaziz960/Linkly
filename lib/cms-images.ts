import { randomBytes } from "crypto";
import sharp from "sharp";
import type { OutputInfo } from "sharp";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";

/**
 * Images uploaded from the admin panel: converted to WebP (max 1600px wide),
 * stored in the database (Cloud Run has no persistent disk) and served
 * from /media/<name>.webp with a long cache. Names are SEO-friendly: the
 * original file name, cleaned, plus a short id.
 */

export const IMAGE_LIMITS = { maxBytes: 8 * 1024 * 1024, maxWidth: 1600 };
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export function friendlyImageName(original: string): string {
  const base = original.replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return `${base || "image"}-${randomBytes(4).toString("hex")}.webp`;
}

export const MEDIA_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}\.webp$/;

export type SavedImage = { ok: true; url: string; name: string; width: number; height: number; bytes: number } | { ok: false; error: string };

export async function saveUploadedImage(input: { data: Buffer; mime: string; filename: string }): Promise<SavedImage> {
  if (!ALLOWED.has(input.mime)) return { ok: false, error: "نوع الملف غير مدعوم (JPG أو PNG أو WebP أو GIF أو AVIF)" };
  if (input.data.length === 0) return { ok: false, error: "الملف فارغ" };
  if (input.data.length > IMAGE_LIMITS.maxBytes) return { ok: false, error: "حجم الصورة أكبر من 8 ميجابايت" };
  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await sharp(input.data, { failOn: "error" }).rotate().resize({ width: IMAGE_LIMITS.maxWidth, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  } catch {
    return { ok: false, error: "تعذر قراءة الصورة، تأكد أن الملف صورة سليمة" };
  }
  await ensureSchema();
  const name = friendlyImageName(input.filename);
  await prisma.cmsImage.create({ data: { id: `img-${randomBytes(8).toString("hex")}`, name, data: new Uint8Array(output.data), mime: "image/webp", width: output.info.width, height: output.info.height, createdAt: new Date().toISOString() } });
  return { ok: true, url: `/media/${name}`, name, width: output.info.width, height: output.info.height, bytes: output.data.length };
}

export async function getCmsImage(name: string): Promise<{ data: Buffer; mime: string } | null> {
  if (!MEDIA_NAME_PATTERN.test(name)) return null;
  await ensureSchema();
  const row = await prisma.cmsImage.findUnique({ where: { name } });
  return row ? { data: Buffer.from(row.data), mime: row.mime } : null;
}
