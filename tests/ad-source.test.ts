import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-ad-source.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
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

describe("ad source of a conversation", () => {
  it("reads a Meta click-to-WhatsApp referral", async () => {
    const { extractAdSource } = await import("../lib/ad-source");
    const source = extractAdSource({ referral: { source_url: "https://fb.me/abc", source_id: "1203", source_type: "ad", headline: "خصم 20٪", ctwa_clid: "AfXYZ123" } });
    expect(source).toMatchObject({ platform: "meta", adId: "1203", headline: "خصم 20٪", clickId: "AfXYZ123", matchedBy: "referral" });
  });

  it("finds a TikTok click id in the referral URL or in the message text", async () => {
    const { extractAdSource } = await import("../lib/ad-source");
    expect(extractAdSource({ referral: { source_url: "https://www.tiktok.com/ad?ttclid=E.C.P.AAAA1111" } })).toMatchObject({ platform: "tiktok", clickId: "E.C.P.AAAA1111", matchedBy: "referral.source_url" });
    expect(extractAdSource({ text: { body: "مرحبا ttclid_ref https://x.sa/?ttclid=ABCDEF123456" } })).toMatchObject({ platform: "tiktok", clickId: "ABCDEF123456", matchedBy: "text" });
  });

  it("returns nothing for a plain message and keeps unknown referrals raw", async () => {
    const { extractAdSource } = await import("../lib/ad-source");
    expect(extractAdSource({ text: { body: "السلام عليكم" } })).toBeNull();
    const unknown = extractAdSource({ referral: { foo: "bar" } });
    expect(unknown?.platform).toBe("unknown");
    expect(unknown?.raw).toContain("foo");
  });

  it("stores the first source once, fills in a missing click id later, and is tenant-scoped", async () => {
    const { captureAdSource, getAdSource } = await import("../lib/ad-source");
    await captureAdSource({ tenantId: "ten-1", conversationId: "c-1", message: { referral: { source_url: "https://tiktok.com/x", source_id: "AD9" } } });
    expect(await getAdSource("ten-1", "c-1")).toMatchObject({ platform: "tiktok", adId: "AD9", clickId: "" });

    await captureAdSource({ tenantId: "ten-1", conversationId: "c-1", message: { referral: { source_url: "https://tiktok.com/x?ttclid=CLICK123456" } } });
    expect(await getAdSource("ten-1", "c-1")).toMatchObject({ adId: "AD9", clickId: "CLICK123456" }); // first ad id kept

    await captureAdSource({ tenantId: "ten-1", conversationId: "c-2", message: { text: { body: "no ad" } } });
    expect(await getAdSource("ten-1", "c-2")).toBeNull();
    expect(await getAdSource("ten-other", "c-1")).toBeNull();
  });

  it("attaches the TikTok click id to the lead-status event", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    await prisma.customer.create({ data: { id: "cust-tt", name: "عميل", phone: "966500009999", initial: "ع", tenantId: "ten-tt" } });
    await prisma.conversation.create({ data: { id: "conv-tt", customerId: "cust-tt", channel: "whatsapp", lastMessage: "x", status: "assigned", assignee: "موظف", tenantId: "ten-tt" } });
    const { captureAdSource } = await import("../lib/ad-source");
    await captureAdSource({ tenantId: "ten-tt", conversationId: "conv-tt", message: { referral: { source_url: "https://tiktok.com/x?ttclid=CLICKABC123" } } });

    const { saveTikTokAdsSettings, setLeadStatus } = await import("../lib/tiktok-events");
    await saveTikTokAdsSettings("ten-tt", { eventSetId: "CTM12345", accessToken: "tok_" + "z".repeat(20), enabled: true });
    const bodies: Array<{ data: Array<{ user: { ttclid?: string; phone: string } }> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ code: 0 }));
    }));
    await setLeadStatus({ tenantId: "ten-tt", conversationId: "conv-tt", status: "فاز", actor: "x" });
    expect(bodies[0].data[0].user.ttclid).toBe("CLICKABC123");
    expect(bodies[0].data[0].user.phone).toMatch(/^[0-9a-f]{64}$/);
  });
});
