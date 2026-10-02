import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-ai-grounding.db");
const tenantId = "tenant-ai-grounding";

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("findKbContext", () => {
  it("returns the relevant entries, most similar first, and ignores unrelated ones and other tenants", async () => {
    const { createKbEntry, findKbContext } = await import("../lib/knowledge-base");
    await createKbEntry(tenantId, { question: "كم سعر الاشتراك الشهري؟", answer: "يبدأ من 199 ريال شهريا" });
    await createKbEntry(tenantId, { question: "ما هي ساعات العمل؟", answer: "من الأحد إلى الخميس من 9 صباحا إلى 6 مساء" });
    await createKbEntry("tenant-ai-grounding-other", { question: "كم سعر الاشتراك الشهري؟", answer: "سعر سري لعميل آخر" });

    const results = await findKbContext(tenantId, "كم سعر الاشتراك الشهري عندكم؟");
    expect(results[0]?.answer).toBe("يبدأ من 199 ريال شهريا");
    expect(results.some((entry) => entry.answer.includes("سري"))).toBe(false);

    expect(await findKbContext(tenantId, "xyz qwerty zzz")).toEqual([]);
    expect(await findKbContext(tenantId, "   ")).toEqual([]);
  });
});

describe("knowledge-grounded prompt", () => {
  async function capturePrompt(context: Record<string, unknown>) {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ done: true, message: { content: "رد" } })));
    vi.stubGlobal("fetch", fetchMock);
    const { generateAiText } = await import("../lib/ai-provider");
    await generateAiText(
      { provider: "ollama", model: "local-test", apiKey: "" },
      { source: "copilot", operation: "reply", messages: [{ direction: "in", text: "كم السعر؟" }], customerName: "", language: "ar", ...context }
    );
    return JSON.parse(fetchMock.mock.calls[0][1]?.body as string).messages[0].content as string;
  }

  it("includes the approved facts and the trust rule, but no strict NO_ANSWER rule for employee suggestions", async () => {
    const system = await capturePrompt({ knowledge: [{ question: "كم السعر؟", answer: "199 ريال" }] });
    expect(system).toContain("Approved business knowledge");
    expect(system).toContain("199 ريال");
    expect(system).not.toContain("NO_ANSWER");
  });

  it("tells the model to answer only from the knowledge or return NO_ANSWER for customer-facing replies", async () => {
    const system = await capturePrompt({ knowledge: [{ question: "كم السعر؟", answer: "199 ريال" }], knowledgeOnly: true });
    expect(system).toContain("Answer ONLY using the approved knowledge");
    expect(system).toContain("NO_ANSWER");
  });

  it("adds no knowledge section when none is supplied", async () => {
    const system = await capturePrompt({});
    expect(system).not.toContain("Approved business knowledge");
  });
});
