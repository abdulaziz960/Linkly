/** Audit-only characterization tests: PASS means the documented defect reproduced,
 * not that the control is secure. No production DB or external provider is used. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const actor = vi.hoisted(() => ({ id: "audit-agent", email: "agent@audit.invalid", name: "Agent", role: "موظف دعم", tenantId: "audit-a" }));
vi.mock("../lib/auth", async (original) => ({ ...await original<object>(), getCurrentUser: vi.fn(async () => actor) }));
vi.mock("../lib/automation-engine", () => ({ runInboundMessageAutomations: vi.fn(), runAutomations: vi.fn(), processDueAutomations: vi.fn() }));
vi.mock("../lib/bot-engine", () => ({ shouldStartConversationClosed: vi.fn(async () => false), runTelegramBot: vi.fn() }));
vi.mock("../lib/conversation-rating", () => ({ maybeRecordRatingReply: vi.fn(async () => false), sendRatingThanks: vi.fn(), requestRatingIfNeeded: vi.fn() }));
vi.mock("../lib/conversation-insights", () => ({ enqueueConversationSummary: vi.fn() }));

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "linkly-audit-"));
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "audit.db")}`);
  vi.stubEnv("AUTH_SECRET", "audit-only-secret-not-production");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "audit-only-encryption-not-production");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const { prisma } = await import("../lib/prisma");
  await prisma.employee.create({ data: { id: actor.id, tenantId: actor.tenantId, email: actor.email, name: actor.name, role: actor.role, permissions: "محادثات", status: "متصل", initial: "A" } });
});
afterAll(async () => { const { prisma } = await import("../lib/prisma"); await prisma.$disconnect(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function seedConversation(id: string, tenantId: string, channel = "whatsapp") {
  const { prisma } = await import("../lib/prisma");
  await prisma.customer.create({ data: { id: `customer-${id}`, tenantId, name: "Audit customer", phone: id, initial: "A" } });
  await prisma.conversation.create({ data: { id, tenantId, customerId: `customer-${id}`, channel, assignee: "Another employee", lastMessage: "private", status: "assigned" } });
}

it("AUD-01: public widget polling exposes internal notes", async () => {
  const { prisma } = await import("../lib/prisma");
  const { websiteConversationId } = await import("../lib/website-inbox");
  const id = websiteConversationId("audit-widget", "visitor-a");
  await seedConversation(id, "audit-widget", "website");
  await prisma.integrationSetting.create({ data: { id: "audit-widget", tenantId: "audit-widget", provider: "website", status: "connected", verifyToken: "public-widget-site-key", businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "", wabaId: "", appId: "", configId: "", accessToken: "", webhookUrl: "", updatedAt: new Date().toISOString() } });
  await prisma.message.create({ data: { id: "audit-internal-note", conversationId: id, direction: "note", text: "INTERNAL ONLY: private staff note", time: "12:00", createdAt: new Date().toISOString() } });
  const { GET } = await import("../app/api/website/messages/route");
  const response = await GET(new NextRequest("http://localhost/api/website/messages?siteKey=public-widget-site-key&visitorId=visitor-a"));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("INTERNAL ONLY");
});

it("AUD-02: employee changes another employee's assigned conversation", async () => {
  await seedConversation("audit-private", actor.tenantId);
  const { PATCH } = await import("../app/api/conversations/[id]/route");
  const response = await PATCH(new NextRequest("http://localhost/api/conversations/audit-private", { method: "PATCH", body: JSON.stringify({ assignee: actor.name, dealValue: 999 }) }), { params: Promise.resolve({ id: "audit-private" }) });
  expect(response.status).toBe(200);
  const { prisma } = await import("../lib/prisma");
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: "audit-private" } })).assignee).toBe(actor.name);
});

it("AUD-03: opening by customer bypasses GET assignee scope and returns history", async () => {
  await seedConversation("audit-private-read", actor.tenantId);
  const { prisma } = await import("../lib/prisma");
  await prisma.message.create({ data: { id: "private-read-message", conversationId: "audit-private-read", direction: "in", text: "OTHER AGENT PRIVATE HISTORY", time: "12:00", createdAt: new Date().toISOString() } });
  const { POST } = await import("../app/api/conversations/route");
  const response = await POST(new NextRequest("http://localhost/api/conversations", { method: "POST", body: JSON.stringify({ customerId: "customer-audit-private-read" }) }));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("OTHER AGENT PRIVATE HISTORY");
});

it("AUD-04: Telegram collision returns another tenant's conversation and leaks quoted text", async () => {
  const { storeTelegramMessage } = await import("../lib/telegram-inbox");
  const a = await storeTelegramMessage({ tenantId: "telegram-a", chatId: "1000", direction: "in", text: "TENANT A SECRET", messageId: "1000-1" });
  const b = await storeTelegramMessage({ tenantId: "telegram-b", chatId: "1000", direction: "in", text: "Tenant B first message", messageId: "1000-1" });
  expect(b.conversationId).toBe(a.conversationId);
  expect(b.text).toBe("TENANT A SECRET");
  const reply = await storeTelegramMessage({ tenantId: "telegram-b", chatId: "1000", direction: "in", text: "Reply from B", messageId: "1000-2", replyToMessageId: "1" });
  expect(reply.replyToText).toBe("TENANT A SECRET");
  expect(reply.conversationId).not.toBe(a.conversationId);
});

it("AUD-05: replaying a Telegram event increments unread and invokes automation twice", async () => {
  const { storeTelegramMessage } = await import("../lib/telegram-inbox");
  const { runInboundMessageAutomations } = await import("../lib/automation-engine");
  vi.mocked(runInboundMessageAutomations).mockClear();
  const input = { tenantId: "telegram-replay", chatId: "2000", direction: "in" as const, text: "hello", messageId: "2000-1" };
  const first = await storeTelegramMessage(input); await storeTelegramMessage(input);
  const { prisma } = await import("../lib/prisma");
  expect(await prisma.message.count({ where: { conversationId: first.conversationId } })).toBe(1);
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).unread).toBe(2);
  expect(runInboundMessageAutomations).toHaveBeenCalledTimes(2);
});

it("AUD-06: authenticated webhook registration accepts loopback and dispatches it", async () => {
  const previous = actor.role; actor.role = "مالك الحساب";
  const { POST } = await import("../app/api/developer/webhooks/route");
  const response = await POST(new NextRequest("http://localhost/api/developer/webhooks", { method: "POST", body: JSON.stringify({ url: "http://127.0.0.1:9999/internal", events: ["lead.created"] }) }));
  actor.role = previous;
  expect(response.status).toBe(200);
  const mockedFetch = vi.fn(async (_url: unknown) => { void _url; return new Response("ok"); }); vi.stubGlobal("fetch", mockedFetch);
  const { triggerWebhookEvent } = await import("../lib/webhooks");
  await triggerWebhookEvent(actor.tenantId, "lead.created", { id: "audit" });
  expect(mockedFetch.mock.calls[0]?.[0]).toBe("http://127.0.0.1:9999/internal");
  vi.unstubAllGlobals();
});

it("AUD-07: logout leaves the signed token valid", async () => {
  const { createSessionToken, verifySessionToken } = await import("../lib/auth");
  const token = createSessionToken("audit-user");
  const { POST } = await import("../app/api/auth/logout/route");
  expect((await POST()).status).toBe(200);
  expect(verifySessionToken(token)?.userId).toBe("audit-user");
});

it("AUD-08: tenant deletion leaves credentials and customer-related records", async () => {
  const { prisma } = await import("../lib/prisma");
  const tenantId = "audit-delete"; const now = new Date().toISOString();
  await prisma.subscription.create({ data: { id: "audit-delete-sub", tenantId, companyName: "Audit Delete", ownerName: "Owner", ownerEmail: "delete@audit.invalid", plan: "test", status: "نشط", employeeLimit: 3, amount: 0, billingCycle: "شهري", renewalAt: "", createdAt: now, updatedAt: now } });
  const { generateApiKey, resolveApiKeyTenant } = await import("../lib/developer-api");
  const { rawKey } = await generateApiKey(tenantId, "retained key");
  await prisma.knowledgeBaseEntry.create({ data: { id: "audit-kb", tenantId, question: "Private knowledge", answer: "Customer private information", createdAt: now, updatedAt: now } });
  const { deleteTenant } = await import("../lib/subscriptions");
  await deleteTenant(tenantId);
  expect(await resolveApiKeyTenant(rawKey)).toBe(tenantId);
  expect(await prisma.knowledgeBaseEntry.count({ where: { tenantId } })).toBe(1);
});

it("AUD-09: the same paid gateway transaction activates two different subscription rows", async () => {
  const { prisma } = await import("../lib/prisma");
  const { PAYMENT_STATUS } = await import("../lib/payment-status");
  vi.stubEnv("MOYASAR_SECRET_KEY", "sk_test_audit_fake");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "one-real-payment", status: "paid", amount: 10000, currency: "SAR", metadata: { tenant_id: "a-different-tenant", payment_id: "a-different-ledger-row" } }), { status: 200 })));
  for (const id of ["audit-payment-1", "audit-payment-2"]) {
    await prisma.subscriptionPayment.create({ data: { id, tenantId: actor.tenantId, amount: 100, amountHalalas: 10000, status: PAYMENT_STATUS.pending, planName: "audit-plan", planEmployeeLimit: 3, createdAt: new Date().toISOString() } });
    const { POST } = await import("../app/api/billing/confirm-payment/route");
    const response = await POST(new NextRequest("http://localhost/api/billing/confirm-payment", { method: "POST", body: JSON.stringify({ paymentId: id, moyasarPaymentId: "one-real-payment" }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe("completed");
  }
  expect(await prisma.subscriptionPayment.count({ where: { moyasarId: "one-real-payment", status: PAYMENT_STATUS.completed } })).toBe(2);
  vi.unstubAllGlobals();
});

it("AUD-10: a foreign customer can be attached to another tenant's conversation at DB level", async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.conversation.create({ data: { id: "audit-cross-fk", tenantId: "tenant-foreign", customerId: "customer-audit-private", lastMessage: "", status: "unassigned", assignee: "" } });
  const row = await prisma.conversation.findUniqueOrThrow({ where: { id: "audit-cross-fk" }, include: { customer: true } });
  expect(row.tenantId).not.toBe(row.customer.tenantId);
});
