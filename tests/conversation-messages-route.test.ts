import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const conversation = {
    id: "conv-website",
    customerId: "customer-1",
    channel: "website",
    lastMessage: "",
    status: "unassigned",
    assignee: "بدون موظف",
    unread: 0,
    windowExpired: 0,
    lastActivityAt: "",
    tenantId: "tenant-1",
    customer: {
      id: "customer-1",
      name: "عميل الموقع",
      phone: "",
      initial: "ع",
      tenantId: "tenant-1"
    }
  };
  const transaction = {
    message: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data)
    },
    conversation: {
      update: vi.fn(async () => conversation)
    }
  };

  return {
    conversation,
    transaction,
    prisma: {
      conversation: {
        findFirst: vi.fn(async () => conversation)
      },
      message: {
        findFirst: vi.fn(async () => null)
      },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
    }
  };
});

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "user-1",
    name: "عبدالعزيز",
    tenantId: "tenant-1"
  }))
}));

vi.mock("../lib/prisma", () => ({ prisma: database.prisma }));

import { POST } from "../app/api/conversations/[id]/messages/route";

describe("POST /api/conversations/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the website reply response contract while recording one message and activity update", async () => {
    const request = new NextRequest("http://localhost/api/conversations/conv-website/messages", {
      method: "POST",
      body: JSON.stringify({ text: "أهلًا بك" }),
      headers: { "Content-Type": "application/json" }
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: "conv-website" })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      data: {
        conversationId: "conv-website",
        direction: "out",
        text: "أهلًا بك",
        author: "عبدالعزيز"
      }
    });
    expect(database.transaction.message.create).toHaveBeenCalledTimes(1);
    expect(database.transaction.conversation.update).toHaveBeenCalledTimes(1);
  });
});
