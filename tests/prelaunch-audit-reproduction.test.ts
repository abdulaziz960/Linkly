/**
 * Pre-launch audit tests (no production DB or external provider is used).
 *
 * - Plain `it(...)`: a defect that was fixed; asserts the SECURE behaviour (regression test).
 * - `it.fails(...)`: a defect that is STILL OPEN; asserts the secure behaviour that does not
 *   hold yet. The suite stays green while the defect exists and goes red when it is fixed,
 *   which is the signal to change `it.fails` to `it`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const actor = vi.hoisted(() => ({ id: "audit-agent", email: "agent@audit.invalid", name: "Agent", role: "موظف دعم", tenantId: "audit-a" }));
const cookieJar = vi.hoisted(() => ({ value: "" }));
vi.mock("next/headers", async (original) => ({ ...await original<object>(), cookies: vi.fn(async () => ({ get: () => (cookieJar.value ? { value: cookieJar.value } : undefined) })) }));
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

it("AUD-01 [FIXED]: public widget polling must not expose internal notes", async () => {
  const { prisma } = await import("../lib/prisma");
  const { websiteConversationId } = await import("../lib/website-inbox");
  const id = websiteConversationId("audit-widget", "visitor-a");
  await seedConversation(id, "audit-widget", "website");
  await prisma.integrationSetting.create({ data: { id: "audit-widget", tenantId: "audit-widget", provider: "website", status: "connected", verifyToken: "public-widget-site-key", businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "", wabaId: "", appId: "", configId: "", accessToken: "", webhookUrl: "", updatedAt: new Date().toISOString() } });
  await prisma.message.create({ data: { id: "audit-internal-note", conversationId: id, direction: "note", text: "INTERNAL ONLY: private staff note", time: "12:00", createdAt: new Date().toISOString() } });
  const { GET } = await import("../app/api/website/messages/route");
  const response = await GET(new NextRequest("http://localhost/api/website/messages?siteKey=public-widget-site-key&visitorId=visitor-a"));
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain("INTERNAL ONLY");
});

it("AUD-02 [FIXED]: employee must not change another employee's assigned conversation", async () => {
  await seedConversation("audit-private", actor.tenantId);
  const { PATCH } = await import("../app/api/conversations/[id]/route");
  const response = await PATCH(new NextRequest("http://localhost/api/conversations/audit-private", { method: "PATCH", body: JSON.stringify({ assignee: actor.name, dealValue: 999 }) }), { params: Promise.resolve({ id: "audit-private" }) });
  const { prisma } = await import("../lib/prisma");
  expect(response.status).not.toBe(200);
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: "audit-private" } })).assignee).toBe("Another employee");
});

it("AUD-03 [FIXED]: opening a conversation by customer must respect assignee scope", async () => {
  await seedConversation("audit-private-read", actor.tenantId);
  const { prisma } = await import("../lib/prisma");
  await prisma.message.create({ data: { id: "private-read-message", conversationId: "audit-private-read", direction: "in", text: "OTHER AGENT PRIVATE HISTORY", time: "12:00", createdAt: new Date().toISOString() } });
  const { POST } = await import("../app/api/conversations/route");
  const response = await POST(new NextRequest("http://localhost/api/conversations", { method: "POST", body: JSON.stringify({ customerId: "customer-audit-private-read" }) }));
  expect(await response.text()).not.toContain("OTHER AGENT PRIVATE HISTORY");
});

it("AUD-04 [FIXED]: a Telegram message id collision must never cross tenants", async () => {
  const { storeTelegramMessage } = await import("../lib/telegram-inbox");
  const a = await storeTelegramMessage({ tenantId: "telegram-a", chatId: "1000", direction: "in", text: "TENANT A SECRET", messageId: "1000-1" });
  const b = await storeTelegramMessage({ tenantId: "telegram-b", chatId: "1000", direction: "in", text: "Tenant B first message", messageId: "1000-1" });
  expect(b.conversationId).not.toBe(a.conversationId);
  expect(b.text).toBe("Tenant B first message");
  const reply = await storeTelegramMessage({ tenantId: "telegram-b", chatId: "1000", direction: "in", text: "Reply from B", messageId: "1000-2", replyToMessageId: "1" });
  expect(reply.replyToText).toBe("Tenant B first message");
});

it("AUD-05 [FIXED]: replaying a Telegram event must not double-count unread or re-run automations", async () => {
  const { storeTelegramMessage } = await import("../lib/telegram-inbox");
  const { runInboundMessageAutomations } = await import("../lib/automation-engine");
  vi.mocked(runInboundMessageAutomations).mockClear();
  const input = { tenantId: "telegram-replay", chatId: "2000", direction: "in" as const, text: "hello", messageId: "2000-1" };
  const first = await storeTelegramMessage(input); await storeTelegramMessage(input);
  const { prisma } = await import("../lib/prisma");
  expect(await prisma.message.count({ where: { conversationId: first.conversationId } })).toBe(1);
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).unread).toBe(1);
  expect(runInboundMessageAutomations).toHaveBeenCalledTimes(1);
});

it("AUD-06 [FIXED]: webhook registration rejects loopback targets", async () => {
  const previous = actor.role; actor.role = "مالك الحساب";
  const { POST } = await import("../app/api/developer/webhooks/route");
  const response = await POST(new NextRequest("http://localhost/api/developer/webhooks", { method: "POST", body: JSON.stringify({ url: "http://127.0.0.1:9999/internal", events: ["lead.created"] }) }));
  actor.role = previous;
  expect(response.status).toBe(400);
  const mockedFetch = vi.fn(async (_url: unknown) => { void _url; return new Response("ok"); }); vi.stubGlobal("fetch", mockedFetch);
  const { triggerWebhookEvent } = await import("../lib/webhooks");
  await triggerWebhookEvent(actor.tenantId, "lead.created", { id: "audit" });
  expect(mockedFetch.mock.calls.some((call) => call[0] === "http://127.0.0.1:9999/internal")).toBe(false);
  vi.unstubAllGlobals();
});

it("AUD-07 [FIXED]: logout invalidates the signed session token server-side", async () => {
  const { prisma } = await import("../lib/prisma");
  const { createSessionToken, verifySessionToken } = await import("../lib/auth");
  await prisma.userAccount.create({ data: { id: "audit-logout-user", name: "Logout", email: "logout@audit.invalid", passwordHash: "", role: "مالك الحساب", tenantId: actor.tenantId, createdAt: new Date().toISOString() } });
  const token = createSessionToken("audit-logout-user", undefined, 0);
  cookieJar.value = token;
  const { POST } = await import("../app/api/auth/logout/route");
  expect((await POST()).status).toBe(200);
  cookieJar.value = "";
  const row = await prisma.userAccount.findUniqueOrThrow({ where: { id: "audit-logout-user" } });
  const session = verifySessionToken(token);
  expect(session).not.toBeNull();
  expect(row.sessionVersion).toBeGreaterThan(session!.sessionVersion);
});

it("AUD-08 [FIXED]: tenant deletion must remove credentials and customer-related records", async () => {
  const { prisma } = await import("../lib/prisma");
  const tenantId = "audit-delete"; const now = new Date().toISOString();
  await prisma.subscription.create({ data: { id: "audit-delete-sub", tenantId, companyName: "Audit Delete", ownerName: "Owner", ownerEmail: "delete@audit.invalid", plan: "test", status: "نشط", employeeLimit: 3, amount: 0, billingCycle: "شهري", renewalAt: "", createdAt: now, updatedAt: now } });
  const { generateApiKey, resolveApiKeyTenant } = await import("../lib/developer-api");
  const { rawKey } = await generateApiKey(tenantId, "retained key");
  await prisma.knowledgeBaseEntry.create({ data: { id: "audit-kb", tenantId, question: "Private knowledge", answer: "Customer private information", createdAt: now, updatedAt: now } });
  const { deleteTenant } = await import("../lib/subscriptions");
  await deleteTenant(tenantId);
  expect(await resolveApiKeyTenant(rawKey)).not.toBe(tenantId);
  expect(await prisma.knowledgeBaseEntry.count({ where: { tenantId } })).toBe(0);
});

it("AUD-09 [FIXED]: one paid gateway transaction cannot activate two payment rows", async () => {
  const { prisma } = await import("../lib/prisma");
  const { PAYMENT_STATUS } = await import("../lib/payment-status");
  vi.stubEnv("MOYASAR_SECRET_KEY", "sk_test_audit_fake");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "one-real-payment", status: "paid", amount: 10000, currency: "SAR", metadata: { tenant_id: "a-different-tenant", payment_id: "a-different-ledger-row" } }), { status: 200 })));
  const results: number[] = [];
  for (const id of ["audit-payment-1", "audit-payment-2"]) {
    await prisma.subscriptionPayment.create({ data: { id, tenantId: actor.tenantId, amount: 100, amountHalalas: 10000, status: PAYMENT_STATUS.pending, planName: "audit-plan", planEmployeeLimit: 3, createdAt: new Date().toISOString() } });
    const { POST } = await import("../app/api/billing/confirm-payment/route");
    const response = await POST(new NextRequest("http://localhost/api/billing/confirm-payment", { method: "POST", body: JSON.stringify({ paymentId: id, moyasarPaymentId: "one-real-payment" }) }));
    results.push(response.status);
  }
  expect(results[0]).toBe(200);
  expect(results[1]).toBe(409);
  expect(await prisma.subscriptionPayment.count({ where: { moyasarId: "one-real-payment", status: PAYMENT_STATUS.completed } })).toBe(1);
  vi.unstubAllGlobals();
});

it.fails("AUD-10 [OPEN]: a conversation must not accept a customer from another tenant", async () => {
  const { prisma } = await import("../lib/prisma");
  await expect(prisma.conversation.create({ data: { id: "audit-cross-fk", tenantId: "tenant-foreign", customerId: "customer-audit-private", lastMessage: "", status: "unassigned", assignee: "" } })).rejects.toThrow();
});
