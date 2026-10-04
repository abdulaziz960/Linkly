import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-whatsapp-diagnose.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("WHATSAPP_META_APP_SECRET", "app-secret");
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

async function connect(tenantId: string) {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const now = new Date().toISOString();
  await prisma.integrationSetting.create({ data: { id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected", businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "phone-1", wabaId: "waba-1", appId: "", configId: "", verifyToken: "v", accessToken: "tok", webhookUrl: "", updatedAt: now } as never });
}

function mockGraph(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url).replace("https://graph.facebook.com/v22.0", "").split("?")[0];
    const hit = Object.keys(routes).find((key) => path.startsWith(key));
    const body = hit ? routes[hit] : { error: { message: "unknown route" } };
    return new Response(JSON.stringify(body), { status: (body as { error?: unknown }).error ? 400 : 200 });
  }));
}

describe("WhatsApp connection check", () => {
  it("names the real cause of #200: the token isn't authorised on the saved business account", async () => {
    await connect("tenant-diag-bad");
    mockGraph({
      "/debug_token": { data: { is_valid: true, scopes: ["whatsapp_business_messaging", "whatsapp_business_management"], granular_scopes: [{ scope: "whatsapp_business_messaging", target_ids: ["waba-OTHER"] }] } },
      "/waba-1/phone_numbers": { error: { code: 200, message: "permission" } },
      "/waba-1/subscribed_apps": { data: [] }
    });
    const { diagnoseWhatsApp } = await import("../lib/whatsapp-diagnose");
    const result = await diagnoseWhatsApp("tenant-diag-bad");
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === "target")?.status).toBe("fail");
    expect(result.checks.find((check) => check.id === "numbers")?.status).toBe("fail");
    expect(result.advice).toContain("أعد ربط واتساب");
  });

  it("passes a healthy connection", async () => {
    await connect("tenant-diag-ok");
    mockGraph({
      "/debug_token": { data: { is_valid: true, scopes: ["whatsapp_business_messaging", "whatsapp_business_management"], granular_scopes: [{ scope: "whatsapp_business_messaging", target_ids: ["waba-1"] }] } },
      "/waba-1/phone_numbers": { data: [{ id: "phone-1", display_phone_number: "+966 50 000 0000" }] },
      "/waba-1/subscribed_apps": { data: [{ whatsapp_business_api_data: { id: "1296230909161568" } }] }
    });
    const { diagnoseWhatsApp } = await import("../lib/whatsapp-diagnose");
    const result = await diagnoseWhatsApp("tenant-diag-ok");
    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.status === "ok")).toBe(true);
  });

  it("reports missing data when WhatsApp isn't connected", async () => {
    const { diagnoseWhatsApp } = await import("../lib/whatsapp-diagnose");
    const result = await diagnoseWhatsApp("tenant-diag-none");
    expect(result.ok).toBe(false);
    expect(result.checks[0].id).toBe("saved");
  });
});
