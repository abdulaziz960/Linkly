import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getAutomationRules } from "../../../lib/database";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

type AutomationConditionInput = { field?: string; operator?: string; value?: string };
type AutomationActionInput = { type?: string; target?: string };

function cleanConditions(conditions?: AutomationConditionInput[]) {
  if (!Array.isArray(conditions)) return [];

  return conditions.map((condition) => ({
    field: condition.field?.trim() || "الرسالة تحتوي على",
    operator: condition.operator?.trim() || "يساوي",
    value: condition.value?.trim() || ""
  }));
}

function cleanActions(actions?: AutomationActionInput[]) {
  if (!Array.isArray(actions)) return [];

  return actions.map((action) => ({
    type: action.type?.trim() || "فتح المحادثة",
    target: action.target?.trim() || "لا يحتاج اختيار"
  }));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "automations"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk(await getAutomationRules(user.tenantId));
}

export async function POST(request: NextRequest) {
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
  if (!body.name?.trim()) return jsonError("اسم قاعدة الأتمتة مطلوب");

  const rule = await prisma.automationRule.create({
    data: {
      id: `auto-${randomUUID()}`,
      tenantId: user.tenantId,
      name: body.name.trim(),
      description: body.description?.trim() || "",
      trigger: body.trigger?.trim() || "رسالة واردة",
      action: body.action?.trim() || "تعيين المحادثة",
      target: body.target?.trim() || "بدون موظف",
      delayMinutes: Math.max(0, Number(body.delayMinutes) || 0),
      conditionsJson: JSON.stringify(cleanConditions(body.conditions)),
      actionsJson: JSON.stringify(cleanActions(body.actions)),
      createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      enabled: body.enabled === false ? 0 : 1
    }
  });

  return jsonOk(rule);
}
