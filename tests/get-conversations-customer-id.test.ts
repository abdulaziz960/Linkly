import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-get-conversations-customer-id.db");
const tenantId = "tenant-get-conversations-customer-id";

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

describe("getConversations customerId", () => {
  it("exposes the real customerId, which differs from the conversation's own id for a WhatsApp conversation", async () => {
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    const inbound = await storeWhatsAppMessage({
      tenantId,
      phone: "966500000001",
      name: "عميل واتساب",
      direction: "in",
      messageId: "get-conversations-customer-id-inbound-1",
      text: "مرحبا"
    });

    const { getConversations, getCustomers } = await import("../lib/database");
    const [conversations, customers] = await Promise.all([getConversations(tenantId), getCustomers(tenantId)]);
    const conversation = conversations.find((item) => item.id === inbound.conversationId);
    const customer = customers.find((item) => item.phone === "966500000001");

    expect(conversation?.id).not.toBe(customer?.id);
    expect(conversation?.customerId).toBe(customer?.id);
  });
});
