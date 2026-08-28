import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("OAuth state protection", () => {
  it("accepts an untampered state for the matching nonce and rejects replay/tampering", async () => {
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
    const { createOAuthState, verifyOAuthState } = await import("../lib/oauth-state");

    const issued = createOAuthState("meta", { channel: "instagram" });
    expect(verifyOAuthState(issued.state, "meta", issued.nonce)).toEqual({ channel: "instagram" });
    expect(verifyOAuthState(issued.state, "meta", "wrong-nonce")).toBeNull();
    expect(verifyOAuthState(`${issued.state.slice(0, -1)}x`, "meta", issued.nonce)).toBeNull();
  });
});

describe("trusted proxy rate-limit identity", () => {
  it("does not trust spoofable forwarded headers unless the deployment opts in", async () => {
    const { getClientIp } = await import("../lib/rate-limit");
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.10" }
    });

    expect(getClientIp(request)).toBe("unknown");
  });

  it("uses Vercel-controlled forwarding headers on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    const { getClientIp } = await import("../lib/rate-limit");
    const request = new Request("http://localhost", {
      headers: {
        "x-vercel-forwarded-for": "198.51.100.20",
        "x-forwarded-for": "203.0.113.10"
      }
    });

    expect(getClientIp(request)).toBe("198.51.100.20");
  });
});

describe("Telegram webhook hardening", () => {
  it("rejects production webhooks when no tenant secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("../lib/database", () => ({
      getIntegrationSettings: vi.fn(async () => ({ verifyToken: "" }))
    }));
    vi.doMock("../lib/telegram-inbox", () => ({
      storeTelegramMessage: vi.fn()
    }));
    vi.doMock("../lib/bot-engine", () => ({
      runTelegramBot: vi.fn()
    }));

    const { POST } = await import("../app/api/telegram/webhook/route");
    const response = await POST(new NextRequest("http://localhost/api/telegram/webhook?tenant=tenant-a", {
      method: "POST",
      body: JSON.stringify({ update_id: 1, message: { chat: { id: 1 }, text: "hi" } })
    }));

    expect(response.status).toBe(401);
  });

  it("accepts only the exact configured Telegram secret", async () => {
    vi.doMock("../lib/database", () => ({
      getIntegrationSettings: vi.fn(async () => ({ verifyToken: "telegram-secret" }))
    }));
    const storeTelegramMessage = vi.fn(async () => ({ conversationId: "conv-1" }));
    vi.doMock("../lib/telegram-inbox", () => ({ storeTelegramMessage }));
    vi.doMock("../lib/bot-engine", () => ({
      runTelegramBot: vi.fn()
    }));

    const { POST } = await import("../app/api/telegram/webhook/route");
    const rejected = await POST(new NextRequest("http://localhost/api/telegram/webhook?tenant=tenant-a", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "wrong" },
      body: JSON.stringify({ update_id: 1, message: { chat: { id: 1 }, text: "hi" } })
    }));
    const accepted = await POST(new NextRequest("http://localhost/api/telegram/webhook?tenant=tenant-a", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "telegram-secret" },
      body: JSON.stringify({ update_id: 2, message: { chat: { id: 1 }, text: "hi" } })
    }));

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect(storeTelegramMessage).toHaveBeenCalledOnce();
  });
});

describe("Meta webhook status isolation", () => {
  it("keeps provider signature verification timing-safe", async () => {
    const { verifyPrefixedHmac } = await import("../lib/webhook-security");
    const payload = JSON.stringify({ entry: [] });
    const signature = `sha256=${createHmac("sha256", "meta-secret").update(payload).digest("hex")}`;

    expect(verifyPrefixedHmac(payload, signature, ["meta-secret"], "hex")).toBe(true);
    expect(verifyPrefixedHmac(payload, signature, [""], "hex")).toBe(false);
  });
});
