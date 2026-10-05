import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { cleanFaqInput, createFaqItem, listFaqItems, seedDefaultFaqsIfEmpty, type FaqInput } from "../../../../lib/faq-store";
import { jsonError, jsonOk } from "../../_utils/json";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  await seedDefaultFaqsIfEmpty();
  return jsonOk(await listFaqItems());
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);

  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const body = (await request.json().catch(() => null)) as FaqInput | null;
  const cleaned = cleanFaqInput(body ?? {});
  if (!cleaned.ok) return jsonError(cleaned.error, 400);

  await seedDefaultFaqsIfEmpty();
  const item = await createFaqItem(cleaned.data);
  if (!item) return jsonError("وصلت للحد الأقصى من الأسئلة", 400);
  await recordAdminAction(admin, "create-faq", { type: "faq", id: item.id }, JSON.stringify({ question: item.questionAr }));
  return jsonOk(item);
}
