import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-opener-template.db");
const tenantId = "tenant-opener";

const createMock = vi.fn();
const syncMock = vi.fn(async (..._args: unknown[]) => ({ ok: true, synced: 1 }));
vi.mock("../lib/meta-templates", () => ({
  isMetaWhatsAppConfigured: (integration: { wabaId?: string; accessToken?: string }) => Boolean(integration.wabaId && integration.accessToken),
  createMetaTemplate: (...args: unknown[]) => createMock(...args),
  syncMetaTemplates: (...args: unknown[]) => syncMock(...args)
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function connectWhatsApp() {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: "شركة النور", ownerName: "O", ownerEmail: "o@x.sa", plan: "باقة الأفراد", status: "نشط", renewalAt: now, createdAt: now, updatedAt: now } });
  await prisma.integrationSetting.create({
    data: { id: `int-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected", businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "123", wabaId: "waba-1", appId: "", configId: "", verifyToken: "", accessToken: "token", webhookUrl: "", updatedAt: now } as never
  });
}

describe("auto-provisioned chat-opening template", () => {
  it("builds a safe body with the {{1}} placeholder", async () => {
    const { openerTemplateBody } = await import("../lib/opener-template");
    expect(openerTemplateBody("شركة النور")).toContain("{{1}}");
    expect(openerTemplateBody("شركة النور")).toContain("شركة النور");
    expect(openerTemplateBody("Evil {{1}}\nCo")).not.toMatch(/Evil \{\{/);
    expect(openerTemplateBody("")).toContain("فريق الدعم");
  });

  it("creates it once for a WhatsApp-connected workspace and never twice", async () => {
    await connectWhatsApp();
    createMock.mockResolvedValue({ ok: true, id: "meta-1", status: "قيد المراجعة" });
    const { ensureOpenerTemplate, provisionOpenerTemplates, OPENER_TEMPLATE_NAME } = await import("../lib/opener-template");
    const { prisma } = await import("../lib/prisma");

    expect(await ensureOpenerTemplate("tenant-not-connected")).toBe("not_connected");
    expect(await ensureOpenerTemplate(tenantId)).toBe("created");
    expect(createMock).toHaveBeenCalledTimes(1);
    const args = createMock.mock.calls[0][1] as { name: string; category: string; buttonType: string; message: string };
    expect(args).toMatchObject({ name: OPENER_TEMPLATE_NAME, category: "MARKETING", buttonType: "QUICK_REPLY" });
    expect(args.message).toContain("شركة النور");

    expect(await ensureOpenerTemplate(tenantId)).toBe("exists");
    expect(createMock).toHaveBeenCalledTimes(1);

    const row = await prisma.template.findFirst({ where: { tenantId, name: OPENER_TEMPLATE_NAME } });
    expect(row?.status).toBe("قيد المراجعة");

    // The cron step refreshes the pending review status instead of creating again.
    const result = await provisionOpenerTemplates();
    expect(result.created).toBe(0);
    expect(result.synced).toBe(1);
    expect(syncMock).toHaveBeenCalled();
  });

  it("leaves no local row when Meta rejects the template, so the next tick retries", async () => {
    createMock.mockReset();
    createMock.mockResolvedValue({ ok: false, error: "rejected" });
    const { prisma } = await import("../lib/prisma");
    await prisma.template.deleteMany({ where: { tenantId } });
    const { ensureOpenerTemplate } = await import("../lib/opener-template");
    expect(await ensureOpenerTemplate(tenantId)).toBe("failed");
    expect(await prisma.template.count({ where: { tenantId } })).toBe(0);
  });

  it("gives the individuals plan no campaign balance on payment", async () => {
    const { isViewLockedForPlan } = await import("../lib/plan-access");
    expect(isViewLockedForPlan("باقة الأفراد", "campaigns")).toBe(true);
    expect(isViewLockedForPlan("الباقة العادية", "campaigns")).toBe(false);
  });
});
