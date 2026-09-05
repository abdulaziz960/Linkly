import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-automation-simulation.db");
const tenantId = "tenant-automation-sim-test";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function createRule(id: string, input: {
  trigger: string;
  conditions: Array<{ field: string; operator: string; value: string }>;
  actions: Array<{ type: string; target: string }>;
  enabled?: boolean;
}) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();

  await prisma.automationRule.create({
    data: {
      id,
      tenantId,
      name: id,
      description: "",
      trigger: input.trigger,
      conditionsJson: JSON.stringify(input.conditions),
      actionsJson: JSON.stringify(input.actions),
      createdAt: new Date().toISOString(),
      enabled: input.enabled === false ? 0 : 1
    }
  });
}

describe("simulateAutomationRules", () => {
  it("matches a rule whose condition value is contained in the test message", async () => {
    const { simulateAutomationRules } = await import("../lib/automation-engine");
    await createRule("rule-contains-match", {
      trigger: "تم إنشاء رسالة",
      conditions: [{ field: "الرسالة تحتوي على", operator: "يحتوي", value: "استرجاع" }],
      actions: [{ type: "إضافة وسم", target: "استرجاع" }]
    });

    const matches = await simulateAutomationRules(tenantId, { trigger: "تم إنشاء رسالة", messageText: "أبغى أسوي استرجاع للطلب" });
    expect(matches.map((match) => match.id)).toContain("rule-contains-match");
  });

  it("does not match when the condition value is absent from the message", async () => {
    const { simulateAutomationRules } = await import("../lib/automation-engine");
    const matches = await simulateAutomationRules(tenantId, { trigger: "تم إنشاء رسالة", messageText: "استفسار عن التوصيل" });
    expect(matches.map((match) => match.id)).not.toContain("rule-contains-match");
  });

  it("matches a tag condition using the simulated tag override", async () => {
    const { simulateAutomationRules } = await import("../lib/automation-engine");
    await createRule("rule-tag-match", {
      trigger: "تم إنشاء رسالة",
      conditions: [{ field: "العميل لديه وسم", operator: "يساوي", value: "متابعة لاحقة" }],
      actions: [{ type: "إرسال قالب", target: "قالب المتابعة" }]
    });

    const withoutTag = await simulateAutomationRules(tenantId, { trigger: "تم إنشاء رسالة", messageText: "مرحبا" });
    expect(withoutTag.map((match) => match.id)).not.toContain("rule-tag-match");

    const withTag = await simulateAutomationRules(tenantId, { trigger: "تم إنشاء رسالة", messageText: "مرحبا", tagNames: ["متابعة لاحقة"] });
    expect(withTag.map((match) => match.id)).toContain("rule-tag-match");
  });

  it("returns every matching enabled rule so overlapping/conflicting rules are visible together", async () => {
    const { simulateAutomationRules } = await import("../lib/automation-engine");
    await createRule("rule-conflict-a", {
      trigger: "تم إنشاء رسالة",
      conditions: [{ field: "الرسالة تحتوي على", operator: "يحتوي", value: "طلب" }],
      actions: [{ type: "إضافة وسم", target: "طلبات" }]
    });
    await createRule("rule-conflict-b", {
      trigger: "تم إنشاء رسالة",
      conditions: [{ field: "الرسالة تحتوي على", operator: "يحتوي", value: "طلب" }],
      actions: [{ type: "إغلاق المحادثة", target: "لا يحتاج اختيار" }]
    });
    await createRule("rule-conflict-disabled", {
      trigger: "تم إنشاء رسالة",
      conditions: [{ field: "الرسالة تحتوي على", operator: "يحتوي", value: "طلب" }],
      actions: [{ type: "إغلاق المحادثة", target: "لا يحتاج اختيار" }],
      enabled: false
    });

    const matches = await simulateAutomationRules(tenantId, { trigger: "تم إنشاء رسالة", messageText: "أحتاج أتابع طلبي" });
    const ids = matches.map((match) => match.id);
    expect(ids).toContain("rule-conflict-a");
    expect(ids).toContain("rule-conflict-b");
    expect(ids).not.toContain("rule-conflict-disabled");
  });

  it("never writes an automation queue item or executes an action", async () => {
    const { simulateAutomationRules } = await import("../lib/automation-engine");
    const { prisma } = await import("../lib/prisma");
    const before = await prisma.automationQueueItem.count();

    await simulateAutomationRules(tenantId, { trigger: "تم إنشاء رسالة", messageText: "أحتاج أتابع طلبي", tagNames: ["متابعة لاحقة"] });

    const after = await prisma.automationQueueItem.count();
    expect(after).toBe(before);
  });
});
