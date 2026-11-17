import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { cleanLegalInput, listAdminLegalPages, resetLegalPage, saveLegalPage, type LegalInput } from "../../../../lib/legal-store";
import { LEGAL_SLUGS, type LegalSlug } from "../../../../lib/legal-content";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  return jsonOk(await listAdminLegalPages());
}

/** Saves a legal page's text ({ slug, titleAr, updatedAr, bodyAr, titleEn, updatedEn, bodyEn }). */
export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = ((await request.json().catch(() => null)) ?? {}) as { slug?: unknown } & LegalInput;
  const cleaned = cleanLegalInput(body.slug, body);
  if (!cleaned.ok) return jsonError(cleaned.error, 400);
  await saveLegalPage(cleaned.slug, cleaned.data);
  await recordAdminAction(admin, "update-legal-page", { type: "legal", id: cleaned.slug }, "");
  return jsonOk((await listAdminLegalPages()).find((row) => row.slug === cleaned.slug));
}

/** Puts a page back to its built-in text (?slug=privacy). */
export async function DELETE(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug || !(LEGAL_SLUGS as readonly string[]).includes(slug)) return jsonError("صفحة غير معروفة", 400);
  await resetLegalPage(slug as LegalSlug);
  await recordAdminAction(admin, "reset-legal-page", { type: "legal", id: slug }, "");
  return jsonOk({ reset: true });
}
