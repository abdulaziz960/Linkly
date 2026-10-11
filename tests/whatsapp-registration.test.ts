import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-whatsapp-registration.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

type Call = { url: string; body?: string };

/** A fake Graph API: status lookups and register calls answered from a script. */
function graph(script: { status: string; registerResponses: Array<{ ok: boolean; code?: number }> }) {
  const calls: Call[] = [];
  let registerIndex = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.includes("/register")) {
      const next = script.registerResponses[Math.min(registerIndex, script.registerResponses.length - 1)];
      registerIndex += 1;
      return next.ok ? new Response(JSON.stringify({ success: true })) : new Response(JSON.stringify({ error: { code: next.code, message: "Meta error" } }), { status: 400 });
    }
    return new Response(JSON.stringify({ status: script.status }));
  }));
  return calls;
}

describe("automatic WhatsApp number registration", () => {
  it("does nothing when Meta already shows the number as Connected", async () => {
    const calls = graph({ status: "CONNECTED", registerResponses: [{ ok: true }] });
    const { ensureWhatsAppNumberRegistered } = await import("../lib/whatsapp-registration");
    const state = await ensureWhatsAppNumberRegistered({ tenantId: "t1", phoneNumberId: "111", accessToken: "tok" });
    expect(state.status).toBe("registered");
    expect(calls.some((call) => call.url.includes("/register"))).toBe(false);
  });

  it("registers a Pending number with a random PIN, stores it encrypted and reuses it", async () => {
    const calls = graph({ status: "PENDING", registerResponses: [{ ok: true }] });
    const { ensureWhatsAppNumberRegistered, getRegistrationState } = await import("../lib/whatsapp-registration");
    const first = await ensureWhatsAppNumberRegistered({ tenantId: "t1", phoneNumberId: "222", accessToken: "tok" });
    expect(first.status).toBe("registered");

    const register = calls.filter((call) => call.url.includes("/222/register"));
    expect(register).toHaveLength(1);
    const pin = JSON.parse(register[0].body!).pin as string;
    expect(pin).toMatch(/^\d{6}$/);
    expect(pin).not.toBe("000000");
    expect((await getRegistrationState("222"))?.status).toBe("registered");

    const { prisma } = await import("../lib/prisma");
    const rows = await prisma.$queryRaw<Array<{ pin_encrypted: string }>>`SELECT pin_encrypted FROM whatsapp_number_registrations WHERE phone_number_id = ${"222"}`;
    expect(rows[0].pin_encrypted).not.toContain(pin); // stored encrypted, never in clear

    // A later retry on a still-Pending number reuses the stored PIN rather than inventing another.
    const calls2 = graph({ status: "PENDING", registerResponses: [{ ok: true }] });
    await ensureWhatsAppNumberRegistered({ tenantId: "t1", phoneNumberId: "222", accessToken: "tok" });
    expect(JSON.parse(calls2.find((call) => call.url.includes("/register"))!.body!).pin).toBe(pin);
  });

  it("falls back to the legacy PIN when a number rejects the new one, then asks for the PIN", async () => {
    graph({ status: "PENDING", registerResponses: [{ ok: false, code: 133005 }, { ok: true }] });
    const { ensureWhatsAppNumberRegistered } = await import("../lib/whatsapp-registration");
    expect((await ensureWhatsAppNumberRegistered({ tenantId: "t1", phoneNumberId: "333", accessToken: "tok" })).status).toBe("registered");

    const calls = graph({ status: "PENDING", registerResponses: [{ ok: false, code: 133005 }] });
    const state = await ensureWhatsAppNumberRegistered({ tenantId: "t1", phoneNumberId: "444", accessToken: "tok" });
    expect(state.status).toBe("needs_pin");
    expect(state.message).toContain("رمز تحقق");
    expect(calls.filter((call) => call.url.includes("/444/register"))).toHaveLength(2);
  });

  it("stops at the first non-PIN error and explains it", async () => {
    const waiting = graph({ status: "PENDING", registerResponses: [{ ok: false, code: 133015 }] });
    const { ensureWhatsAppNumberRegistered } = await import("../lib/whatsapp-registration");
    const wait = await ensureWhatsAppNumberRegistered({ tenantId: "t1", phoneNumberId: "555", accessToken: "tok" });
    expect(wait.status).toBe("failed");
    expect(wait.message).toContain("الانتظار");
    expect(waiting.filter((call) => call.url.includes("/register"))).toHaveLength(1);

    graph({ status: "PENDING", registerResponses: [{ ok: false, code: 200 }] });
    const permission = await ensureWhatsAppNumberRegistered({ tenantId: "t1", phoneNumberId: "666", accessToken: "tok" });
    expect(permission.message).toContain("صلاحية");
  });
});
