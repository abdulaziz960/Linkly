import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { decryptSecret } from "./secret-storage";
import { defaultAiConnection, generateAiText, type AiConnection, type AiContext } from "./ai-provider";
import type { AiProvider, AiSettingsPublic } from "./ai-types";

// A tenant's *current* plan, looked up fresh every call rather than cached -
// an upgrade/downgrade must take effect on the very next message, not wait
// for some other cache to expire.
async function getTenantPlanAiLimits(tenantId: string): Promise<{ dailyLimit: number; monthlyLimit: number } | null> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, select: { plan: true } });
  if (!subscription) return null;
  const plan = await prisma.plan.findUnique({ where: { name: subscription.plan } });
  if (!plan || plan.aiDailyLimit <= 0) return null;
  return { dailyLimit: plan.aiDailyLimit, monthlyLimit: plan.aiMonthlyLimit };
}

export async function getPublicAiSettings(tenantId: string): Promise<AiSettingsPublic> {
  await ensureSchema();
  const row = await prisma.aiWorkspaceSetting.findUnique({ where: { tenantId } });
  const planLimits = await getTenantPlanAiLimits(tenantId);
  const managedKeyConfigured = Boolean(defaultAiConnection().apiKey);
  const shared = {
    managedAvailable: Boolean(planLimits),
    managedReady: Boolean(planLimits) && managedKeyConfigured,
    managedDailyLimit: planLimits?.dailyLimit ?? 0,
    managedMonthlyLimit: planLimits?.monthlyLimit ?? 0
  };
  return row ? {
    provider: row.provider as AiProvider, model: row.model, enabled: row.enabled === 1, hasKey: Boolean(row.apiKey),
    prompt: row.prompt, dailyLimit: row.dailyLimit, monthlyLimit: row.monthlyLimit, inputRate: row.inputRate, outputRate: row.outputRate,
    ...shared
  } : { provider: "gemini", model: defaultAiConnection().model, enabled: false, hasKey: false, prompt: "", dailyLimit: 100, monthlyLimit: 1000, inputRate: null, outputRate: null, ...shared };
}

export async function runWorkspaceAi(tenantId: string, userId: string, conversationId: string, context: AiContext) {
  await ensureSchema();
  const setting = await prisma.aiWorkspaceSetting.findUnique({ where: { tenantId } });
  // No row, or the tenant hasn't switched this on, means AI never runs -
  // there is no implicit default-on state, whether BYOK or managed.
  if (!setting || setting.enabled !== 1) return { suggestion: null, reason: "disabled" };

  let connection: AiConnection;
  let limits: [number, number];
  if (setting.apiKey) {
    // Bring-your-own-key: the tenant's own provider/model/key and their own
    // configured daily/monthly limits, unaffected by plan.
    try { connection = { provider: setting.provider as AiProvider, model: setting.model, apiKey: decryptSecret(setting.apiKey) }; }
    catch { return { suggestion: null, reason: "key_unavailable" }; }
    limits = [setting.dailyLimit, setting.monthlyLimit];
  } else {
    // Managed mode: no key of their own, so this only works on a plan that
    // includes the AI Copilot, using Linkly's own key and that plan's limits
    // (set by an admin under cost, not the tenant).
    const planLimits = await getTenantPlanAiLimits(tenantId);
    if (!planLimits) return { suggestion: null, reason: "plan_upgrade_required" };
    connection = defaultAiConnection();
    if (!connection.apiKey) return { suggestion: null, reason: "managed_not_ready" };
    limits = [planLimits.dailyLimit, planLimits.monthlyLimit];
  }

  const now = new Date().toISOString();
  const periods = [now.slice(0, 10), now.slice(0, 7)];
  const eventId = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < periods.length; index++) {
        const id = `${tenantId}:${periods[index]}`;
        await tx.aiUsageBucket.upsert({ where: { id }, update: {}, create: { id, tenantId, period: periods[index] } });
        const reserved = await tx.aiUsageBucket.updateMany({ where: { id, count: { lt: limits[index] } }, data: { count: { increment: 1 } } });
        if (!reserved.count) throw new Error("ai-limit");
      }
      await tx.aiUsageEvent.create({ data: {
        id: eventId, tenantId, userId, conversationId, provider: connection.provider, model: connection.model,
        operation: context.operation || "reply", status: "pending", createdAt: now
      } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ai-limit") return { suggestion: null, reason: "usage_limit" };
    throw error;
  }
  const result = await generateAiText(connection, { ...context, prompt: setting?.prompt || "" });
  const cost = result && result.inputTokens !== null && result.outputTokens !== null && setting?.inputRate != null && setting.outputRate != null
    ? (result.inputTokens * setting.inputRate + result.outputTokens * setting.outputRate) / 1000000 : null;
  await prisma.aiUsageEvent.update({ where: { id: eventId }, data: {
    status: result ? "succeeded" : "failed", inputTokens: result?.inputTokens, outputTokens: result?.outputTokens, estimatedCost: cost
  } });
  return { suggestion: result?.text || null, ...(result ? {} : { reason: "provider_unavailable" }) };
}
