import { NextRequest } from "next/server";
import { getAutomationRules } from "../../../lib/database";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getAutomationRules());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string; description?: string; enabled?: boolean };
  if (!body.name?.trim()) return jsonError("اسم قاعدة الأتمتة مطلوب");

  const rule = await prisma.automationRule.create({
    data: {
      id: `auto-${Date.now()}`,
      name: body.name.trim(),
      description: body.description?.trim() || "",
      createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      enabled: body.enabled === false ? 0 : 1
    }
  });

  return jsonOk(rule);
}
