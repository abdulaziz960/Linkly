import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const conversation = { id: "allowed", tenantId: "tenant-1", customerId: "customer-1", channel: "website", assignee: "Agent", customer: { id: "customer-1", name: "Customer", phone: "966500000001" } };
  const tx = {
    message: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data) },
    customer: { upsert: vi.fn() },
    conversation: { update: vi.fn(), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...conversation, ...data })) }
  };
  return { conversation, tx, access: vi.fn(async () => true), prisma: {
    conversation: { findFirst: vi.fn(async (...args: unknown[]): Promise<typeof conversation | null> => { void args; return conversation; }) },
    customer: { findFirst: vi.fn(async (): Promise<{ id: string } | null> => null) },
    message: { findFirst: vi.fn(async (...args: unknown[]): Promise<Record<string, unknown> | null> => { void args; return null; }) },
    $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx))
  } };
});
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "agent", email: "agent@example.test", name: "Agent", role: "موظف", tenantId: "tenant-1" })) }));
vi.mock("../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../lib/permissions-server", () => ({ canAccessConversation: mocks.access }));
import { POST } from "../app/api/conversations/[id]/messages/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue(true);
  mocks.prisma.conversation.findFirst.mockResolvedValue(mocks.conversation);
  mocks.prisma.customer.findFirst.mockResolvedValue(null);
  mocks.prisma.message.findFirst.mockResolvedValue(null);
});
function send(id: string, extra: Record<string, unknown> = {}) {
  return POST(new NextRequest(`http://localhost/api/conversations/${id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: "note", text: "Test note", ...extra }) }), { params: Promise.resolve({ id }) });
}
it("rejects an alias resolving by phone to another employee's conversation before writes", async () => {
  mocks.prisma.conversation.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ ...mocks.conversation, id: "hidden" });
  mocks.prisma.customer.findFirst.mockResolvedValue({ id: "customer-1" });
  mocks.access.mockResolvedValue(false);
  expect((await send("unused", { conversation: { phone: "966500000001" } })).status).toBe(404);
  expect(mocks.access).toHaveBeenCalledWith(expect.anything(), "hidden");
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
});
it("also rejects an unauthorized canonical prefixed ID before upsert or creation", async () => {
  mocks.prisma.conversation.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ ...mocks.conversation, id: "tenant-1-alias" });
  mocks.access.mockResolvedValue(false);
  expect((await send("alias", { conversation: { phone: "966500000002" } })).status).toBe(404);
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
});
it("permits a phone alias when the resolved conversation is accessible", async () => {
  mocks.prisma.conversation.findFirst.mockResolvedValueOnce(null).mockResolvedValue(mocks.conversation);
  mocks.prisma.customer.findFirst.mockResolvedValue({ id: "customer-1" });
  expect((await send("unused", { conversation: { phone: "966500000001" } })).status).toBe(200);
  expect(mocks.tx.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ conversationId: "allowed" }) }));
});
it.each(["replyToMessageId", "replyToCommentId"])("rejects %s from a different conversation before writes or sends", async (field) => {
  mocks.prisma.message.findFirst.mockImplementation(async (query) => {
    const { where } = query as { where: { conversationId?: string } };
    return where.conversationId ? null : { id: "victim-message", text: "Private text", author: "Other agent" };
  });
  expect((await send("allowed", { [field]: "victim-message" })).status).toBe(404);
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
});
it("keeps a legitimate same-conversation reply and its preview", async () => {
  mocks.prisma.message.findFirst.mockResolvedValue({ id: "own-message", text: "Question", direction: "in" });
  expect((await send("allowed", { replyToMessageId: "own-message" })).status).toBe(200);
  expect(mocks.prisma.message.findFirst).toHaveBeenCalledWith({ where: { id: "own-message", conversationId: "allowed", conversation: { tenantId: "tenant-1" } } });
  expect(mocks.tx.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ replyToText: "Question" }) }));
});
it("does not create customer or conversation records for an invalid reply to a new target", async () => {
  mocks.prisma.conversation.findFirst.mockResolvedValue(null);
  expect((await send("new", { conversation: { phone: "966500000003" }, replyToMessageId: "missing" })).status).toBe(404);
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
});
it("still creates a fresh conversation without a reply reference", async () => {
  mocks.prisma.conversation.findFirst.mockResolvedValue(null);
  expect((await send("new", { conversation: { phone: "966500000003" } })).status).toBe(200);
  expect(mocks.tx.conversation.create).toHaveBeenCalledTimes(1);
});
