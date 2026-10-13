import { createHmac } from "crypto";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-whatsapp-payment-webhook.db");
const tenantId = "tenant-pay-webhook";
const webhookSecret = "test-whatsapp-app-secret";
const phoneNumberId = "pnid-pay";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("WHATSAPP_META_APP_SECRET", webhookSecret);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
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

function statusRequest(status: Record<string, unknown>) {
  const rawBody = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "waba-pay", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId }, statuses: [status] } }] }]
  });
  const signature = `sha256=${createHmac("sha256", webhookSecret).update(rawBody).digest("hex")}`;
  return new NextRequest("http://localhost/api/meta/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hub-signature-256": signature },
    body: rawBody
  });
}

describe("WhatsApp payment problem reported by Meta after the send", () => {
  it("a failed status with the payment error code turns the flag on, and a delivered one turns it off", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { POST } = await import("../app/api/meta/webhook/route");
    await ensureSchema();
    await prisma.integrationSetting.create({
      data: {
        id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected",
        businessName: "", wabaName: "", phoneNumber: "", phoneNumberId, wabaId: "waba-pay",
        appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("tok"),
        webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
      }
    });
    const flag = async () => (await prisma.integrationSetting.findFirst({ where: { tenantId } }))?.whatsappPaymentIssueAt;

    // an unrelated failure does not raise the payment banner
    await POST(statusRequest({ id: "wamid.A", status: "failed", recipient_id: "966500000001", errors: [{ code: 131026, title: "Message undeliverable" }] }));
    expect(await flag()).toBe("");

    await POST(statusRequest({ id: "wamid.B", status: "failed", recipient_id: "966500000001", errors: [{ code: 131042, title: "Business eligibility payment issue" }] }));
    expect(await flag()).not.toBe("");

    await POST(statusRequest({ id: "wamid.C", status: "delivered", recipient_id: "966500000001" }));
    expect(await flag()).toBe("");
  });
});
