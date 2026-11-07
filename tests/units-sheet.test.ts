import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-units-sheet.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "units-sheet-test-key-not-production");
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

afterEach(() => vi.unstubAllGlobals());

async function seedProject(tenantId: string) {
  const { createProject } = await import("../lib/crm-projects");
  const created = await createProject(tenantId, { name: "خام 19", details: "حي المرجان" });
  if (!created.ok) throw new Error(created.error);
  return created.project;
}

describe("reading a price sheet answer", () => {
  it("turns the model's JSON into clean units: codes, model names, areas, prices and the three statuses", async () => {
    const { parseUnitsJson } = await import("../lib/units-pdf");
    const answer = "```json\n" + JSON.stringify({ units: [
      { code: "A1", model: "نموذج A", type: "(دور أرضي)", area: "270", price: "950.000.00", status: "متاح" },
      { code: "A9", model: "A", type: "دور أرضي", area: "٢٧٠", price: "-", status: "محجوز" },
      { code: "B9", model: "B", type: "تاون هاوس", area: "347.03", price: "فيلا العرض", status: "available" },
      { code: "C4", model: "C", type: "فيلا", area: "487.72 م²", price: "", status: "مباعة" },
      { code: "A1", model: "A", type: "duplicate", area: "1", price: "1", status: "available" },
      { code: "x", status: "available" }
    ] }) + "\n```";
    expect(parseUnitsJson(answer)).toEqual([
      { name: "A1", kind: "دور أرضي", model: "A", area: "270 م²", priceText: "950,000 ر.س", status: "available" },
      { name: "A9", kind: "دور أرضي", model: "A", area: "270 م²", priceText: "", status: "reserved" },
      { name: "B9", kind: "تاون هاوس", model: "B", area: "347.03 م²", priceText: "فيلا العرض", status: "available" },
      { name: "C4", kind: "فيلا", model: "C", area: "487.72 م²", priceText: "", status: "sold" }
    ]);
    expect(parseUnitsJson("not json at all")).toEqual([]);
    expect(parseUnitsJson('Sure! [{"code":"D1","type":"شقة","status":"sold"}]')).toMatchObject([{ name: "D1", status: "sold" }]);
  });

  it("sends the PDF to the workspace's own provider and refuses what it cannot read", async () => {
    const { prisma } = await import("../lib/prisma");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { readUnitsFromPdf } = await import("../lib/units-pdf");
    const pdf = Buffer.from("%PDF-1.4 fake sheet");

    expect(await readUnitsFromPdf("t-pdf", pdf)).toMatchObject({ ok: false, error: expect.stringContaining("مفتاح") });
    expect(await readUnitsFromPdf("t-pdf", Buffer.from("not a pdf"))).toMatchObject({ ok: false, error: expect.stringContaining("PDF") });

    const save = (provider: string) => prisma.aiWorkspaceSetting.upsert({
      where: { tenantId: "t-pdf" },
      update: { provider, model: "m", apiKey: encryptSecret("sk-test"), enabled: 1 },
      create: { tenantId: "t-pdf", provider, model: "m", apiKey: encryptSecret("sk-test"), enabled: 1, prompt: "", dailyLimit: 100, monthlyLimit: 1000, updatedAt: new Date().toISOString() }
    });

    await save("deepseek");
    expect(await readUnitsFromPdf("t-pdf", pdf)).toMatchObject({ ok: false, error: expect.stringContaining("Claude") });

    await save("anthropic");
    const fetchMock = vi.fn(async () => Response.json({ content: [{ type: "text", text: '{"units":[{"code":"A1","model":"A","type":"فيلا","area":"300","price":"1500000","status":"متاح"}]}' }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await readUnitsFromPdf("t-pdf", pdf);
    expect(result).toEqual({ ok: true, units: [{ name: "A1", kind: "فيلا", model: "A", area: "300 م²", priceText: "1,500,000 ر.س", status: "available" }] });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    expect((call[1].headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
    const sent = JSON.parse(String(call[1].body)).messages[0].content;
    expect(sent[0]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect(await readUnitsFromPdf("t-pdf", pdf)).toMatchObject({ ok: false });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ content: [{ type: "text", text: "I could not find units" }] })));
    expect(await readUnitsFromPdf("t-pdf", pdf)).toMatchObject({ ok: false, error: expect.stringContaining("وحدات") });
  });
});

describe("a price sheet as units", () => {
  it("imports each unit as its own row, updates by name on a second import, and refuses a bad sheet whole", async () => {
    const { importUnits, listUnits, unitStatusOf } = await import("../lib/crm-units");
    const project = await seedProject("t-sheet");
    const first = await importUnits("t-sheet", project.id, [
      { name: "A1", kind: "دور أرضي", model: "A", area: "270 م²", priceText: "950,000 ر.س", status: "available" },
      { name: "A9", kind: "دور أرضي", model: "A", area: "270 م²", status: "reserved" },
      { name: "C4", kind: "فيلا", model: "C", area: "487.72 م²", status: "sold" }
    ]);
    expect(first).toEqual({ ok: true, created: 3, updated: 0 });
    const units = await listUnits("t-sheet", project.id);
    expect(units.map((unit) => [unit.name, unit.total, unitStatusOf(unit)])).toEqual([["A1", 1, "available"], ["A9", 1, "reserved"], ["C4", 1, "sold"]]);
    expect(units[0]).toMatchObject({ kind: "دور أرضي", model: "A", area: "270 م²", priceText: "950,000 ر.س" });

    // The sheet changed: A9 is sold, A10 is new. Same names are updated, not duplicated.
    expect(await importUnits("t-sheet", project.id, [{ name: "a9", status: "sold", priceText: "1,000,000 ر.س" }, { name: "A10", status: "available" }])).toEqual({ ok: true, created: 1, updated: 1 });
    const after = await listUnits("t-sheet", project.id);
    expect(after).toHaveLength(4);
    expect(unitStatusOf(after.find((unit) => unit.name === "A9")!)).toBe("sold");

    // One bad row refuses everything: nothing is half-imported.
    expect(await importUnits("t-sheet", project.id, [{ name: "Z1", status: "available" }, { name: "Z2", total: 3, available: 5 }])).toMatchObject({ ok: false });
    expect(await importUnits("t-sheet", project.id, [{ name: "Z1" }, { name: "z1" }])).toMatchObject({ ok: false, error: expect.stringContaining("مكرر") });
    expect((await listUnits("t-sheet", project.id)).some((unit) => unit.name === "Z1")).toBe(false);
    expect(await importUnits("t-sheet", "no-such-project", [{ name: "Q1" }])).toMatchObject({ ok: false, code: 404 });
    expect(await importUnits("t-sheet", project.id, [])).toMatchObject({ ok: false });
  });

  it("holds more than 50 units, like a real sheet", async () => {
    const { importUnits, listUnits, MAX_UNITS_PER_PROJECT } = await import("../lib/crm-units");
    expect(MAX_UNITS_PER_PROJECT).toBeGreaterThanOrEqual(300);
    const project = await seedProject("t-big");
    const rows = Array.from({ length: 120 }, (_, index) => ({ name: `U${index + 1}`, status: "available" }));
    expect(await importUnits("t-big", project.id, rows)).toMatchObject({ ok: true, created: 120 });
    expect(await listUnits("t-big", project.id)).toHaveLength(120);
  });

  it("tells the AI each unit's own state and never offers a reserved or sold one", async () => {
    const { importUnits, listUnits, unitsBrief } = await import("../lib/crm-units");
    const project = await seedProject("t-brief");
    await importUnits("t-brief", project.id, [
      { name: "A1", kind: "دور أرضي", model: "A", area: "270 م²", priceText: "950,000 ر.س", status: "available" },
      { name: "A9", kind: "دور أرضي", model: "A", area: "270 م²", status: "reserved" },
      { name: "C4", kind: "فيلا", model: "C", status: "sold" }
    ]);
    const brief = unitsBrief(await listUnits("t-brief", project.id));
    expect(brief).toContain("- A1 (دور أرضي) model A · 270 م² · 950,000 ر.س: available");
    expect(brief).toContain("A9 (دور أرضي) model A · 270 م²: reserved (not available)");
    expect(brief).toContain("C4 (فيلا) model C: sold (not available)");
    expect(brief).toContain("never offer a reserved or sold unit");
  });

  it("a reserved unit becomes sold when its customer reaches «فاز», and goes back to available if they leave", async () => {
    const { importUnits, listUnits, setConversationUnit, applyUnitOnStageChange, unitStatusOf, inventoryByProject } = await import("../lib/crm-units");
    const { prisma } = await import("../lib/prisma");
    const project = await seedProject("t-flow");
    await importUnits("t-flow", project.id, [{ name: "A9", status: "reserved" }, { name: "A1", status: "available" }]);
    const [reservedUnit] = (await listUnits("t-flow", project.id)).filter((unit) => unit.name === "A9");
    await prisma.customer.create({ data: { id: "c-flow", tenantId: "t-flow", name: "عميل", phone: "966500000001", initial: "ع" } });
    await prisma.conversation.create({ data: { id: "v-flow", tenantId: "t-flow", customerId: "c-flow", channel: "whatsapp", status: "assigned", assignee: "عزام", lastMessage: "x", pipelineStage: "مؤهل" } });
    expect(await setConversationUnit("t-flow", "v-flow", reservedUnit.id)).toEqual({ ok: true });

    expect(await inventoryByProject("t-flow")).toEqual([{ projectId: project.id, total: 2, available: 1, reserved: 1, sold: 0 }]);
    await applyUnitOnStageChange({ tenantId: "t-flow", conversationId: "v-flow", from: "مؤهل", to: "فاز" });
    expect(unitStatusOf((await listUnits("t-flow", project.id)).find((unit) => unit.name === "A9")!)).toBe("sold");
    expect(await inventoryByProject("t-flow")).toEqual([{ projectId: project.id, total: 2, available: 1, reserved: 0, sold: 1 }]);

    await applyUnitOnStageChange({ tenantId: "t-flow", conversationId: "v-flow", from: "فاز", to: "مؤهل" });
    expect(unitStatusOf((await listUnits("t-flow", project.id)).find((unit) => unit.name === "A9")!)).toBe("available");
  });
});
