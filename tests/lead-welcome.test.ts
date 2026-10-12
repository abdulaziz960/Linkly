import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-lead-welcome.db");
const sendTemplate = vi.fn(async (..._args: unknown[]) => ({ ok: true as boolean, error: "" }));

vi.mock("../lib/campaign-engine", () => ({ sendWhatsAppTemplate: (...args: unknown[]) => sendTemplate(...args) }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

beforeEach(async () => {
  sendTemplate.mockClear();
  sendTemplate.mockResolvedValue({ ok: true, error: "" });
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

describe("welcome for leads arriving through the leads API", () => {
  it("turns local formats into a WhatsApp number", async () => {
    const { leadWhatsappNumber } = await import("../lib/lead-welcome");
    expect(leadWhatsappNumber("0501234567")).toBe("966501234567");
    expect(leadWhatsappNumber("+966 50 123 4567")).toBe("966501234567");
    expect(leadWhatsappNumber("00966501234567")).toBe("966501234567");
    expect(leadWhatsappNumber("123")).toBe("");
  });

  it("does nothing while it is off, and cannot be switched on without a template", async () => {
    const { sendExternalLeadWelcome, saveLeadWelcomeSettings, getLeadWelcomeSettings } = await import("../lib/lead-welcome");
    expect(await sendExternalLeadWelcome({ tenantId: "ten-lw", phone: "0501234567", name: "أحمد", summary: "x" })).toBe("off");
    expect(await saveLeadWelcomeSettings("ten-lw", { enabled: true })).toEqual({ enabled: false, template: "" });
    expect((await getLeadWelcomeSettings("ten-lw")).enabled).toBe(false);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("sends the template once per phone and opens the WhatsApp thread with the form", async () => {
    const { sendExternalLeadWelcome, saveLeadWelcomeSettings } = await import("../lib/lead-welcome");
    const { prisma } = await import("../lib/prisma");
    await saveLeadWelcomeSettings("ten-lw2", { enabled: true, template: "lead_welcome" });

    expect(await sendExternalLeadWelcome({ tenantId: "ten-lw2", phone: "0501234567", name: "أحمد", summary: "📋 بيانات النموذج\n• الميزانية: 900,000" })).toBe("sent");
    expect(sendTemplate.mock.calls[0].slice(0, 5)).toEqual(["ten-lw2", "966501234567", "lead_welcome", "ar", "أحمد"]);
    const note = await prisma.message.findFirst({ where: { direction: "out", text: { contains: "الميزانية: 900,000" } } });
    expect(note?.text).toContain("lead_welcome");

    expect(await sendExternalLeadWelcome({ tenantId: "ten-lw2", phone: "+966501234567", name: "أحمد", summary: "x" })).toBe("already-welcomed");
    expect(sendTemplate).toHaveBeenCalledTimes(1);
  });

  it("skips an unusable phone, and a failed send does not use up the phone's slot", async () => {
    const { sendExternalLeadWelcome, saveLeadWelcomeSettings } = await import("../lib/lead-welcome");
    await saveLeadWelcomeSettings("ten-lw3", { enabled: true, template: "lead_welcome" });
    expect(await sendExternalLeadWelcome({ tenantId: "ten-lw3", phone: "abc", name: "", summary: "x" })).toBe("bad-phone");

    sendTemplate.mockResolvedValueOnce({ ok: false, error: "قالب غير معتمد" });
    expect(await sendExternalLeadWelcome({ tenantId: "ten-lw3", phone: "0507778899", name: "", summary: "x" })).toBe("failed");
    expect(await sendExternalLeadWelcome({ tenantId: "ten-lw3", phone: "0507778899", name: "", summary: "x" })).toBe("sent");
  });
});
