import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-emoji-names.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("names that start with an emoji", () => {
  it("firstChar keeps the whole emoji and wellFormed repairs broken halves", async () => {
    const { firstChar, wellFormed } = await import("../lib/first-char");
    expect(firstChar("😀 علي")).toBe("😀");
    expect(firstChar("علي")).toBe("ع");
    expect(firstChar("")).toBe("");
    // "\ud83d" alone is the broken half that crashed the webhook.
    expect(wellFormed("ab\ud83d")).toBe("ab�");
    expect(wellFormed("ok 😀")).toBe("ok 😀");
  });

  it("stores a WhatsApp message from a customer whose profile name starts with an emoji", async () => {
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    const { prisma } = await import("../lib/prisma");
    const result = await storeWhatsAppMessage({ phone: "966500000111", name: "😀 عبدالعزيز", text: "مرحبا", direction: "in", tenantId: "tenant-emoji", messageId: "m-emoji-1" });
    expect(result.isNew).toBe(true);
    const customer = await prisma.customer.findFirst({ where: { tenantId: "tenant-emoji" } });
    expect(customer?.name).toBe("😀 عبدالعزيز");
    expect(customer?.initial).toBe("😀");

    // A name that is itself broken (lone half) is repaired instead of failing the whole webhook.
    const broken = await storeWhatsAppMessage({ phone: "966500000222", name: "\ud83d", text: "hi", direction: "in", tenantId: "tenant-emoji", messageId: "m-emoji-2" });
    expect(broken.isNew).toBe(true);
  });
});
