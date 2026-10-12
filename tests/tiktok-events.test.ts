import { existsSync, unlinkSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-tiktok-events.db");

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

type Sent = { url: string; token: string; body: { event_source: string; event_source_id: string; test_event_code?: string; data: Array<{ event: string; event_id: string; user: { phone: string }; properties: Record<string, unknown> }> } };

function mockTikTok(response: { ok?: boolean; code?: number; message?: string } = {}) {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, token: (init.headers as Record<string, string>)["Access-Token"], body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ code: response.code ?? 0, message: response.message ?? "OK" }), { status: response.ok === false ? 400 : 200 });
  }));
  return sent;
}

async function seedConversation(id: string, tenantId: string, phone = "966500000001") {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  await prisma.customer.create({ data: { id: `cust-${id}`, name: "عميل", phone, initial: "ع", tenantId } });
  await prisma.conversation.create({ data: { id, customerId: `cust-${id}`, channel: "whatsapp", lastMessage: "مرحبا", status: "assigned", assignee: "موظف", tenantId } });
}

describe("TikTok Ads lead-status events", () => {
  it("validates settings and never returns the token", async () => {
    const { cleanSettingsInput, saveTikTokAdsSettings, getTikTokAdsSettings } = await import("../lib/tiktok-events");
    expect(cleanSettingsInput({ eventSetId: "bad id!" }).ok).toBe(false);
    expect(cleanSettingsInput({ accessToken: "short" }).ok).toBe(false);
    expect(cleanSettingsInput({ eventSource: "nonsense" }).ok).toBe(false);
    expect(cleanSettingsInput({ mapping: { "مؤهل": "بالعربي" } }).ok).toBe(false);

    const cleaned = cleanSettingsInput({ eventSetId: "CTM12345", accessToken: "tok_" + "x".repeat(20), enabled: true, sendAll: true, mapping: { "مهتم": "Lead", "مؤهل": "" } });
    if (!cleaned.ok) throw new Error(cleaned.error);
    const saved = await saveTikTokAdsSettings("ten-a", cleaned.data);
    expect(saved).toMatchObject({ eventSetId: "CTM12345", hasToken: true, enabled: true });
    expect(saved.mapping["مهتم"]).toBe("Lead");
    expect(saved.mapping["فاز"]).toBe("Purchase"); // untouched statuses keep their default
    expect(JSON.stringify(saved)).not.toContain("tok_");

    // A later save without a token keeps the stored one; enabling without a token is refused.
    expect((await saveTikTokAdsSettings("ten-a", { eventSetId: "CTM12345" })).hasToken).toBe(true);
    expect((await saveTikTokAdsSettings("ten-empty", { enabled: true })).enabled).toBe(false);
    expect((await getTikTokAdsSettings("ten-other")).hasToken).toBe(false); // per workspace
  });

  it("sends the mapped event with a hashed phone, once per status", async () => {
    await seedConversation("conv-1", "ten-a", "+966 50 000 0001");
    const sent = mockTikTok();
    const { setLeadStatus, recentEvents } = await import("../lib/tiktok-events");

    const interested = await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-1", status: "مهتم", actor: "موظف" });
    expect(interested).toMatchObject({ ok: true, status: "مهتم", event: { sent: true, ok: true, eventName: "Lead" } });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://business-api.tiktok.com/open_api/v1.3/event/track/");
    expect(sent[0].token).toContain("tok_");
    expect(sent[0].body.event_source_id).toBe("CTM12345");
    expect(sent[0].body.data[0].user.phone).toBe(createHash("sha256").update("+966500000001").digest("hex"));
    expect(sent[0].body.data[0].properties.lead_status).toBe("مهتم");

    // "مؤهل" is mapped to "" here, so nothing goes out.
    const qualified = await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-1", status: "مؤهل", actor: "موظف" });
    expect(qualified).toMatchObject({ ok: true, event: { sent: false, skipped: "no-mapping" } });

    // Going back to "مهتم" later does not count the lead twice.
    await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-1", status: "جديد", actor: "موظف" });
    const again = await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-1", status: "مهتم", actor: "موظف" });
    expect(again).toMatchObject({ ok: true, event: { sent: false, skipped: "duplicate" } });
    expect(sent).toHaveLength(1);

    const log = await recentEvents("ten-a");
    expect(log[0]).toMatchObject({ event_name: "Lead", ok: 1 });
  });

  it("keeps the status when TikTok rejects the event, and logs the failure", async () => {
    await seedConversation("conv-2", "ten-a");
    mockTikTok({ code: 40002, message: "Invalid event set" });
    const { setLeadStatus, getLeadStatus, recentEvents } = await import("../lib/tiktok-events");
    const result = await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-2", status: "فاز", actor: "موظف" });
    expect(result).toMatchObject({ ok: true, status: "فاز", event: { sent: true, ok: false, eventName: "Purchase" } });
    expect(await getLeadStatus("ten-a", "conv-2")).toBe("فاز");
    expect((await recentEvents("ten-a"))[0]).toMatchObject({ ok: 0 });
  });

  it("refuses statuses it does not know and conversations of other workspaces", async () => {
    const sent = mockTikTok();
    const { setLeadStatus } = await import("../lib/tiktok-events");
    expect(await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-1", status: "غريب", actor: "x" })).toMatchObject({ ok: false, code: 400 });
    expect(await setLeadStatus({ tenantId: "ten-b", conversationId: "conv-1", status: "مهتم", actor: "x" })).toMatchObject({ ok: false, code: 404 });
    expect(sent).toHaveLength(0);
  });

  it("does not send anything while disabled, and sends a test event with the test code", async () => {
    await seedConversation("conv-3", "ten-off");
    const sent = mockTikTok();
    const { setLeadStatus, saveTikTokAdsSettings, sendTestEvent } = await import("../lib/tiktok-events");
    expect(await setLeadStatus({ tenantId: "ten-off", conversationId: "conv-3", status: "مؤهل", actor: "x" })).toMatchObject({ ok: true, event: { sent: false, skipped: "disabled" } });

    await saveTikTokAdsSettings("ten-a", { testEventCode: "TEST999" });
    const test = await sendTestEvent("ten-a");
    expect(test.ok).toBe(true);
    expect(sent.at(-1)?.body.test_event_code).toBe("TEST999");
    expect(await sendTestEvent("ten-off")).toMatchObject({ ok: false });
  });

  it("sends the deal value and currency with the event, and keeps it on the conversation", async () => {
    await seedConversation("conv-6", "ten-a");
    const sent = mockTikTok();
    const { setLeadStatus, getDealValue } = await import("../lib/tiktok-events");
    expect(await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-6", status: "فاز", dealValue: "1250.5", actor: "x" })).toMatchObject({ ok: true, event: { sent: true, ok: true } });
    expect(sent[0].body.data[0].properties).toMatchObject({ value: 1250.5, currency: "SAR", lead_status: "فاز" });
    expect(await getDealValue("ten-a", "conv-6")).toBe(1250.5);
    expect(await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-6", status: "مؤهل", dealValue: "abc", actor: "x" })).toMatchObject({ ok: false, code: 400 });
    expect(await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-6", status: "مؤهل", dealValue: -5, actor: "x" })).toMatchObject({ ok: false, code: 400 });
  });

  it("omits value and currency when there is no deal value", async () => {
    await seedConversation("conv-7", "ten-a");
    const sent = mockTikTok();
    const { setLeadStatus } = await import("../lib/tiktok-events");
    await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-7", status: "فاز", actor: "x" });
    expect(sent[0].body.data[0].properties).toEqual({ lead_status: "فاز" });
  });

  it("sends the page for Pixel (web) events and explains an event_source_id rejection", async () => {
    await seedConversation("conv-5", "ten-web");
    const { saveTikTokAdsSettings, setLeadStatus, sendTestEvent } = await import("../lib/tiktok-events");
    await saveTikTokAdsSettings("ten-web", { eventSetId: "DB5QHHRC77U074LG3TQG", accessToken: "tok_" + "y".repeat(20), eventSource: "web", enabled: true, sendAll: true });
    const sent = mockTikTok();
    await setLeadStatus({ tenantId: "ten-web", conversationId: "conv-5", status: "فاز", actor: "x" });
    expect(sent[0].body.event_source).toBe("web");
    expect((sent[0].body.data[0] as unknown as { page: { url: string } }).page.url).toBe("https://linklysa.io");

    mockTikTok({ code: 40002, message: "Invalid value for event_source_id: not a valid string" });
    const rejected = await sendTestEvent("ten-web");
    expect(rejected.ok).toBe(false);
    expect(rejected.message).toContain("نوع المصدر");
  });

  it("honours a local mock endpoint through TIKTOK_EVENTS_URL", async () => {
    await seedConversation("conv-4", "ten-a");
    vi.stubEnv("TIKTOK_EVENTS_URL", "http://localhost:4010/track");
    const sent = mockTikTok();
    const { setLeadStatus } = await import("../lib/tiktok-events");
    await setLeadStatus({ tenantId: "ten-a", conversationId: "conv-4", status: "فاز", actor: "x" });
    expect(sent[0].url).toBe("http://localhost:4010/track");
    vi.unstubAllEnvs();
  });
});

describe("TikTok: ad conversations only by default", () => {
  it("skips a conversation that did not come from an ad, unless send-all is on", async () => {
    await seedConversation("conv-ad-0", "ten-adonly", "966500000555");
    await seedConversation("conv-ad-1", "ten-adonly", "966500000556");
    const { prisma } = await import("../lib/prisma");
    const { captureAdSource } = await import("../lib/ad-source");
    await captureAdSource({ tenantId: "ten-adonly", conversationId: "conv-ad-1", message: { type: "text", text: { body: "hi" }, referral: { source_url: "https://www.tiktok.com/@brand/video/7380000000000000?ttclid=E.C.P.adonly1" } } });
    const { saveTikTokAdsSettings, getTikTokAdsSettings, notifyStageChange } = await import("../lib/tiktok-events");
    await saveTikTokAdsSettings("ten-adonly", { eventSetId: "DB5QHHRC77U074LG3TQG", accessToken: "tok_" + "a".repeat(20), eventSource: "web", enabled: true });
    expect((await getTikTokAdsSettings("ten-adonly")).sendAll).toBe(false);
    const sent = mockTikTok();

    expect(await notifyStageChange({ tenantId: "ten-adonly", conversationId: "conv-ad-0", stage: "مؤهل", previousStage: "جديد", phone: "966500000555" })).toMatchObject({ sent: false, skipped: "not-from-ad" });
    expect(sent).toHaveLength(0);
    const fromAd = await notifyStageChange({ tenantId: "ten-adonly", conversationId: "conv-ad-1", stage: "مؤهل", previousStage: "جديد", phone: "966500000556" });
    expect(fromAd).toMatchObject({ sent: true, ok: true });
    expect(sent[0].body.data[0].user).toMatchObject({ ttclid: "E.C.P.adonly1" });

    await saveTikTokAdsSettings("ten-adonly", { sendAll: true });
    expect(await notifyStageChange({ tenantId: "ten-adonly", conversationId: "conv-ad-0", stage: "مؤهل", previousStage: "جديد", phone: "966500000555" })).toMatchObject({ sent: true, ok: true });
    void prisma;
  });
});
