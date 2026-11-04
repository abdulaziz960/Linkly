import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-pipeline-custom-stages.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function seedConversation(id: string, tenantId: string) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  await prisma.customer.create({ data: { id: `cust-${id}`, name: "عميل", phone: "966500000009", initial: "ع", tenantId } });
  await prisma.conversation.create({ data: { id, customerId: `cust-${id}`, channel: "whatsapp", lastMessage: "مرحبا", status: "assigned", assignee: "موظف", tenantId } });
}

describe("custom pipeline stages", () => {
  it("adds, orders, validates and isolates stages per workspace", async () => {
    const { addCustomStage, getTenantStages, isTenantStage, cleanStageName } = await import("../lib/pipeline-stages");

    expect(await getTenantStages("t1")).toEqual(["جديد", "مهتم", "مؤهل", "عرض سعر", "تم الحجز", "فاز", "خسر"]);

    const added = await addCustomStage("t1", "  حضر   الاجتماع ");
    if (!added.ok) throw new Error(added.error);
    // Custom stages sit before the two closing stages.
    expect(added.stages).toEqual(["جديد", "مهتم", "مؤهل", "عرض سعر", "تم الحجز", "حضر الاجتماع", "فاز", "خسر"]);

    expect(await isTenantStage("t1", "حضر الاجتماع")).toBe(true);
    expect(await isTenantStage("t2", "حضر الاجتماع")).toBe(false); // another workspace does not have it
    expect(await isTenantStage("t1", "غريب")).toBe(false);

    expect(await addCustomStage("t1", "حضر الاجتماع")).toMatchObject({ ok: false, code: 409 });
    expect(await addCustomStage("t1", "مؤهل")).toMatchObject({ ok: false, code: 400 });
    expect(await addCustomStage("t1", "تم البيع")).toMatchObject({ ok: false, code: 400 }); // label of "فاز"
    expect(cleanStageName("a").ok).toBe(false);
    expect(cleanStageName("<script>").ok).toBe(false);

    for (let i = 0; i < 7; i += 1) expect((await addCustomStage("t1", `مرحلة ${i + 1}`)).ok).toBe(true);
    expect(await addCustomStage("t1", "مرحلة زائدة")).toMatchObject({ ok: false, code: 400 }); // limit of 8
  });

  it("removing a stage moves its conversations back to the first stage", async () => {
    const { addCustomStage, removeCustomStage, isTenantStage } = await import("../lib/pipeline-stages");
    const { prisma } = await import("../lib/prisma");
    await addCustomStage("t3", "دفع العربون");
    await seedConversation("conv-rm", "t3");
    await prisma.conversation.updateMany({ where: { id: "conv-rm" }, data: { pipelineStage: "دفع العربون" } });

    expect(await removeCustomStage("t3", "مؤهل")).toMatchObject({ ok: false }); // built-in stages cannot be removed
    const removed = await removeCustomStage("t3", "دفع العربون");
    expect(removed).toMatchObject({ ok: true, moved: 1 });
    expect(await isTenantStage("t3", "دفع العربون")).toBe(false);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: "conv-rm" } })).pipelineStage).toBe("جديد");
  });

  it("a custom stage can be mapped to an ad event and fires it", async () => {
    const sent: Array<{ event: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { data: Array<{ event: string }> };
      sent.push(...body.data);
      return new Response(JSON.stringify({ code: 0, message: "OK" }), { status: 200 });
    }));
    const { addCustomStage, getTenantStages } = await import("../lib/pipeline-stages");
    const { cleanSettingsInput, saveTikTokAdsSettings, setLeadStatus } = await import("../lib/tiktok-events");
    const { cleanSnapSettingsInput } = await import("../lib/snap-events");
    const { cleanMetaSettingsInput } = await import("../lib/meta-events");

    await addCustomStage("t4", "حضر الاجتماع");
    const stages = await getTenantStages("t4");

    // The built-in list alone rejects nothing but silently ignores the custom stage...
    const ignored = cleanSettingsInput({ mapping: { "حضر الاجتماع": "Schedule" } });
    expect(ignored.ok && ignored.data.mapping?.["حضر الاجتماع"]).toBeUndefined();
    // ...while the workspace's own stages carry it through, on every platform.
    for (const cleaned of [
      cleanSettingsInput({ mapping: { "حضر الاجتماع": "Schedule" } }, stages),
      cleanMetaSettingsInput({ mapping: { "حضر الاجتماع": "Schedule" } }, stages),
      cleanSnapSettingsInput({ mapping: { "حضر الاجتماع": "custom_event_1" } }, stages)
    ]) {
      expect(cleaned.ok && cleaned.data.mapping?.["حضر الاجتماع"]).toBeTruthy();
    }

    const cleaned = cleanSettingsInput({ eventSetId: "CTM12345", accessToken: "tok_" + "x".repeat(20), enabled: true, sendAll: true, mapping: { "حضر الاجتماع": "Schedule" } }, stages);
    if (!cleaned.ok) throw new Error(cleaned.error);
    await saveTikTokAdsSettings("t4", cleaned.data);

    await seedConversation("conv-t4", "t4");
    const result = await setLeadStatus({ tenantId: "t4", conversationId: "conv-t4", status: "حضر الاجتماع", actor: "موظف" });
    expect(result).toMatchObject({ ok: true, status: "حضر الاجتماع" });
    expect(sent.map((event) => event.event)).toContain("Schedule");

    // A stage that does not exist in the workspace is still refused.
    expect(await setLeadStatus({ tenantId: "t4", conversationId: "conv-t4", status: "غير موجودة", actor: "x" })).toMatchObject({ ok: false });
  });
});
