import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ id: "ai-owner", name: "Owner", email: "owner@ai.test", role: "مالك الحساب", tenantId: "ai-workspace" }));
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => session) }));
const path = join(process.cwd(), "tests", ".tmp-workspace-ai.db");
beforeAll(async () => {
  if (existsSync(path)) unlinkSync(path);
  vi.stubEnv("DATABASE_URL", `file:${path}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "workspace-ai-test-key-not-production");
  vi.stubEnv("GEMINI_API_KEY", "");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});
afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(path + suffix)) unlinkSync(path + suffix);
});
const settings = { provider: "openai", model: "test-model", enabled: true, prompt: "Be concise", dailyLimit: 10, monthlyLimit: 1, inputRate: 2, outputRate: 8 };
function put(body: object) { return new NextRequest("http://localhost/api/ai/settings", { method: "PUT", body: JSON.stringify(body) }); }
const context = { messages: [{ direction: "in" as const, text: "Hello" }], customerName: "Customer", language: "en" as const };

describe("workspace AI controls", () => {
  it("encrypts keys and never returns them or writes them to audit logs", async () => {
    const { PUT, GET } = await import("../app/api/ai/settings/route");
    const { prisma } = await import("../lib/prisma");
    const response = await PUT(put({ ...settings, apiKey: "secret-openai-test" }));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("secret-openai-test");
    const stored = await prisma.aiWorkspaceSetting.findUniqueOrThrow({ where: { tenantId: session.tenantId } });
    expect(stored.apiKey).toMatch(/^enc:v1:/);
    const publicResponse = await GET();
    const body = await publicResponse.text();
    expect(body).not.toContain(stored.apiKey);
    expect(body).not.toContain("secret-openai-test");
    const logs = await prisma.adminLog.findMany({ where: { clientId: session.tenantId } });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain("secret-openai-test");
  });
  it("records usage and cost, enforces monthly limit and rolls back the daily reservation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Hello back" } }], usage: { prompt_tokens: 100, completion_tokens: 50 } })));
    vi.stubGlobal("fetch", fetchMock);
    const { runWorkspaceAi } = await import("../lib/workspace-ai");
    const { prisma } = await import("../lib/prisma");
    expect(await runWorkspaceAi(session.tenantId, session.id, "conversation", context)).toEqual({ suggestion: "Hello back" });
    expect(await runWorkspaceAi(session.tenantId, session.id, "conversation", context)).toMatchObject({ reason: "usage_limit" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const buckets = await prisma.aiUsageBucket.findMany({ where: { tenantId: session.tenantId } });
    expect(buckets.map((bucket) => bucket.count)).toEqual([1, 1]);
    const event = await prisma.aiUsageEvent.findFirstOrThrow({ where: { tenantId: session.tenantId } });
    expect(event.status).toBe("succeeded");
    expect(event.estimatedCost).toBeCloseTo(0.0006);
    const { GET } = await import("../app/api/ai/settings/route");
    session.tenantId = "other-ai-workspace";
    const other = await (await GET()).json();
    expect(other.data.events).toEqual([]);
    expect(other.data.monthlyUsed).toBe(0);
    session.tenantId = "ai-workspace";
  });
  it("keeps an existing key on blank update and clears it on provider switch", async () => {
    const { PUT } = await import("../app/api/ai/settings/route");
    const { prisma } = await import("../lib/prisma");
    await PUT(put({ ...settings, apiKey: "" }));
    expect((await prisma.aiWorkspaceSetting.findUniqueOrThrow({ where: { tenantId: session.tenantId } })).apiKey).toMatch(/^enc:v1:/);
    await PUT(put({ ...settings, provider: "deepseek", apiKey: "" }));
    expect((await prisma.aiWorkspaceSetting.findUniqueOrThrow({ where: { tenantId: session.tenantId } })).apiKey).toBe("");
  });
  it("rejects non-owner settings changes and invalid limits", async () => {
    const { PUT } = await import("../app/api/ai/settings/route");
    expect((await PUT(put({ ...settings, dailyLimit: -1 }))).status).toBe(400);
    session.role = "موظف";
    expect((await PUT(put(settings))).status).toBe(403);
    session.role = "مالك الحساب";
  });
  it("blocks Copilot access to another employee's conversation", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.customer.create({ data: { id: "ai-customer", tenantId: session.tenantId, name: "Customer", phone: "123", initial: "C" } });
    await prisma.conversation.create({ data: { id: "ai-private", tenantId: session.tenantId, customerId: "ai-customer", lastMessage: "private", assignee: "Another employee", status: "assigned" } });
    session.role = "موظف";
    const { POST } = await import("../app/api/conversations/[id]/suggest-reply/route");
    expect((await POST(new NextRequest("http://localhost/api/conversations/ai-private/suggest-reply", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "ai-private" }) })).status).toBe(404);
    session.role = "مالك الحساب";
  });
});
