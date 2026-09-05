import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { simulateAutomationRules, SimulationTrigger } from "../../../../lib/automation-engine";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

const messageDrivenTriggers: SimulationTrigger[] = ["تم إنشاء رسالة", "تم فتح محادثة", "رد العميل"];

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "automations"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as {
    trigger?: string;
    messageText?: string;
    status?: string;
    tagNames?: string[];
    channel?: string;
  } | null;

  const trigger = body?.trigger;
  if (!trigger || !messageDrivenTriggers.includes(trigger as SimulationTrigger)) {
    return jsonError("اختر حدثاً صالحاً للمحاكاة");
  }
  const messageText = body?.messageText?.trim();
  if (!messageText) return jsonError("اكتب رسالة تجريبية أولاً");

  const matches = await simulateAutomationRules(user.tenantId, {
    trigger: trigger as SimulationTrigger,
    messageText,
    status: body?.status,
    tagNames: Array.isArray(body?.tagNames) ? body.tagNames : undefined,
    channel: body?.channel
  });

  return jsonOk(matches);
}
