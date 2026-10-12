import { existsSync, unlinkSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-meta-events.db");

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

type Sent = { url: string; body: { test_event_code?: string; data: Array<{ event_name: string; event_id: string; action_source: string; messaging_channel: string; user_data: Record<string, string>; custom_data?: { value: number; currency: string } }> } };

function mockMeta(response: { ok?: boolean; received?: number; message?: string; code?: number } = {}) {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: URL | string, init: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
    const ok = response.ok !== false;
    return new Response(JSON.stringify(ok ? { events_received: response.received ?? 1 } : { error: { message: response.message ?? "bad", code: response.code ?? 100 } }), { status: ok ? 200 : 400 });
  }));
  return sent;
}

async function seedConversation(id: string, tenantId: string, opts: { clickId?: string; waba?: string } = {}) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  const { captureAdSource } = await import("../lib/ad-source");
  await ensureSchema();
  await prisma.customer.create({ data: { id: `cust-${id}`, name: "عميل", phone: "966500000009", initial: "ع", tenantId } });
  await prisma.conversation.create({ data: { id, customerId: `cust-${id}`, channel: "whatsapp", lastMessage: "مرحبا", status: "assigned", assignee: "موظف", tenantId } });
  if (opts.waba) {
    await prisma.integrationSetting.create({ data: {
      id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected", businessName: "B", wabaName: "B",
      phoneNumber: "966555000000", phoneNumberId: "pn", wabaId: opts.waba, appId: "", verifyToken: "", accessToken: "", webhookUrl: "", updatedAt: new Date().toISOString()
    } }).catch(() => undefined);
  }
  if (opts.clickId) await captureAdSource({ tenantId, conversationId: id, message: { type: "text", text: { body: "hi" }, referral: { source_type: "ad", source_id: "123", ctwa_clid: opts.clickId } } });
}

describe("Meta Ads stage events", () => {
  it("validates settings and never returns the token", async () => {
    const { cleanMetaSettingsInput, saveMetaAdsSettings, getMetaAdsSettings } = await import("../lib/meta-events");
    expect(cleanMetaSettingsInput({ datasetId: "abc" }).ok).toBe(false);
    expect(cleanMetaSettingsInput({ accessToken: "short" }).ok).toBe(false);
    expect(cleanMetaSettingsInput({ mapping: { "مؤهل": "بالعربي" } }).ok).toBe(false);

    const cleaned = cleanMetaSettingsInput({ datasetId: "1234567890123", accessToken: "EAAB" + "x".repeat(30), enabled: true, adAccountId: "act_555555" });
    if (!cleaned.ok) throw new Error(cleaned.error);
    expect(cleaned.data.adAccountId).toBe("555555");
    const saved = await saveMetaAdsSettings("ten-m", cleaned.data);
    expect(saved).toMatchObject({ datasetId: "1234567890123", hasToken: true, enabled: true, tokenKind: "manual" });
    expect(JSON.stringify(saved)).not.toContain("EAAB");
    expect((await saveMetaAdsSettings("ten-empty", { enabled: true })).enabled).toBe(false);
    expect((await getMetaAdsSettings("ten-other")).hasToken).toBe(false);
  });

  it("builds a business-messaging payload with the click id and the deal value", async () => {
    const { buildMetaPayload } = await import("../lib/meta-events");
    const payload = buildMetaPayload({ eventName: "Purchase", eventId: "e1", wabaId: "999", clickId: "click-1", dealValue: 7200.456, testEventCode: "TEST1" });
    expect(payload.test_event_code).toBe("TEST1");
    expect(payload.data[0]).toMatchObject({ event_name: "Purchase", action_source: "business_messaging", messaging_channel: "whatsapp", user_data: { whatsapp_business_account_id: "999", ctwa_clid: "click-1" }, custom_data: { value: 7200.46, currency: "SAR" } });
    expect(buildMetaPayload({ eventName: "Lead", eventId: "e2", wabaId: "1", clickId: "c" }).data[0]).not.toHaveProperty("custom_data");
  });

  it("sends once per stage for an ad conversation, and skips ones without a click id", async () => {
    await seedConversation("conv-m1", "ten-send", { clickId: "ctwa-abc", waba: "waba-1" });
    await seedConversation("conv-m2", "ten-send", {});
    const { saveMetaAdsSettings, notifyMetaStageChange, recentMetaEvents } = await import("../lib/meta-events");
    await saveMetaAdsSettings("ten-send", { datasetId: "9876543210", accessToken: "EAAB" + "y".repeat(30), enabled: true });
    const sent = mockMeta();

    const first = await notifyMetaStageChange({ tenantId: "ten-send", conversationId: "conv-m1", stage: "مؤهل", previousStage: "جديد" });
    expect(first).toMatchObject({ sent: true, ok: true, eventName: "Lead" });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toContain("/9876543210/events");
    const sha = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(sent[0].body.data[0].user_data).toMatchObject({ whatsapp_business_account_id: "waba-1", ctwa_clid: "ctwa-abc", ph: [sha("966500000009")] });
    expect(sent[0].body.data[0].user_data).not.toHaveProperty("em"); // no email was given

    expect(await notifyMetaStageChange({ tenantId: "ten-send", conversationId: "conv-m1", stage: "مؤهل", previousStage: "جديد" })).toMatchObject({ sent: false, skipped: "duplicate" });
    expect(await notifyMetaStageChange({ tenantId: "ten-send", conversationId: "conv-m1", stage: "مهتم", previousStage: "جديد" })).toMatchObject({ sent: false, skipped: "no-mapping" });
    expect(await notifyMetaStageChange({ tenantId: "ten-send", conversationId: "conv-m2", stage: "مؤهل", previousStage: "جديد" })).toMatchObject({ sent: false, skipped: "no-click-id" });
    expect(sent).toHaveLength(1);

    const sold = await notifyMetaStageChange({ tenantId: "ten-send", conversationId: "conv-m1", stage: "فاز", previousStage: "مؤهل", dealValue: 5000 });
    expect(sold).toMatchObject({ sent: true, eventName: "Purchase" });
    expect(sent[1].body.data[0].custom_data).toEqual({ value: 5000, currency: "SAR" });
    expect((await recentMetaEvents("ten-send")).map((row) => row.event_name).sort()).toEqual(["Lead", "Purchase"]);
  });

  it("adds the hashed email and names when the customer typed them in a form", async () => {
    await seedConversation("conv-m5", "ten-email", { clickId: "ctwa-email", waba: "waba-5" });
    const { prisma } = await import("../lib/prisma");
    await prisma.lead.create({ data: { id: "lead-m5", tenantId: "ten-email", customerId: "cust-conv-m5", conversationId: "conv-m5", source: "meta", name: "ماجد الدوسري", phone: "966500000009", email: " Majed@Example.com ", createdAt: new Date().toISOString() } });
    const { saveMetaAdsSettings, notifyMetaStageChange } = await import("../lib/meta-events");
    await saveMetaAdsSettings("ten-email", { datasetId: "5555555555", accessToken: "EAAB" + "e".repeat(30), enabled: true });
    const sent = mockMeta();
    await notifyMetaStageChange({ tenantId: "ten-email", conversationId: "conv-m5", stage: "مؤهل", previousStage: "جديد" });
    const sha = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(sent[0].body.data[0].user_data).toMatchObject({ em: [sha("majed@example.com")], fn: [sha("ماجد")], ln: [sha("الدوسري")] });
  });

  it("logs a rejection with a readable reason and does not throw", async () => {
    await seedConversation("conv-m3", "ten-fail", { clickId: "ctwa-zzz", waba: "waba-2" });
    const { saveMetaAdsSettings, notifyMetaStageChange } = await import("../lib/meta-events");
    await saveMetaAdsSettings("ten-fail", { datasetId: "1111111111", accessToken: "EAAB" + "z".repeat(30), enabled: true });
    mockMeta({ ok: false, message: "Session has expired", code: 190 });
    const result = await notifyMetaStageChange({ tenantId: "ten-fail", conversationId: "conv-m3", stage: "مؤهل", previousStage: "جديد" });
    expect(result).toMatchObject({ sent: true, ok: false });
    expect(result.message).toContain("انتهت صلاحية");
  });

  it("does nothing while disabled", async () => {
    await seedConversation("conv-m4", "ten-off", { clickId: "c4", waba: "waba-3" });
    const { saveMetaAdsSettings, notifyMetaStageChange } = await import("../lib/meta-events");
    await saveMetaAdsSettings("ten-off", { datasetId: "2222222222", accessToken: "EAAB" + "q".repeat(30), enabled: false });
    const sent = mockMeta();
    expect(await notifyMetaStageChange({ tenantId: "ten-off", conversationId: "conv-m4", stage: "مؤهل", previousStage: "جديد" })).toMatchObject({ sent: false, skipped: "disabled" });
    expect(sent).toHaveLength(0);
  });
});
