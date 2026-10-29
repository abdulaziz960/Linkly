import { createHmac } from "crypto";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const dbPath = join(process.cwd(), "tests", ".tmp-marketing-optout-webhook.db");
const tenantId = "tenant-optout-webhook";
const conversationId = "conversation-optout-webhook";
const phone = "966500000099";
const secret = "test-optout-webhook-secret";
const spies = vi.hoisted(() => ({
  bot: vi.fn(), send: vi.fn(async () => ({ ok: true })),
  catalog: vi.fn(async () => false), loyalty: vi.fn(async () => false), order: vi.fn(async () => false),
  seen: new Set<string>()
}));
vi.mock("../lib/bot-engine", () => ({ runWhatsAppBot: spies.bot, runChannelBot: vi.fn(), startTemplateCatalog: vi.fn() }));
vi.mock("../lib/whatsapp-send", () => ({ sendWhatsAppTextMessage: spies.send }));
vi.mock("../lib/catalog-template", () => ({ isCatalogTemplateButton: spies.catalog }));
vi.mock("../lib/loyalty-inquiry", () => ({ handleLoyaltyInquiry: spies.loyalty }));
vi.mock("../lib/store-engine", () => ({ handleOrderInquiry: spies.order }));
vi.mock("../lib/ad-source", () => ({ captureAdSource: vi.fn() }));
vi.mock("../lib/wa-links", () => ({ captureLinkAdSource: vi.fn() }));
vi.mock("../lib/campaign-reply", () => ({ markCampaignReply: vi.fn(async () => {}) }));
vi.mock("../lib/whatsapp-inbox", () => ({
  attachWhatsAppMedia: vi.fn(),
  storeWhatsAppMessage: vi.fn(async (input: { messageId: string }) => {
    const isNew = !spies.seen.has(input.messageId);
    spies.seen.add(input.messageId);
    return { conversationId: "conversation-optout-webhook", isNew, message: { id: input.messageId } };
  })
}));

beforeAll(async () => {
  if (existsSync(dbPath)) unlinkSync(dbPath);
  vi.stubEnv("DATABASE_URL", `file:${dbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("WHATSAPP_META_APP_SECRET", secret);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-optout-encryption-key");
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  const { encryptSecret } = await import("../lib/secret-storage");
  await ensureSchema();
  await prisma.customer.create({ data: { id: "customer-optout-webhook", tenantId, phone, name: "Test", initial: "T" } });
  await prisma.conversation.create({ data: { id: conversationId, tenantId, customerId: "customer-optout-webhook", channel: "whatsapp", lastMessage: "", status: "unassigned", assignee: "بدون موظف" } });
  await prisma.integrationSetting.create({ data: {
    id: "integration-optout-webhook", tenantId, provider: "whatsapp_cloud", status: "connected",
    businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "pnid-optout", wabaId: "waba-optout",
    appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("test-token"),
    webhookUrl: "/api/meta/webhook", updatedAt: new Date().toISOString()
  } });
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix);
});

function request(id: string, text: string, button = false) {
  const message = { id, from: phone, type: button ? "button" : "text", ...(button ? { button: { text, payload: text } } : { text: { body: text } }) };
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "waba-optout", changes: [{ field: "messages", value: { metadata: { phone_number_id: "pnid-optout" }, messages: [message] } }] }] });
  return new NextRequest("http://localhost/api/meta/webhook", { method: "POST", body, headers: { "Content-Type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` } });
}

it("consumes unsubscribe buttons and STOP/START without bot replies, but allows later customer service", async () => {
  const { POST } = await import("../app/api/meta/webhook/route");
  const { prisma } = await import("../lib/prisma");
  const optedOut = async () => (await prisma.customer.findUniqueOrThrow({ where: { id: "customer-optout-webhook" } })).marketingOptOut;

  const result = await POST(request("optout-button", "إلغاء الاشتراك", true));
  expect(await result.json()).toMatchObject({ received: true, saved: 1 });
  expect(await optedOut()).toBe(1);
  expect(spies.send).toHaveBeenCalledTimes(1);
  expect(spies.bot).not.toHaveBeenCalled();
  expect(spies.catalog).not.toHaveBeenCalled();
  expect(spies.loyalty).not.toHaveBeenCalled();
  expect(spies.order).not.toHaveBeenCalled();

  await POST(request("optout-button", "إلغاء الاشتراك", true));
  expect(spies.send).toHaveBeenCalledTimes(1);
  expect(spies.bot).not.toHaveBeenCalled();

  await POST(request("service-question", "متى يفتح الفرع؟"));
  expect(spies.bot).toHaveBeenCalledTimes(1);
  expect(spies.bot).toHaveBeenLastCalledWith(expect.objectContaining({ incomingText: "متى يفتح الفرع؟" }));
  expect(await optedOut()).toBe(1);

  await POST(request("optin-start", "START"));
  expect(await optedOut()).toBe(0);
  expect(spies.send).toHaveBeenCalledTimes(2);
  expect(spies.bot).toHaveBeenCalledTimes(1);

  await POST(request("optout-stop", "STOP"));
  expect(await optedOut()).toBe(1);
  expect(spies.send).toHaveBeenCalledTimes(3);
  expect(spies.bot).toHaveBeenCalledTimes(1);
});
