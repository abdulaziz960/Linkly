import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-managed-deepseek.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("AI_MANAGED_PROVIDER", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("DEEPSEEK_API_KEY", "");
  vi.stubEnv("AI_MANAGED_BUDGET_SAR", "50");
});

afterEach(() => vi.unstubAllGlobals());

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

const customerReply = { messages: [{ direction: "in" as const, text: "كم سعر الفيلا؟" }], customerName: "عميل", language: "ar" as const, operation: "reply" as const };

async function workspace(tenantId: string) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.plan.upsert({ where: { id: "ds-plan" }, update: {}, create: { id: "ds-plan", name: "ds-plan", aiDailyLimit: 50, aiMonthlyLimit: 1000, createdAt: now, updatedAt: now } });
  await prisma.subscription.create({ data: { id: `${tenantId}-sub`, tenantId, companyName: "T", ownerName: "O", ownerEmail: `${tenantId}@example.test`, plan: "ds-plan", createdAt: now, updatedAt: now } });
  await prisma.aiWorkspaceSetting.create({ data: { tenantId, provider: "gemini", model: "gemini-3.5-flash-lite", enabled: 1, apiKey: "", updatedAt: now } });
  await prisma.customer.create({ data: { id: `${tenantId}-c`, tenantId, name: "عميل", phone: tenantId, initial: "ع" } });
  await prisma.conversation.create({ data: { id: `${tenantId}-conv`, tenantId, customerId: `${tenantId}-c`, lastMessage: "x", status: "assigned", assignee: "" } });
  return `${tenantId}-conv`;
}

describe("Linkly's managed assistant on DeepSeek", () => {
  it("stays employee-only while no DeepSeek key exists", async () => {
    const conversationId = await workspace("ds-nokey");
    const { runWorkspaceAi } = await import("../lib/workspace-ai");
    expect(await runWorkspaceAi("ds-nokey", "bot", conversationId, customerReply)).toMatchObject({ reason: "managed_not_ready" });
  });

  it("answers a customer without the workspace's own key, within the plan limit, and says it is ready", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    const conversationId = await workspace("ds-ready");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "السعر يبدأ من ٩٥٠ ألف" } }], usage: { prompt_tokens: 1000, completion_tokens: 50 } })));
    vi.stubGlobal("fetch", fetchMock);
    const { runWorkspaceAi, getPublicAiSettings } = await import("../lib/workspace-ai");
    const { getCrmAiSettings } = await import("../lib/crm-ai");

    expect(await getPublicAiSettings("ds-ready")).toMatchObject({ managedReplies: true, managedReady: true, managedProvider: "deepseek" });
    expect((await getCrmAiSettings("ds-ready")).aiReady).toBe(true);

    expect(await runWorkspaceAi("ds-ready", "bot", conversationId, customerReply)).toEqual({ suggestion: "السعر يبدأ من ٩٥٠ ألف" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "deepseek-flash", max_tokens: 700, thinking: { type: "disabled" } });
    expect(init.headers.Authorization).toBe("Bearer sk-test-deepseek");

    const { prisma } = await import("../lib/prisma");
    const event = await prisma.aiUsageEvent.findFirstOrThrow({ where: { tenantId: "ds-ready" } });
    expect(event).toMatchObject({ status: "succeeded", provider: "deepseek", model: "deepseek-flash" });
    expect(event.estimatedCost).toBeCloseTo((1000 * 0.3 + 50 * 1.2) / 1_000_000);
  });

  it("takes the model name from the environment", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
    vi.stubEnv("AI_MANAGED_DEEPSEEK_MODEL", "deepseek-pro-test");
    const { managedReplyConnection } = await import("../lib/ai-provider");
    expect(managedReplyConnection()).toMatchObject({ provider: "deepseek", model: "deepseek-pro-test" });
    vi.stubEnv("AI_MANAGED_DEEPSEEK_MODEL", "");
  });
});
