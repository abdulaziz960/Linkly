import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-crm-assignment.db");
const tenantId = "tenant-crm-assign";

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

async function seedEmployees() {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const base = { role: "موظف", status: "متصل", permissions: "[]", tenantId };
  await prisma.employee.createMany({
    data: [
      { ...base, id: "emp-azzam", name: "عزام", email: "Azzam@Example.com", initial: "ع" },
      { ...base, id: "emp-sara", name: "سارة", email: "sara@example.com", initial: "س" },
      { ...base, id: "emp-dup1", name: "ماجد", email: "majed1@example.com", initial: "م" },
      { ...base, id: "emp-dup2", name: "ماجد", email: "majed2@example.com", initial: "م" }
    ]
  });
}

function leadRequest(rawKey: string, body: Record<string, unknown>) {
  return new NextRequest("https://example.test/api/v1/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${rawKey}` },
    body: JSON.stringify(body)
  });
}

describe("assigning a CRM lead to the same employee", () => {
  it("finds the employee by email (any case), by CRM id, or by exact name", async () => {
    await seedEmployees();
    const { resolveCrmEmployee, setCrmEmployeeMapping } = await import("../lib/crm-assignment");

    expect(await resolveCrmEmployee(tenantId, { email: "azzam@example.com" })).toMatchObject({ by: "email", employee: { id: "emp-azzam" } });
    expect(await resolveCrmEmployee(tenantId, { name: "سارة" })).toMatchObject({ by: "name", employee: { id: "emp-sara" } });

    expect(await setCrmEmployeeMapping(tenantId, "crm-77", "emp-sara")).toEqual({ ok: true });
    expect(await resolveCrmEmployee(tenantId, { externalId: "crm-77" })).toMatchObject({ by: "externalId", employee: { id: "emp-sara" } });
    expect(await setCrmEmployeeMapping(tenantId, "crm-78", "no-such-employee")).toMatchObject({ ok: false });

    expect(await resolveCrmEmployee(tenantId, { name: "ماجد" })).toEqual({ employee: null, reason: "ambiguous_name" });
    expect(await resolveCrmEmployee(tenantId, { email: "nobody@example.com" })).toEqual({ employee: null, reason: "not_found" });
    expect(await resolveCrmEmployee(tenantId, {})).toEqual({ employee: null, reason: "no_reference" });
    // Another workspace never resolves this workspace's employees.
    expect(await resolveCrmEmployee("other-tenant", { email: "azzam@example.com" })).toMatchObject({ employee: null });
  });

  it("the lead API assigns the conversation, keeps an assigned lead, and survives an unknown employee", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { POST } = await import("../app/api/v1/conversations/route");
    const { prisma } = await import("../lib/prisma");
    const { rawKey } = await generateApiKey(tenantId, "crm key");

    const first = await (await POST(leadRequest(rawKey, { customerPhone: "0501112233", customerName: "فهد", text: "مهتم بالمشروع", assigneeEmail: "azzam@example.com" }))).json();
    expect(first.ok).toBe(true);
    expect(first.data.assignment).toMatchObject({ assigned: true, employee: "عزام", by: "email" });
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: first.data.conversationId } });
    expect(conversation).toMatchObject({ assignee: "عزام", status: "assigned" });
    // The assignee fields are routing hints, not form answers shown on the lead.
    const allText = (await prisma.message.findMany({ where: { conversationId: first.data.conversationId } })).map((message) => message.text).join("\n");
    expect(allText).not.toContain("azzam@example.com");
    const notes = await prisma.message.findMany({ where: { conversationId: first.data.conversationId, sourceType: "system_assignment" } });
    expect(notes[0]?.text).toContain("عزام");

    // The CRM resends the same lead for someone else: the employee already working it keeps it...
    const again = await (await POST(leadRequest(rawKey, { customerPhone: "0501112233", text: "تحديث", assigneeEmail: "sara@example.com" }))).json();
    expect(again.data.assignment).toMatchObject({ assigned: false, reason: "already_assigned", employee: "عزام" });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: first.data.conversationId } })).assignee).toBe("عزام");
    // ...unless the CRM explicitly asks to reassign.
    const moved = await (await POST(leadRequest(rawKey, { customerPhone: "0501112233", text: "نقل", assigneeEmail: "sara@example.com", reassign: true }))).json();
    expect(moved.data.assignment).toMatchObject({ assigned: true, employee: "سارة" });

    // An employee we cannot find never loses the lead.
    const unknown = await (await POST(leadRequest(rawKey, { customerPhone: "0504445566", text: "عميل", assigneeEmail: "ghost@example.com" }))).json();
    expect(unknown.ok).toBe(true);
    expect(unknown.data.assignment).toMatchObject({ assigned: false, reason: "not_found" });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: unknown.data.conversationId } })).status).toBe("unassigned");

    // No assignee at all behaves exactly as before.
    const plain = await (await POST(leadRequest(rawKey, { customerPhone: "0507778899", text: "عميل" }))).json();
    expect(plain.data.assignment).toBeNull();
  });
});
