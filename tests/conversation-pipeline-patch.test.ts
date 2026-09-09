import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-conversation-pipeline-patch.db");

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

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "عبدالعزيز", tenantId: "tenant-pipeline-test" }))
}));

describe("PATCH /api/conversations/[id] - pipeline stage & deal value", () => {
  async function seedConversation(id: string, tenantId: string) {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    await prisma.customer.upsert({
      where: { id: `cust-${id}` },
      update: {},
      create: { id: `cust-${id}`, name: "عميل", phone: "500000000", initial: "ع", tenantId }
    });
    await prisma.conversation.upsert({
      where: { id },
      update: {},
      create: { id, customerId: `cust-${id}`, channel: "whatsapp", lastMessage: "", status: "unassigned", assignee: "بدون موظف", tenantId }
    });
  }

  it("updates pipelineStage and dealValue, and closes the conversation on فاز", async () => {
    const { PATCH } = await import("../app/api/conversations/[id]/route");
    const { prisma } = await import("../lib/prisma");
    await seedConversation("conv-pipeline-1", "tenant-pipeline-test");

    // PipelineView.tsx's moveConversation() sends status:"closed" alongside
    // pipelineStage:"فاز"/"خسر" itself - the route doesn't derive one from
    // the other, so the test request mirrors what the real client sends.
    const request = new NextRequest("http://localhost/api/conversations/conv-pipeline-1", {
      method: "PATCH",
      body: JSON.stringify({ pipelineStage: "فاز", dealValue: 4500, status: "closed" }),
      headers: { "Content-Type": "application/json" }
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "conv-pipeline-1" }) });
    expect(response.status).toBe(200);

    const conversation = await prisma.conversation.findUnique({ where: { id: "conv-pipeline-1" } });
    expect(conversation?.pipelineStage).toBe("فاز");
    expect(conversation?.dealValue).toBe(4500);
    expect(conversation?.status).toBe("closed");
  });

  it("rejects an unknown pipeline stage", async () => {
    const { PATCH } = await import("../app/api/conversations/[id]/route");
    await seedConversation("conv-pipeline-2", "tenant-pipeline-test");

    const request = new NextRequest("http://localhost/api/conversations/conv-pipeline-2", {
      method: "PATCH",
      body: JSON.stringify({ pipelineStage: "not-a-real-stage" }),
      headers: { "Content-Type": "application/json" }
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "conv-pipeline-2" }) });
    expect(response.status).toBe(400);
  });

  it("is tenant-scoped - cannot update a conversation belonging to another tenant", async () => {
    const { PATCH } = await import("../app/api/conversations/[id]/route");
    await seedConversation("conv-pipeline-other-tenant", "some-other-tenant");

    const request = new NextRequest("http://localhost/api/conversations/conv-pipeline-other-tenant", {
      method: "PATCH",
      body: JSON.stringify({ pipelineStage: "مهتم" }),
      headers: { "Content-Type": "application/json" }
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: "conv-pipeline-other-tenant" }) });
    expect(response.status).toBe(404);
  });
});
