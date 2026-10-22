import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-conversations-version.db");
const tenantId = "tenant-conv-version";
let signedIn = true;
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => (signedIn ? { id: "u1", name: "Owner", email: "owner@version.test", role: "مالك الحساب", tenantId } : null)) }));
vi.mock("../lib/permissions-server", () => ({ getEmployeeForUser: vi.fn(async () => null), getVisibleAssigneeNames: vi.fn(async () => undefined) }));
vi.setConfig({ testTimeout: 120_000 });

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

async function version() {
  const { GET } = await import("../app/api/conversations/version/route");
  const response = await GET(new NextRequest("https://linklysa.io/api/conversations/version"));
  return { status: response.status, version: ((await response.json()) as { version?: string }).version };
}

describe("GET /api/conversations/version", () => {
  it("needs a sign-in", async () => {
    signedIn = false;
    expect((await version()).status).toBe(401);
    signedIn = true;
  });

  it("stays the same while nothing changes and moves on a new message, a delivery update, a status change and a tag", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    await prisma.customer.create({ data: { id: "cust-v", name: "عميل", phone: "966500000001", initial: "ع", tenantId } });
    await prisma.conversation.create({ data: { id: "conv-v", customerId: "cust-v", channel: "whatsapp", lastMessage: "hi", status: "مفتوحة", assignee: "بدون موظف", tenantId, lastActivityAt: now } });
    await prisma.message.create({ data: { id: "m1", conversationId: "conv-v", direction: "out", text: "hi", time: "10:00", createdAt: now, deliveryStatus: "sent" } });

    const first = await version();
    expect(first.status).toBe(200);
    expect((await version()).version).toBe(first.version);

    await prisma.message.create({ data: { id: "m2", conversationId: "conv-v", direction: "in", text: "جديدة", time: "10:01", createdAt: new Date(Date.now() + 1000).toISOString() } });
    const afterMessage = (await version()).version;
    expect(afterMessage).not.toBe(first.version);

    await prisma.message.update({ where: { id: "m1" }, data: { deliveryStatus: "read" } });
    const afterRead = (await version()).version;
    expect(afterRead).not.toBe(afterMessage);

    await prisma.conversation.update({ where: { id: "conv-v" }, data: { status: "مغلقة" } });
    const afterStatus = (await version()).version;
    expect(afterStatus).not.toBe(afterRead);

    // A file attached to a message after it was stored (incoming media is downloaded in parallel) moves it too.
    await prisma.message.update({ where: { id: "m2" }, data: { attachmentType: "image", attachmentUrl: "data:image/jpeg;base64,AAAA", attachmentName: "a.jpg", attachmentMime: "image/jpeg" } });
    const afterAttach = (await version()).version;
    expect(afterAttach).not.toBe(afterStatus);

    await prisma.conversationTag.create({ data: { conversationId: "conv-v", tagName: "مهم" } }).catch(() => undefined);
    expect((await version()).version).not.toBe(afterAttach);
  });
});
