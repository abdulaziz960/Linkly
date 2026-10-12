import { existsSync, unlinkSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-snap-events.db");

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

type Sent = { url: string; body: { data: Array<{ event_name: string; action_source: string; user_data: { ph: string[]; em?: string[]; fn?: string[]; ln?: string[]; sc_click_id?: string }; custom_data?: { value: number; currency: string } }> } };

function mockSnap(response: { ok?: boolean; reason?: string } = {}) {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: URL | string, init: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return response.ok === false
      ? new Response(JSON.stringify({ status: "FAILED", reason: response.reason ?? "bad" }), { status: 400 })
      : new Response(JSON.stringify({ status: "SUCCESS", num_events_received: 1 }), { status: 200 });
  }));
  return sent;
}

async function seedConversation(id: string, tenantId: string, clickText?: string) {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  const { captureAdSource } = await import("../lib/ad-source");
  await ensureSchema();
  await prisma.customer.create({ data: { id: `cust-${id}`, name: "عميل", phone: "966500000123", initial: "ع", tenantId } });
  await prisma.conversation.create({ data: { id, customerId: `cust-${id}`, channel: "whatsapp", lastMessage: "مرحبا", status: "assigned", assignee: "موظف", tenantId } });
  if (clickText) await captureAdSource({ tenantId, conversationId: id, message: { type: "text", text: { body: clickText } } });
}

describe("Snapchat Ads stage events", () => {
  it("validates settings and never returns the token", async () => {
    const { cleanSnapSettingsInput, saveSnapAdsSettings, getSnapAdsSettings } = await import("../lib/snap-events");
    expect(cleanSnapSettingsInput({ pixelId: "bad id!" }).ok).toBe(false);
    expect(cleanSnapSettingsInput({ accessToken: "short" }).ok).toBe(false);
    expect(cleanSnapSettingsInput({ actionSource: "nope" }).ok).toBe(false);
    expect(cleanSnapSettingsInput({ mapping: { "مؤهل": "بالعربي" } }).ok).toBe(false);

    const cleaned = cleanSnapSettingsInput({ pixelId: "12345678-aaaa-bbbb-cccc-1234567890ab", accessToken: "snaptoken" + "x".repeat(30), enabled: true, mapping: { "مهتم": "save" } });
    if (!cleaned.ok) throw new Error(cleaned.error);
    const saved = await saveSnapAdsSettings("ten-s", cleaned.data);
    expect(saved).toMatchObject({ hasToken: true, enabled: true, actionSource: "WEB" });
    expect(saved.mapping["مهتم"]).toBe("SAVE"); // upper-cased
    expect(saved.mapping["فاز"]).toBe("PURCHASE");
    expect(JSON.stringify(saved)).not.toContain("snaptoken");
    expect((await saveSnapAdsSettings("ten-empty", { enabled: true })).enabled).toBe(false);
    expect((await getSnapAdsSettings("ten-other")).hasToken).toBe(false);
  });

  it("hashes the phone as digits only and adds the click id and value", async () => {
    const { buildSnapPayload, hashSnapPhone } = await import("../lib/snap-events");
    expect(hashSnapPhone("+966 50 000 0123")).toBe(createHash("sha256").update("966500000123").digest("hex"));
    const body = buildSnapPayload({ eventName: "PURCHASE", phone: "966500000123", clickId: "ScClick-123456", actionSource: "WEB", dealValue: 900.126 });
    expect(body.data[0]).toMatchObject({ event_name: "PURCHASE", action_source: "WEB", user_data: { sc_click_id: "ScClick-123456" }, custom_data: { value: 900.13, currency: "SAR" } });
    expect(buildSnapPayload({ eventName: "SIGN_UP", phone: "966500000123", actionSource: "OFFLINE" }).data[0]).not.toHaveProperty("event_source_url");
  });

  it("captures ScCid from a link and sends once per stage", async () => {
    await seedConversation("conv-s1", "ten-send", "حياكم https://example.com/offer?ScCid=ab12CD34ef56");
    const { saveSnapAdsSettings, notifySnapStageChange, recentSnapEvents } = await import("../lib/snap-events");
    await saveSnapAdsSettings("ten-send", { pixelId: "98765432-aaaa-bbbb-cccc-1234567890ab", accessToken: "snaptoken" + "y".repeat(30), enabled: true });
    const sent = mockSnap();

    const first = await notifySnapStageChange({ tenantId: "ten-send", conversationId: "conv-s1", stage: "مؤهل", previousStage: "جديد", phone: "966500000123" });
    expect(first).toMatchObject({ sent: true, ok: true, eventName: "SIGN_UP" });
    expect(sent[0].url).toContain("/98765432-aaaa-bbbb-cccc-1234567890ab/events");
    expect(sent[0].body.data[0].user_data.sc_click_id).toBe("ab12CD34ef56");

    expect(await notifySnapStageChange({ tenantId: "ten-send", conversationId: "conv-s1", stage: "مؤهل", previousStage: "جديد", phone: "966500000123" })).toMatchObject({ sent: false, skipped: "duplicate" });
    expect(await notifySnapStageChange({ tenantId: "ten-send", conversationId: "conv-s1", stage: "مهتم", previousStage: "جديد", phone: "966500000123" })).toMatchObject({ sent: false, skipped: "no-mapping" });
    const sold = await notifySnapStageChange({ tenantId: "ten-send", conversationId: "conv-s1", stage: "فاز", previousStage: "مؤهل", phone: "966500000123", dealValue: 4000 });
    expect(sold).toMatchObject({ sent: true, eventName: "PURCHASE" });
    expect(sent[1].body.data[0].custom_data).toEqual({ value: 4000, currency: "SAR" });
    expect((await recentSnapEvents("ten-send")).map((row) => row.event_name).sort()).toEqual(["PURCHASE", "SIGN_UP"]);
  });

  it("adds the hashed email and names to the event when the customer gave them", async () => {
    await seedConversation("conv-s5", "ten-snapmail", "حياكم https://example.com/o?ScCid=mm11NN22oo33");
    const { prisma } = await import("../lib/prisma");
    await prisma.lead.create({ data: { id: "lead-s5", tenantId: "ten-snapmail", customerId: "cust-conv-s5", conversationId: "conv-s5", source: "snapchat", name: "هند السبيعي", phone: "966500000123", email: "Hind@Example.com", createdAt: new Date().toISOString() } });
    const { saveSnapAdsSettings, notifySnapStageChange } = await import("../lib/snap-events");
    await saveSnapAdsSettings("ten-snapmail", { pixelId: "33333333-aaaa-bbbb-cccc-1234567890ab", accessToken: "snaptoken" + "m".repeat(30), enabled: true });
    const sent = mockSnap();
    await notifySnapStageChange({ tenantId: "ten-snapmail", conversationId: "conv-s5", stage: "مؤهل", previousStage: "جديد", phone: "966500000123" });
    const sha = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(sent[0].body.data[0].user_data).toMatchObject({ em: [sha("hind@example.com")], fn: [sha("هند")], ln: [sha("السبيعي")] });
  });

  it("logs a rejection with its reason, and does nothing while disabled", async () => {
    await seedConversation("conv-s2", "ten-fail");
    const { saveSnapAdsSettings, notifySnapStageChange } = await import("../lib/snap-events");
    await saveSnapAdsSettings("ten-fail", { pixelId: "11111111-aaaa-bbbb-cccc-1234567890ab", accessToken: "snaptoken" + "z".repeat(30), enabled: true, sendAll: true });
    mockSnap({ ok: false, reason: "Invalid pixel" });
    const failed = await notifySnapStageChange({ tenantId: "ten-fail", conversationId: "conv-s2", stage: "مؤهل", previousStage: "جديد", phone: "966500000123" });
    expect(failed).toMatchObject({ sent: true, ok: false });
    expect(failed.message).toContain("Invalid pixel");

    await saveSnapAdsSettings("ten-fail", { enabled: false });
    const sent = mockSnap();
    expect(await notifySnapStageChange({ tenantId: "ten-fail", conversationId: "conv-s2", stage: "فاز", previousStage: "مؤهل", phone: "966500000123" })).toMatchObject({ sent: false, skipped: "disabled" });
    expect(sent).toHaveLength(0);
  });
});

describe("Snapchat: ad conversations only by default", () => {
  it("skips a conversation that did not come from an ad, unless send-all is on", async () => {
    await seedConversation("conv-s3", "ten-adonly");
    await seedConversation("conv-s4", "ten-adonly", "عرض https://example.com/o?ScCid=zz99YY88xx77");
    const { saveSnapAdsSettings, notifySnapStageChange, getSnapAdsSettings } = await import("../lib/snap-events");
    await saveSnapAdsSettings("ten-adonly", { pixelId: "22222222-aaaa-bbbb-cccc-1234567890ab", accessToken: "snaptoken" + "w".repeat(30), enabled: true });
    expect((await getSnapAdsSettings("ten-adonly")).sendAll).toBe(false);
    const sent = mockSnap();

    expect(await notifySnapStageChange({ tenantId: "ten-adonly", conversationId: "conv-s3", stage: "مؤهل", previousStage: "جديد", phone: "966500000123" })).toMatchObject({ sent: false, skipped: "not-from-ad" });
    expect(sent).toHaveLength(0);
    expect(await notifySnapStageChange({ tenantId: "ten-adonly", conversationId: "conv-s4", stage: "مؤهل", previousStage: "جديد", phone: "966500000123" })).toMatchObject({ sent: true, ok: true });
    expect(sent).toHaveLength(1);

    await saveSnapAdsSettings("ten-adonly", { sendAll: true });
    expect(await notifySnapStageChange({ tenantId: "ten-adonly", conversationId: "conv-s3", stage: "مؤهل", previousStage: "جديد", phone: "966500000123" })).toMatchObject({ sent: true, ok: true });
  });
});
