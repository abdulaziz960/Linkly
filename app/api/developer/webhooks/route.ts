import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { createWebhook, listWebhooks, isValidWebhookEvent } from "../../../../lib/webhooks";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "developers"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  return jsonOk(await listWebhooks(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "developers"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as { url?: string; events?: string[] } | null;
  const url = body?.url?.trim() || "";
  const events = Array.isArray(body?.events) ? body.events.filter(isValidWebhookEvent) : [];

  if (!url) return jsonError("رابط الـ Webhook مطلوب");
  try {
    if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error("invalid protocol");
  } catch {
    return jsonError("رابط الـ Webhook غير صحيح");
  }
  if (!events.length) return jsonError("اختر حدثاً واحداً على الأقل");

  const webhook = await createWebhook(user.tenantId, { url, events });
  return jsonOk(webhook);
}
