import { createHmac } from "crypto";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-campaign-link-tracking.db");
const tenantId = "tenant-link-tracking";
const webhookSecret = "test-whatsapp-app-secret";
const phoneNumberId = "test-phone-number-id";
const recipientPhone = "966500000001";
const whatsappMessageId = "wamid.TESTMESSAGE1";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("WHATSAPP_META_APP_SECRET", webhookSecret);
  vi.stubEnv("APP_URL", "https://linklysa.test");
  // readStoredSecret() refuses to decrypt any "enc:v1:" value at all unless
  // this is set, regardless of whether decryptSecret() would actually
  // succeed - a deliberate production safety check, but it means a seeded
  // accessToken is unreadable in this test without it.
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

function signedWebhookRequest(rawBody: string) {
  const signature = `sha256=${createHmac("sha256", webhookSecret).update(rawBody).digest("hex")}`;
  return new NextRequest("http://localhost/api/meta/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hub-signature-256": signature },
    body: rawBody
  });
}

describe("Campaign link-click tracking end-to-end", () => {
  it("sends a per-recipient tracking link, stamps read/click, and classifies the recipient correctly", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { encryptSecret } = await import("../lib/secret-storage");
    const { spawnCampaignOccurrence, processCampaignBatch } = await import("../lib/campaign-engine");

    // This test's throwaway sqlite file has no schema yet - bootstrap it the
    // same way every real request path does, instead of assuming the tables
    // already exist.
    await ensureSchema();

    // A connected WhatsApp channel - resolveWhatsAppAccount() (the webhook's
    // own tenant lookup) needs this row to exist by phoneNumberId.
    await prisma.integrationSetting.create({
      data: {
        id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected",
        businessName: "", wabaName: "", phoneNumber: "", phoneNumberId, wabaId: "test-waba-id",
        appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("test-access-token"),
        webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
      }
    });
    await prisma.campaignBalance.create({ data: { tenantId, balance: 10, updatedAt: new Date().toISOString() } });
    // Single positional variable - sendWhatsAppTemplate puts the tracking
    // link in the LAST body placeholder, trivially "last" here since there's
    // only one.
    await prisma.template.create({
      data: {
        id: `tmpl-${tenantId}-national-day`, tenantId, name: "national_day", message: "أهلاً! العرض هنا: {{1}}",
        type: "تسويق", category: "MARKETING", language: "ar", status: "معتمد", headerType: "NONE",
        headerText: "", headerMedia: "", footer: "", buttonType: "NONE", buttonText: "", buttonPhone: "", buttonUrl: "",
        syncedAt: "-", lastUsed: "-"
      }
    });

    const campaignId = await prisma.$transaction((tx) => spawnCampaignOccurrence(tx, {
      tenantId, name: "حملة اليوم الوطني", templateName: "national_day", language: "ar", headerMediaDataUrl: "",
      recipients: [{ phone: recipientPhone, name: "عميل الاختبار" }], status: "قيد الإرسال",
      linkTrackingEnabled: true, destinationUrl: "https://example.com/thanks"
    }));

    let sentBodyText = "";
    const providerFetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("/messages")) {
        const body = JSON.parse(String(init?.body || "{}"));
        sentBodyText = body?.template?.components?.[0]?.parameters?.[0]?.text || "";
        return new Response(JSON.stringify({ messages: [{ id: whatsappMessageId }] }), { status: 200 });
      }
      throw new Error(`Unexpected fetch call in test: ${url}`);
    });
    vi.stubGlobal("fetch", providerFetch);

    await processCampaignBatch(tenantId);

    // The recipient's own tracking link, not their name, must be what
    // actually went out in the WhatsApp template body.
    expect(sentBodyText).toContain("/api/campaigns/t/");
    expect(sentBodyText).not.toContain("عميل الاختبار");

    const recipientAfterSend = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId } });
    expect(recipientAfterSend.status).toBe("تم الإرسال");
    expect(recipientAfterSend.messageId).toBe(whatsappMessageId);
    expect(recipientAfterSend.trackingCode).toBeTruthy();
    expect(recipientAfterSend.readAt).toBe("");
    expect(recipientAfterSend.clickedAt).toBe("");
    const trackingCode = recipientAfterSend.trackingCode;
    expect(sentBodyText).toContain(`/api/campaigns/t/${trackingCode}`);

    // Not opened yet - no read receipt, no click.
    expect(recipientAfterSend.status === "تم الإرسال" && !recipientAfterSend.readAt && !recipientAfterSend.clickedAt).toBe(true);

    // WhatsApp's real "read" status webhook for this exact message.
    const { POST: metaWebhook } = await import("../app/api/meta/webhook/route");
    const readStatusPayload = JSON.stringify({
      entry: [{
        id: "test-waba-id",
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: phoneNumberId },
            statuses: [{ id: whatsappMessageId, status: "read", recipient_id: recipientPhone }]
          }
        }]
      }]
    });
    const webhookResponse = await metaWebhook(signedWebhookRequest(readStatusPayload));
    expect(webhookResponse.status).toBe(200);

    const recipientAfterRead = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId } });
    expect(recipientAfterRead.readAt).toBeTruthy();
    expect(recipientAfterRead.clickedAt).toBe("");
    // Opened but not clicked yet.
    expect(recipientAfterRead.readAt && !recipientAfterRead.clickedAt).toBeTruthy();

    // The customer taps the link in their own message.
    const { GET: trackingRedirect } = await import("../app/api/campaigns/t/[code]/route");
    const redirectResponse = await trackingRedirect(
      new NextRequest(`http://localhost/api/campaigns/t/${trackingCode}`),
      { params: Promise.resolve({ code: trackingCode }) }
    );
    expect(redirectResponse.status).toBe(307);
    expect(redirectResponse.headers.get("location")).toBe("https://example.com/thanks");

    const recipientAfterClick = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId } });
    expect(recipientAfterClick.clickedAt).toBeTruthy();
    // Clicked - the "clicked" bucket, same rule CampaignsView.tsx's
    // engagementBucket() uses (clickedAt takes priority over readAt).
    expect(Boolean(recipientAfterClick.clickedAt)).toBe(true);

    // An unrelated/invalid code must never 500 or leak another tenant's data.
    const invalidCodeResponse = await trackingRedirect(
      new NextRequest("http://localhost/api/campaigns/t/does-not-exist"),
      { params: Promise.resolve({ code: "does-not-exist" }) }
    );
    expect(invalidCodeResponse.status).toBe(307);
    expect(invalidCodeResponse.headers.get("location")).toBe("https://linklysa.test/");
  });
});
