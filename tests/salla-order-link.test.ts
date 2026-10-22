import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-salla-order-link.db");
const sendBotText = vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ ok: true }));
vi.mock("../lib/bot-engine", () => ({ sendBotText: (...args: unknown[]) => sendBotText(...args) }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

beforeEach(async () => {
  sendBotText.mockClear();
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

async function seed(tenantId: string, phone: string) {
  const { prisma } = await import("../lib/prisma");
  await prisma.customer.create({ data: { id: `c-${tenantId}`, name: "سارة", phone, initial: "س", tenantId } });
  await prisma.conversation.create({ data: { id: `v-${tenantId}`, customerId: `c-${tenantId}`, channel: "whatsapp", lastMessage: "x", status: "assigned", assignee: "أحمد", lastActivityAt: new Date().toISOString(), tenantId } });
}

describe("order payment link on WhatsApp", () => {
  it("builds the message with the order number and link", async () => {
    const { orderLinkText } = await import("../lib/salla-order-link");
    expect(orderLinkText({ name: "سارة", reference: "202501", url: "https://pay.example/o/1" })).toContain("202501");
    expect(orderLinkText({ name: "", reference: "1", url: "https://x.test" })).toContain("عميلنا");
  });

  it("sends into the customer's existing conversation, matching the phone by its last 9 digits", async () => {
    await seed("t-link", "966500000111");
    const { sendOrderLinkOnWhatsApp } = await import("../lib/salla-order-link");
    const result = await sendOrderLinkOnWhatsApp({ tenantId: "t-link", phone: "+966 500000111", text: "hi", author: "موظف" });
    expect(result).toEqual({ sent: true, reason: "" });
    expect(sendBotText.mock.calls[0][1]).toMatchObject({ conversationId: "v-t-link", recipientId: "966500000111" });
  });

  it("reports no conversation, an expired window and failures", async () => {
    const { sendOrderLinkOnWhatsApp } = await import("../lib/salla-order-link");
    expect((await sendOrderLinkOnWhatsApp({ tenantId: "t-none", phone: "966500000222", text: "x", author: "a" })).reason).toBe("no-conversation");
    await seed("t-link2", "966500000333");
    sendBotText.mockResolvedValueOnce({ ok: false, skipped: true, error: "WHATSAPP_WINDOW_EXPIRED" });
    expect((await sendOrderLinkOnWhatsApp({ tenantId: "t-link2", phone: "966500000333", text: "x", author: "a" })).reason).toBe("window-expired");
    sendBotText.mockResolvedValueOnce({ ok: false, error: "boom" });
    expect((await sendOrderLinkOnWhatsApp({ tenantId: "t-link2", phone: "966500000333", text: "x", author: "a" })).reason).toBe("failed");
  });

  it("never matches another workspace's customer", async () => {
    await seed("t-link3", "966500000444");
    const { sendOrderLinkOnWhatsApp } = await import("../lib/salla-order-link");
    expect((await sendOrderLinkOnWhatsApp({ tenantId: "t-other", phone: "966500000444", text: "x", author: "a" })).reason).toBe("no-conversation");
  });
});
