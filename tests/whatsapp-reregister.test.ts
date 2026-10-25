import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-whatsapp-reregister.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("applying an approved display name", () => {
  it("registers the number again even though it is already Connected (Meta applies the new name only then)", async () => {
    const { reRegisterWhatsAppNumber, ensureWhatsAppNumberRegistered } = await import("../lib/whatsapp-registration");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url).replace("https://graph.facebook.com/v22.0", "")}`);
      if (String(url).includes("?fields=status")) return json({ status: "CONNECTED" });
      return json({ success: true });
    }));

    // the ordinary check stops at Connected and never registers...
    expect((await ensureWhatsAppNumberRegistered({ tenantId: "t1", phoneNumberId: "pn-1", accessToken: "tok" })).status).toBe("registered");
    expect(calls.some((call) => call.includes("/register"))).toBe(false);

    // ...the re-registration always does
    const result = await reRegisterWhatsAppNumber({ tenantId: "t1", phoneNumberId: "pn-1", accessToken: "tok" });
    expect(result.status).toBe("registered");
    expect(calls.filter((call) => call.includes("/register"))).toEqual(["POST /pn-1/register"]);
  });

  it("asks for the two-step PIN when Meta wants one, then uses the PIN the owner typed", async () => {
    const { reRegisterWhatsAppNumber } = await import("../lib/whatsapp-registration");
    const pins: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const pin = JSON.parse(String(init?.body ?? "{}")).pin as string;
      pins.push(pin);
      return pin === "123456" ? json({ success: true }) : json({ error: { code: 133005, message: "Two step verification PIN Mismatch" } }, 400);
    }));
    const first = await reRegisterWhatsAppNumber({ tenantId: "t2", phoneNumberId: "pn-2", accessToken: "tok" });
    expect(first.status).toBe("needs_pin");
    expect(pins).toEqual(["000000"]);

    pins.length = 0;
    const second = await reRegisterWhatsAppNumber({ tenantId: "t2", phoneNumberId: "pn-2", accessToken: "tok", pin: "123456" });
    expect(second.status).toBe("registered");
    expect(pins[0]).toBe("123456");
  });
});
