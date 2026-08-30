import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { createHmac } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-x-webhook.db");
const TENANT_ID = "tenant-x-webhook-test";
const OWN_USER_ID = "own-account-id";
const CONSUMER_SECRET = "test-consumer-secret";

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

async function seedXIntegration() {
  const { getIntegrationSettings } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  const settings = await getIntegrationSettings("x", TENANT_ID);
  await prisma.integrationSetting.update({
    where: { id: settings.id },
    data: { wabaId: OWN_USER_ID, xConsumerSecret: CONSUMER_SECRET, status: "connected" }
  });
}

function signedBody(body: unknown) {
  const raw = JSON.stringify(body);
  const signature = `sha256=${createHmac("sha256", CONSUMER_SECRET).update(raw).digest("base64")}`;
  return { raw, signature };
}

describe("X realtime webhook - public reply/comment events", () => {
  it("stores a comment on our post using the comment's own id as the reply target, not the parent post", async () => {
    await seedXIntegration();

    const { raw, signature } = signedBody({
      data: [
        {
          id: "comment-123",
          text: "هذا تعليق العميل",
          author_id: "customer-1",
          created_at: "2026-01-05T10:00:00.000Z",
          conversation_id: "our-post-999",
          referenced_tweets: [{ type: "replied_to", id: "our-post-999" }]
        }
      ],
      includes: { users: [{ id: "customer-1", username: "customer_handle" }] }
    });

    const { POST } = await import("../app/api/x/webhook/route");
    const response = await POST(
      new NextRequest(`http://localhost/api/x/webhook?tenant=${TENANT_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-twitter-webhooks-signature": signature },
        body: raw
      })
    );

    expect(response.status).toBe(200);

    const { prisma } = await import("../lib/prisma");
    const message = await prisma.message.findFirst({ where: { sourceType: "x_post", text: { contains: "هذا تعليق العميل" } } });
    // The reply target must be the customer's own comment (comment-123), not
    // the post it replied to (our-post-999) - replying to the parent instead
    // of the actual comment sends the reply to the wrong place on X.
    expect(message?.sourceId).toBe("comment-123");
  });

  it("rejects a webhook call with a bad signature", async () => {
    await seedXIntegration();

    const body = JSON.stringify({ data: [{ id: "x", text: "y", author_id: "z" }] });
    const { POST } = await import("../app/api/x/webhook/route");
    const response = await POST(
      new NextRequest(`http://localhost/api/x/webhook?tenant=${TENANT_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-twitter-webhooks-signature": "sha256=not-valid" },
        body
      })
    );

    expect(response.status).toBe(401);
  });

  it("uses the same conversation grouping key as the mentions poller for the same thread", async () => {
    await seedXIntegration();

    const { raw, signature } = signedBody({
      data: [
        {
          id: "comment-456",
          text: "تعليق ثاني من نفس العميل",
          author_id: "customer-2",
          created_at: "2026-01-05T11:00:00.000Z",
          conversation_id: "our-post-888",
          referenced_tweets: [{ type: "replied_to", id: "our-post-888" }]
        }
      ]
    });

    const { POST } = await import("../app/api/x/webhook/route");
    await POST(
      new NextRequest(`http://localhost/api/x/webhook?tenant=${TENANT_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-twitter-webhooks-signature": signature },
        body: raw
      })
    );

    const { prisma } = await import("../lib/prisma");
    const webhookMessage = await prisma.message.findFirst({ where: { sourceId: "comment-456" } });

    // The polling path (lib/x-public-sync.ts) computes conversation ids from
    // conversationKey `public:${root}:${authorId}` where root is
    // conversation_id/referenced-tweet id. Storing the exact same comment
    // again through that path must land in the same conversation, not a
    // second one, or the customer's thread splits in two depending on which
    // path happened to deliver first.
    const { storeXMessage } = await import("../lib/x-inbox");
    const polled = await storeXMessage({
      tenantId: TENANT_ID,
      xUserId: "customer-2",
      recipientId: "customer-2",
      conversationKey: "public:our-post-888:customer-2",
      text: "تعليق ثاني من نفس العميل",
      direction: "in",
      messageId: "post-comment-456",
      source: { type: "x_post", id: "comment-456" }
    });

    expect(polled.conversationId).toBe(webhookMessage?.conversationId);
  });
});
