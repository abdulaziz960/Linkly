import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-ai-reply-tone.db");
const session = { id: "owner-1", tenantId: "t-tone", role: "مالك الحساب", name: "المالك" };
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => session) }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
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

const put = (body: unknown) => new NextRequest("http://localhost/api/ai/tone", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("the assistant's reply tone", () => {
  it("is Saudi colloquial until the owner picks another, is saved per workspace, and rejects an unknown tone", async () => {
    const { getAiTone } = await import("../lib/ai-tone");
    const { PUT } = await import("../app/api/ai/tone/route");
    expect(await getAiTone("t-tone")).toBe("saudi_colloquial");
    expect((await PUT(put({ tone: "formal" }))).status).toBe(200);
    expect(await getAiTone("t-tone")).toBe("formal");
    expect(await getAiTone("someone-else")).toBe("saudi_colloquial");
    expect((await PUT(put({ tone: "shouting" }))).status).toBe(400);
    expect(await getAiTone("t-tone")).toBe("formal");
  });

  it("only the owner can change it", async () => {
    const { PUT } = await import("../app/api/ai/tone/route");
    const previous = session.role;
    session.role = "موظف دعم";
    expect((await PUT(put({ tone: "saudi_plain" }))).status).toBe(403);
    session.role = previous;
  });

  it("changes what the model is told: the sales brief and a plain reply follow the tone", async () => {
    const { generateAiText } = await import("../lib/ai-provider");
    const connection = { provider: "openai" as const, model: "gpt-test", apiKey: "sk-test" };
    const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "تمام" } }] }));
    }));
    const base = { messages: [{ direction: "in" as const, text: "السلام عليكم" }], customerName: "ع", language: "ar" as const, operation: "reply" as const };
    const sales = { employee: "فهد", company: "الياسمين", projectInfo: "فلل" };

    await generateAiText(connection, { ...base, salesPersona: sales });
    await generateAiText(connection, { ...base, salesPersona: sales, tone: "formal" });
    await generateAiText(connection, { ...base, tone: "saudi_plain" });
    await generateAiText(connection, base);
    const system = bodies.map((body) => body.messages[0].content);
    expect(system[0]).toContain("Saudi / Gulf colloquial Arabic");
    expect(system[0]).toContain('Never use stiff formal phrasing');
    expect(system[1]).toContain("Formal, polite Modern Standard Arabic");
    expect(system[1]).not.toContain("Never use stiff formal phrasing");
    expect(system[2]).toContain("Tone and dialect of the reply: Plain, simple Arabic");
    expect(system[3]).not.toContain("Tone and dialect");
  });
});
