import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-conversation-assign-guard.db");
const tenantId = "tenant-assign-guard";
let role = "موظف دعم";

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "سارة", email: "sara@assign-guard.test", tenantId, role }))
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

async function patch(assignee: string) {
  const { PATCH } = await import("../app/api/conversations/[id]/route");
  return PATCH(new NextRequest("http://localhost/api/conversations/conv-assign", { method: "PATCH", body: JSON.stringify({ assignee }), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "conv-assign" }) });
}

describe("PATCH /api/conversations/[id] - who may assign, and to whom", () => {
  it("only the owner assigns, and only to a real employee", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    await prisma.customer.create({ data: { id: "cust-assign", name: "عميل", phone: "500000001", initial: "ع", tenantId } });
    await prisma.conversation.create({ data: { id: "conv-assign", customerId: "cust-assign", channel: "whatsapp", lastMessage: "", status: "unassigned", assignee: "بدون موظف", tenantId } });
    await prisma.employee.create({ data: { id: "emp-assign", name: "خالد", initial: "خ", email: "khaled@assign-guard.test", role: "موظف دعم", permissions: "محادثات", status: "متصل", tenantId } as never });

    // an agent who sends the request by hand is refused, and nothing changes
    expect((await patch("خالد")).status).toBe(403);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: "conv-assign" } })).assignee).toBe("بدون موظف");

    role = "مالك الحساب";
    // a name that is not an employee would hide the chat from the team
    expect((await patch("اسم غير موجود")).status).toBe(400);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: "conv-assign" } })).assignee).toBe("بدون موظف");

    expect((await patch("خالد")).status).toBe(200);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: "conv-assign" } })).assignee).toBe("خالد");
    expect((await patch("بدون موظف")).status).toBe(200);
  });
});
