import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { encryptSecret } from "../../../../lib/secret-storage";
import { ensureSchema } from "../../../../lib/database";
import { aiProviders } from "../../../../lib/ai-types";
import { getPublicAiSettings } from "../../../../lib/workspace-ai";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("إعدادات المزود متاحة لمالك الحساب", 403);
  const settings = await getPublicAiSettings(user.tenantId);
  const now = new Date().toISOString();
  const [buckets, events] = await Promise.all([
    prisma.aiUsageBucket.findMany({ where: { tenantId: user.tenantId, period: { in: [now.slice(0, 10), now.slice(0, 7)] } } }),
    prisma.aiUsageEvent.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 50 })
  ]);
  return jsonOk({ settings, dailyUsed: buckets.find((item) => item.period.length === 10)?.count || 0,
    monthlyUsed: buckets.find((item) => item.period.length === 7)?.count || 0, events });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (user.role !== "مالك الحساب") return jsonError("إعدادات المزود متاحة لمالك الحساب", 403);
  const body = await request.json().catch(() => null);
  if (!body || !aiProviders.includes(body.provider) || typeof body.model !== "string" || !/^[A-Za-z0-9._:/-]{1,150}$/.test(body.model)
    || typeof body.enabled !== "boolean" || typeof body.prompt !== "string" || body.prompt.length > 4000
    || !Number.isInteger(body.dailyLimit) || body.dailyLimit < 0 || body.dailyLimit > 100000
    || !Number.isInteger(body.monthlyLimit) || body.monthlyLimit < 0 || body.monthlyLimit > 1000000
    || (body.apiKey !== undefined && (typeof body.apiKey !== "string" || body.apiKey.length > 4096 || body.apiKey.trim().startsWith("enc:")))) {
    return jsonError("تحقق من المزود والموديل وحدود الاستخدام", 400);
  }
  for (const field of ["inputRate", "outputRate"]) {
    if (body[field] !== null && (typeof body[field] !== "number" || !Number.isFinite(body[field]) || body[field] < 0 || body[field] > 100000)) {
      return jsonError("أسعار التوكنات غير صالحة", 400);
    }
  }
  await ensureSchema();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.aiWorkspaceSetting.findUnique({ where: { tenantId: user.tenantId } });
    // Switching providers must never reuse the previous provider's key.
    const apiKey = body.apiKey?.trim() ? encryptSecret(body.apiKey.trim())
      : existing && existing.provider === body.provider ? existing.apiKey
      : !existing && body.provider === "gemini" ? encryptSecret(process.env.GEMINI_API_KEY?.trim() || "") : "";
    const data = { provider: body.provider, model: body.model, enabled: body.enabled ? 1 : 0,
      prompt: body.prompt, dailyLimit: body.dailyLimit, monthlyLimit: body.monthlyLimit,
      inputRate: body.inputRate, outputRate: body.outputRate, apiKey, updatedAt: new Date().toISOString() };
    await tx.aiWorkspaceSetting.upsert({ where: { tenantId: user.tenantId }, update: data, create: { tenantId: user.tenantId, ...data } });
    await tx.adminLog.create({ data: { id: randomUUID(), at: data.updatedAt, clientId: user.tenantId,
      clientName: user.name, source: "AI settings", level: "معلومة",
      message: JSON.stringify({ actorId: user.id, action: "ai.settings.updated", before: existing ? {
        provider: existing.provider, model: existing.model, enabled: existing.enabled, dailyLimit: existing.dailyLimit, monthlyLimit: existing.monthlyLimit
      } : null, after: { provider: data.provider, model: data.model, enabled: data.enabled, dailyLimit: data.dailyLimit, monthlyLimit: data.monthlyLimit }, keyChanged: Boolean(body.apiKey?.trim()) })
    } });
  });
  return jsonOk(await getPublicAiSettings(user.tenantId));
}
