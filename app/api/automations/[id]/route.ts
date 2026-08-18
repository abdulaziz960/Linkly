import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { jsonError, jsonOk } from "../../_utils/json";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

type AutomationConditionInput = { field?: string; operator?: string; value?: string };
type AutomationActionInput = { type?: string; target?: string };

function cleanConditions(conditions?: AutomationConditionInput[]) {
  if (!Array.isArray(conditions)) return undefined;

  return JSON.stringify(conditions.map((condition) => ({
    field: condition.field?.trim() || "الرسالة تحتوي على",
    operator: condition.operator?.trim() || "يساوي",
    value: condition.value?.trim() || ""
  })));
}

function cleanActions(actions?: AutomationActionInput[]) {
  if (!Array.isArray(actions)) return undefined;

  return JSON.stringify(actions.map((action) => ({
    type: action.type?.trim() || "فتح المحادثة",
    target: action.target?.trim() || "لا يحتاج اختيار"
  })));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "automations"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    trigger?: string;
    action?: string;
    target?: string;
    delayMinutes?: number;
    conditions?: AutomationConditionInput[];
    actions?: AutomationActionInput[];
    enabled?: boolean;
  };
  try {
    const existing = await prisma.automationRule.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return jsonError("تعذر تحديث الأتمتة", 404);

    return jsonOk(await prisma.automationRule.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        description: body.description?.trim(),
        trigger: body.trigger?.trim(),
        action: body.action?.trim(),
        target: body.target?.trim(),
        delayMinutes: typeof body.delayMinutes === "number" ? Math.max(0, body.delayMinutes) : undefined,
        conditionsJson: cleanConditions(body.conditions),
        actionsJson: cleanActions(body.actions),
        enabled: typeof body.enabled === "boolean" ? (body.enabled ? 1 : 0) : undefined
      }
    }));
  } catch {
    return jsonError("تعذر تحديث الأتمتة", 404);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "automations"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  try {
    const existing = await prisma.automationRule.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return jsonError("تعذر حذف الأتمتة", 404);

    await prisma.automationRule.delete({ where: { id } });
    return jsonOk({ id });
  } catch {
    return jsonError("تعذر حذف الأتمتة", 404);
  }
}
