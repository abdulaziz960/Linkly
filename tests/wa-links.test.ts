import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-wa-links.db");
const tenantId = "tenant-wa-links";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
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

describe("WhatsApp tracking links: pure parts", () => {
  it("validates the input and falls back to a default message", async () => {
    const { normalizeWaLinkInput } = await import("../lib/wa-links");
    expect(normalizeWaLinkInput({ name: "  " }).ok).toBe(false);
    const ok = normalizeWaLinkInput({ name: "سناب - الصيف", platform: "snapchat", campaign: "الصيف" });
    expect(ok).toMatchObject({ ok: true, data: { platform: "snapchat", campaign: "الصيف" } });
    expect(ok.ok && ok.data.message.length).toBeGreaterThan(0);
    expect(normalizeWaLinkInput({ name: "x", platform: "bogus" })).toMatchObject({ ok: true, data: { platform: "other" } });
  });

  it("reads each platform's click id and says which platform it is", async () => {
    const { clickIdFromQuery } = await import("../lib/wa-links");
    expect(clickIdFromQuery(new URLSearchParams("ScCid=abc123"))).toEqual({ clickId: "abc123", platform: "snapchat" });
    expect(clickIdFromQuery(new URLSearchParams("ttclid=E.C.P.x1"))).toEqual({ clickId: "E.C.P.x1", platform: "tiktok" });
    expect(clickIdFromQuery(new URLSearchParams("gclid=Cj0K"))).toEqual({ clickId: "Cj0K", platform: "google" });
    expect(clickIdFromQuery(new URLSearchParams("utm_source=x"))).toEqual({ clickId: "", platform: "" });
  });

  it("builds the wa.me URL with the message and the invisible click marker", async () => {
    const { whatsappUrl } = await import("../lib/wa-links");
    const url = whatsappUrl("966555000000", "السلام عليكم", "abc123");
    expect(url.startsWith("https://wa.me/966555000000?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("السلام عليكم\n​[REF:abc123]");
    expect(decodeURIComponent(whatsappUrl("966555000000", "hi", "").split("text=")[1])).toBe("hi");
  });
});

describe("a click through a link becomes the conversation's source", () => {
  it("records the click, redirects to WhatsApp, and shows the source when the message arrives", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    await prisma.integrationSetting.create({ data: {
      id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected", businessName: "B", wabaName: "B",
      phoneNumber: "+966 55 500 0000", phoneNumberId: "pn", wabaId: "waba", appId: "", verifyToken: "", accessToken: "", webhookUrl: "", updatedAt: new Date().toISOString()
    } });
    const { createWaLink, listWaLinks, captureLinkAdSource } = await import("../lib/wa-links");
    const link = await createWaLink(tenantId, { name: "إعلان سناب", platform: "snapchat", campaign: "عرض الصيف", message: "أبغى أعرف السعر" });
    expect(link.code).toMatch(/^[a-z0-9]{4,16}$/);

    const { GET } = await import("../app/api/w/[code]/route");
    const response = await GET(new NextRequest(`https://example.test/api/w/${link.code}?ScCid=sc-click-9`), { params: Promise.resolve({ code: link.code }) });
    expect(response.status).toBe(302);
    const location = response.headers.get("location") || "";
    expect(location.startsWith("https://wa.me/966555000000?text=")).toBe(true);
    const text = decodeURIComponent(location.split("text=")[1]);
    expect(text).toContain("أبغى أعرف السعر");
    const ref = /\[REF:([a-f0-9]+)\]/.exec(text)?.[1] || "";
    expect(ref).toBeTruthy();
    const click = await prisma.linkClick.findUnique({ where: { id: ref } });
    expect(click).toMatchObject({ tenantId, pageId: "wa-link", linkId: link.code, buttonId: "sc-click-9", utmSource: "snapchat", utmCampaign: "عرض الصيف" });

    // The customer sends the pre-filled message: the conversation is attributed, then shows the source with the click id.
    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    const stored = await storeWhatsAppMessage({ phone: "966500001234", name: "سعد", text, direction: "in", tenantId, messageId: "wa-link-1" });
    await captureLinkAdSource({ tenantId, conversationId: stored.conversationId });
    const { getAdSource } = await import("../lib/ad-source");
    expect(await getAdSource(tenantId, stored.conversationId)).toMatchObject({ platform: "snapchat", headline: "عرض الصيف", clickId: "sc-click-9", matchedBy: "tracking_link" });

    const listed = await listWaLinks(tenantId);
    expect(listed[0]).toMatchObject({ code: link.code, clicks: 1, conversations: 1 });
  });

  it("answers an unknown or removed link without leaking anything", async () => {
    const { GET } = await import("../app/api/w/[code]/route");
    const response = await GET(new NextRequest("https://example.test/api/w/nope1234"), { params: Promise.resolve({ code: "nope1234" }) });
    expect(response.status).toBe(404);
    const { createWaLink, deleteWaLink } = await import("../lib/wa-links");
    const link = await createWaLink(tenantId, { name: "مؤقت", platform: "other", campaign: "", message: "hi" });
    await deleteWaLink(tenantId, link.code);
    const gone = await GET(new NextRequest(`https://example.test/api/w/${link.code}`), { params: Promise.resolve({ code: link.code }) });
    expect(gone.status).toBe(404);
  });
});
