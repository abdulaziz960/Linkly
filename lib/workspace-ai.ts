import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { decryptSecret } from "./secret-storage";
import { defaultAiConnection, generateAiText, type AiContext } from "./ai-provider";
import type { AiProvider, AiSettingsPublic } from "./ai-types";

export async function getPublicAiSettings(tenantId: string): Promise<AiSettingsPublic> {
  await ensureSchema();
  const row = await prisma.aiWorkspaceSetting.findUnique({ where: { tenantId } });
  const fallback = defaultAiConnection();
  return row ? {
    provider: row.provider as AiProvider, model: row.model, enabled: row.enabled === 1, hasKey: Boolean(row.apiKey),
    prompt: row.prompt, dailyLimit: row.dailyLimit, monthlyLimit: row.monthlyLimit, inputRate: row.inputRate, outputRate: row.outputRate
  } : { provider: "gemini", model: fallback.model, enabled: Boolean(fallback.apiKey), hasKey: Boolean(fallback.apiKey), prompt: "", dailyLimit: 100, monthlyLimit: 1000, inputRate: null, outputRate: null };
}

export async function runWorkspaceAi(tenantId: string, userId: string, conversationId: string, context: AiContext) {
  await ensureSchema();
  const setting = await prisma.aiWorkspaceSetting.findUnique({ where: { tenantId } });
  let connection = defaultAiConnection();
  if (setting) {
    if (!setting.enabled) return { suggestion: null, reason: "disabled" };
    try { connection = { provider: setting.provider as AiProvider, model: setting.model, apiKey: decryptSecret(setting.apiKey) }; }
    catch { return { suggestion: null, reason: "key_unavailable" }; }
  }
  if (!connection.apiKey) return { suggestion: null, reason: "not_configured" };
  const now = new Date().toISOString();
  const periods = [now.slice(0, 10), now.slice(0, 7)];
  const limits = [setting?.dailyLimit ?? 100, setting?.monthlyLimit ?? 1000];
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
