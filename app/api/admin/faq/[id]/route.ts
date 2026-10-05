import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../lib/admin-audit";
import { cleanFaqInput, deleteFaqItem, updateFaqItem, type FaqInput } from "../../../../../lib/faq-store";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as FaqInput | null;
  const cleaned = cleanFaqInput(body ?? {});
  if (!cleaned.ok) return jsonError(cleaned.error, 400);

  const item = await updateFaqItem(id, cleaned.data);
  if (!item) return jsonError("السؤال غير موجود", 404);
  await recordAdminAction(admin, "update-faq", { type: "faq", id }, JSON.stringify({ question: item.questionAr, active: item.active }));
  return jsonOk(item);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin("content");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const { id } = await params;
  if (!(await deleteFaqItem(id))) return jsonError("السؤال غير موجود", 404);
  await recordAdminAction(admin, "delete-faq", { type: "faq", id }, "");
  return jsonOk({ deleted: true });
}
