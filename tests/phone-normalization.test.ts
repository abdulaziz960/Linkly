import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Loaded inside each test, after beforeAll has pointed DATABASE_URL at the temporary
// database - a top-level import would open the developer's own dev.db.
const normalize = async (value: string) => (await import("../lib/whatsapp-inbox")).normalizeWhatsAppPhone(value);

describe("normalizeWhatsAppPhone", () => {
  it("turns every way of writing a Saudi mobile number into the international digits", async () => {
    for (const value of ["0501234567", "501234567", "966501234567", "+966501234567", "00966501234567", "+966 50 123 4567", "050-123-4567", "(966) 50 123 4567"]) {
      expect(await normalize(value)).toBe("966501234567");
    }
  });

  it("understands Arabic-script formatting characters around the digits", async () => {
    expect(await normalize("\u200E+966 50 123 4567\u200F")).toBe("966501234567");
  });

  it("leaves other international numbers as digits", async () => {
    expect(await normalize("+44 7700 900123")).toBe("447700900123");
    expect(await normalize("0044 7700 900123")).toBe("447700900123");
  });

  it("returns an empty string when there are no digits, and does not invent a country code for short input", async () => {
    expect(await normalize("")).toBe("");
    expect(await normalize("abc")).toBe("");
    expect(await normalize("123")).toBe("123");
  });

  it("is stable when applied twice", async () => {
    expect(await normalize(await normalize("0501234567"))).toBe("966501234567");
  });
});

const testDbPath = join(process.cwd(), "tests", ".tmp-phone-normalization.db");
const tenantId = "tenant-phone-normalization";
const user = { id: "user-phone", name: "Owner", email: "owner@phone.example", role: "مالك الحساب", tenantId };

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.doMock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  vi.doUnmock("../lib/auth");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

function open(phone: string) {
  return new NextRequest("http://localhost/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone })
  });
}

describe("POST /api/conversations with a phone number", () => {
  it("opens the same customer and thread however the number is written", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    const { POST } = await import("../app/api/conversations/route");

    const first = await (await POST(open("0501234567"))).json();
    const second = await (await POST(open("+966 50 123 4567"))).json();
    const third = await (await POST(open("966501234567"))).json();

    expect(first.ok).toBe(true);
    expect(second.data.id).toBe(first.data.id);
    expect(third.data.id).toBe(first.data.id);
    expect(await prisma.customer.count({ where: { tenantId, phone: { contains: "501234567" } } })).toBe(1);
    expect(await prisma.customer.findFirst({ where: { tenantId } })).toMatchObject({ id: `${tenantId}-wa-966501234567`, phone: "966501234567" });
  });

  it("reuses a customer that was stored under the local spelling before numbers were normalised", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    await prisma.customer.create({ data: { id: `${tenantId}-wa-0555000111`, name: "Legacy", phone: "0555000111", initial: "L", tenantId } });
    const { POST } = await import("../app/api/conversations/route");

    const result = await (await POST(open("0555000111"))).json();

    expect(result.ok).toBe(true);
    expect(await prisma.customer.count({ where: { tenantId, phone: { in: ["0555000111", "966555000111"] } } })).toBe(1);
    expect(await prisma.conversation.findFirst({ where: { customerId: `${tenantId}-wa-0555000111` } })).not.toBeNull();
  });
});
