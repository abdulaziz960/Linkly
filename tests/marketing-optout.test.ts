import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-marketing-optout.db");
const tenantId = "tenant-optout-keyword";

const sendWhatsAppTextMessage = vi.fn(async (...args: unknown[]) => {
  void args;
  return { ok: true };
});
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppTextMessage: (...args: unknown[]) => sendWhatsAppTextMessage(...args)
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterEach(() => {
  sendWhatsAppTextMessage.mockClear();
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

async function seedConversation(id: string, phone: string) {
  const { prisma } = await import("../lib/prisma");
  const customerId = `cust-${id}`;
  await prisma.customer.create({ data: { id: customerId, name: "Test customer", phone, initial: "T", tenantId } });
  await prisma.conversation.create({
    data: { id, customerId, channel: "whatsapp", lastMessage: "", status: "unassigned", assignee: "بدون موظف", tenantId }
  });
  return customerId;
}

describe("WhatsApp marketing opt-out/in keyword", () => {
  it("opts a customer out on an exact STOP reply and sends a confirmation", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { handleMarketingOptOutKeyword } = await import("../lib/marketing-optout");
    await ensureSchema();

    const customerId = await seedConversation("conv-optout-stop", "966500000010");
    await handleMarketingOptOutKeyword({ tenantId, conversationId: "conv-optout-stop", phone: "966500000010", text: "STOP" });

    expect(await prisma.customer.findUnique({ where: { id: customerId } })).toMatchObject({ marketingOptOut: 1 });
    expect(sendWhatsAppTextMessage).toHaveBeenCalledTimes(1);
  });

  it("treats the keyword case-insensitively and with surrounding whitespace", async () => {
    const { prisma } = await import("../lib/prisma");
    const customerId = await seedConversation("conv-optout-mixedcase", "966500000011");
    const { handleMarketingOptOutKeyword } = await import("../lib/marketing-optout");

    await handleMarketingOptOutKeyword({ tenantId, conversationId: "conv-optout-mixedcase", phone: "966500000011", text: "  Stop  " });
    expect(await prisma.customer.findUnique({ where: { id: customerId } })).toMatchObject({ marketingOptOut: 1 });
  });

  it("does NOT opt out on a message that merely contains the word stop as a substring", async () => {
    const { prisma } = await import("../lib/prisma");
    const customerId = await seedConversation("conv-optout-substring", "966500000012");
    const { handleMarketingOptOutKeyword } = await import("../lib/marketing-optout");

    await handleMarketingOptOutKeyword({ tenantId, conversationId: "conv-optout-substring", phone: "966500000012", text: "please stop calling me at night" });
    expect(await prisma.customer.findUnique({ where: { id: customerId } })).toMatchObject({ marketingOptOut: 0 });
    expect(sendWhatsAppTextMessage).not.toHaveBeenCalled();
  });

  it("opts a previously opted-out customer back in on START", async () => {
    const { prisma } = await import("../lib/prisma");
    const customerId = await seedConversation("conv-optin", "966500000013");
    await prisma.customer.update({ where: { id: customerId }, data: { marketingOptOut: 1, marketingOptOutAt: new Date().toISOString() } });
    const { handleMarketingOptOutKeyword } = await import("../lib/marketing-optout");

    await handleMarketingOptOutKeyword({ tenantId, conversationId: "conv-optin", phone: "966500000013", text: "start" });
    expect(await prisma.customer.findUnique({ where: { id: customerId } })).toMatchObject({ marketingOptOut: 0, marketingOptOutAt: "" });
  });

  it("recognizes the Arabic opt-out keywords too", async () => {
    const { prisma } = await import("../lib/prisma");
    const customerId = await seedConversation("conv-optout-arabic", "966500000014");
    const { handleMarketingOptOutKeyword } = await import("../lib/marketing-optout");

    await handleMarketingOptOutKeyword({ tenantId, conversationId: "conv-optout-arabic", phone: "966500000014", text: "إيقاف" });
    expect(await prisma.customer.findUnique({ where: { id: customerId } })).toMatchObject({ marketingOptOut: 1 });
  });
});
