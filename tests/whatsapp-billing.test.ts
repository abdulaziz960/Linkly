import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-whatsapp-billing.db");
const tenantId = "tenant-whatsapp-billing";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function seedIntegration() {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  await prisma.integrationSetting.create({
    data: {
      id: `${tenantId}:meta-whatsapp`,
      tenantId,
      provider: "whatsapp_cloud",
      status: "connected",
      businessName: "",
      wabaName: "",
      phoneNumber: "",
      phoneNumberId: "123",
      wabaId: "456",
      appId: "",
      configId: "",
      verifyToken: "",
      accessToken: "token",
      webhookUrl: "",
      updatedAt: ""
    }
  });
}

describe("whatsappSendErrorCode", () => {
  it("extracts Meta's error code from a Graph API error payload", async () => {
    const { whatsappSendErrorCode } = await import("../lib/whatsapp-billing");
    expect(whatsappSendErrorCode({ error: { code: 131042, message: "payment" } })).toBe(131042);
    expect(whatsappSendErrorCode({ error: { message: "no code" } })).toBeUndefined();
    expect(whatsappSendErrorCode(null)).toBeUndefined();
  });
});

describe("recordWhatsAppSendOutcome", () => {
  it("flags the tenant's WhatsApp integration on a 131042 failure, and clears it on the next success", async () => {
    await seedIntegration();
    const { prisma } = await import("../lib/prisma");
    const { recordWhatsAppSendOutcome } = await import("../lib/whatsapp-billing");

    await recordWhatsAppSendOutcome({ tenantId, ok: false, hadIssueFlag: false, errorCode: 131042 });
    const flagged = await prisma.integrationSetting.findFirst({ where: { tenantId, provider: "whatsapp_cloud" } });
    expect(flagged?.whatsappPaymentIssueAt).not.toBe("");

    await recordWhatsAppSendOutcome({ tenantId, ok: true, hadIssueFlag: true });
    const cleared = await prisma.integrationSetting.findFirst({ where: { tenantId, provider: "whatsapp_cloud" } });
    expect(cleared?.whatsappPaymentIssueAt).toBe("");
  });

  it("does not flag on an unrelated error code, and does not write when nothing changed", async () => {
    const { prisma } = await import("../lib/prisma");
    const { recordWhatsAppSendOutcome } = await import("../lib/whatsapp-billing");

    await recordWhatsAppSendOutcome({ tenantId, ok: false, hadIssueFlag: false, errorCode: 131047 });
    const untouched = await prisma.integrationSetting.findFirst({ where: { tenantId, provider: "whatsapp_cloud" } });
    expect(untouched?.whatsappPaymentIssueAt).toBe("");

    await recordWhatsAppSendOutcome({ tenantId, ok: true, hadIssueFlag: false });
    const stillEmpty = await prisma.integrationSetting.findFirst({ where: { tenantId, provider: "whatsapp_cloud" } });
    expect(stillEmpty?.whatsappPaymentIssueAt).toBe("");
  });
});

describe("friendlyWhatsAppError", () => {
  it("explains the common Meta send failures in Arabic and keeps Meta's text for the rest", async () => {
    const { friendlyWhatsAppError } = await import("../lib/whatsapp-billing");
    expect(friendlyWhatsAppError({ error: { code: 200, message: "(#200) You do not have the necessary permission" } }, "x")).toContain("أعد ربط قناة واتساب");
    expect(friendlyWhatsAppError({ error: { code: 190, message: "Error validating access token" } }, "x")).toContain("انتهت صلاحية ربط واتساب");
    expect(friendlyWhatsAppError({ error: { code: 999, message: "Something else", error_user_msg: "رسالة المستخدم" } }, "x")).toBe("رسالة المستخدم");
    expect(friendlyWhatsAppError({ error: { code: 999, message: "Something else" } }, "x")).toBe("Something else");
    expect(friendlyWhatsAppError(null, "fallback")).toBe("fallback");
  });
});
