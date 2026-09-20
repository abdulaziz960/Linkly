import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-webhook-ssrf-guard.db");
const tenantId = "tenant-webhook-ssrf-guard";

const user = { id: "user-webhook-ssrf-guard", name: "Owner", email: "owner@webhook-ssrf-guard.example", role: "مالك الحساب", tenantId };

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => user)
}));

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("isPubliclyRoutableUrl", () => {
  it("rejects loopback, link-local/cloud-metadata, and private-range IP literals", async () => {
    const { isPubliclyRoutableUrl } = await import("../lib/url-safety");
    expect(await isPubliclyRoutableUrl("http://127.0.0.1/")).toBe(false);
    expect(await isPubliclyRoutableUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(await isPubliclyRoutableUrl("http://10.0.0.5/")).toBe(false);
    expect(await isPubliclyRoutableUrl("http://172.16.0.1/")).toBe(false);
    expect(await isPubliclyRoutableUrl("http://192.168.1.1/")).toBe(false);
    expect(await isPubliclyRoutableUrl("http://localhost:3000/")).toBe(false);
    expect(await isPubliclyRoutableUrl("http://[::1]/")).toBe(false);
    expect(await isPubliclyRoutableUrl("http://[fd00::1]/")).toBe(false);
  });

  it("rejects non-http(s) protocols and malformed URLs", async () => {
    const { isPubliclyRoutableUrl } = await import("../lib/url-safety");
    expect(await isPubliclyRoutableUrl("file:///etc/passwd")).toBe(false);
    expect(await isPubliclyRoutableUrl("not a url")).toBe(false);
  });

  it("accepts a public IP literal", async () => {
    const { isPubliclyRoutableUrl } = await import("../lib/url-safety");
    expect(await isPubliclyRoutableUrl("https://8.8.8.8/webhook")).toBe(true);
  });
});

describe("POST /api/developer/webhooks rejects SSRF-prone URLs", () => {
  it("refuses to register a webhook pointing at the cloud metadata endpoint", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    const { POST } = await import("../app/api/developer/webhooks/route");
    const response = await POST(new NextRequest("http://localhost/api/developer/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://169.254.169.254/computeMetadata/v1/", events: ["message.received"] })
    }));
    expect(response.status).toBe(400);

    const { prisma } = await import("../lib/prisma");
    expect(await prisma.webhook.findFirst({ where: { tenantId } })).toBeNull();
  });

  it("still registers a normal public webhook URL", async () => {
    const { POST } = await import("../app/api/developer/webhooks/route");
    const response = await POST(new NextRequest("http://localhost/api/developer/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://8.8.8.8/webhook", events: ["message.received"] })
    }));
    expect(response.status).toBe(200);
  });
});

describe("triggerWebhookEvent re-validates the URL at delivery time", () => {
  it("never calls fetch for a webhook whose URL is no longer publicly routable (DNS-rebinding style defense)", async () => {
    const rebindTenantId = "tenant-webhook-ssrf-rebind";
    const { prisma } = await import("../lib/prisma");
    const { encryptSecret } = await import("../lib/secret-storage");
    await prisma.webhook.create({
      data: {
        id: "wh-ssrf-rebind",
        tenantId: rebindTenantId,
        // A row that already has a private-IP URL (e.g. registered before
        // this guard existed, or updated at the DNS level after
        // registration) - delivery must still refuse to call it.
        url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        secret: encryptSecret("test-secret"),
        events: JSON.stringify(["message.received"]),
        createdAt: new Date().toISOString(),
        active: 1
      }
    });

    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { triggerWebhookEvent } = await import("../lib/webhooks");
    await triggerWebhookEvent(rebindTenantId, "message.received", { conversationId: "conv-1" });

    expect(fetchMock).not.toHaveBeenCalled();
    const delivery = await prisma.webhookDelivery.findFirst({ where: { webhookId: "wh-ssrf-rebind" } });
    expect(delivery?.success).toBe(0);
  });
});
