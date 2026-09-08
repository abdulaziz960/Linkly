import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-linkly-vertical-slice.db");
const tenantId = "tenant-vertical-slice";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("ATTRIBUTION_TENANT_ID", tenantId);
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "agent-vertical-slice",
    name: "موظف المبيعات",
    role: "مالك الحساب",
    tenantId
  }))
}));

describe("Linkly Conversations vertical slice", () => {
  it("tracks a WhatsApp visit through Inbox, Pipeline, AI suggestion, deal value, and Analytics", async () => {
    const { POST: recordClick } = await import("../app/api/attribution/click/route");
    const clickResponse = await recordClick(new NextRequest("http://localhost/api/attribution/click", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.81" },
      body: JSON.stringify({
        pageId: "pricing",
        linkId: "growth-plan",
        buttonId: "pricing-whatsapp-primary",
        referrer: "https://google.com/",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "saas-growth",
        utmContent: "pricing-card"
      })
    }));
    expect(clickResponse.status).toBe(200);
    const clickBody = await clickResponse.json() as { ok: boolean; id: string };
    expect(clickBody.ok).toBe(true);

    const { storeWhatsAppMessage } = await import("../lib/whatsapp-inbox");
    const inbound = await storeWhatsAppMessage({
      tenantId,
      phone: "966555123456",
      name: "عميل رحلة التحويل",
      direction: "in",
      messageId: "vertical-slice-inbound-1",
      text: `أرغب في باقة النمو\n​[REF:${clickBody.id}]`
    });

    const { getConversations, getCustomers } = await import("../lib/database");
    const [inbox, contacts] = await Promise.all([getConversations(tenantId), getCustomers(tenantId)]);
    const inboxConversation = inbox.find((conversation) => conversation.id === inbound.conversationId);
    expect(inboxConversation).toMatchObject({
      customer: "عميل رحلة التحويل",
      pipelineStage: "جديد",
      attrPageId: "pricing",
      attrLinkId: "growth-plan",
      attrButtonId: "pricing-whatsapp-primary",
      attrUtmSource: "google"
    });
    expect(contacts.find((contact) => contact.phone === "966555123456")).toMatchObject({
      attrPageId: "pricing",
      attrButtonId: "pricing-whatsapp-primary"
    });

    const { prisma } = await import("../lib/prisma");
    await prisma.message.createMany({ data: Array.from({ length: 60 }, (_, index) => ({
      id: `history-${index}`, conversationId: inbound.conversationId, direction: "in", text: `latest-context-${index}`,
      time: "12:00", createdAt: new Date(Date.now() + index * 1000).toISOString()
    })) });
    const providerFetch = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "أهلاً بك، يسعدني شرح باقة النمو لك." }] } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", providerFetch);
    const { POST: suggestReply } = await import("../app/api/conversations/[id]/suggest-reply/route");
    const suggestionResponse = await suggestReply(
      new NextRequest(`http://localhost/api/conversations/${inbound.conversationId}/suggest-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "ar" })
      }),
      { params: Promise.resolve({ id: inbound.conversationId }) }
    );
    expect(await suggestionResponse.json()).toMatchObject({
      ok: true,
      data: { suggestion: "أهلاً بك، يسعدني شرح باقة النمو لك." }
    });
    expect(JSON.stringify(providerFetch.mock.calls)).toContain("latest-context-59");
    expect(JSON.stringify(providerFetch.mock.calls)).not.toContain("latest-context-0");

    const { PATCH: updateConversation } = await import("../app/api/conversations/[id]/route");
    const dealResponse = await updateConversation(
      new NextRequest(`http://localhost/api/conversations/${inbound.conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStage: "فاز", dealValue: 7200 })
      }),
      { params: Promise.resolve({ id: inbound.conversationId }) }
    );
    expect(dealResponse.status).toBe(200);

    const { GET: attributionSummary } = await import("../app/api/attribution/summary/route");
    const analyticsResponse = await attributionSummary(new NextRequest("http://localhost/api/attribution/summary"));
    const analytics = await analyticsResponse.json();
    expect(analytics).toMatchObject({
      ok: true,
      data: {
        byPage: [{ pageId: "pricing", clicks: 1, matched: 1 }],
        byButton: [{
          buttonId: "pricing-whatsapp-primary",
          pageId: "pricing",
          linkId: "growth-plan",
          clicks: 1,
          matched: 1
        }]
      }
    });

    const converted = await getConversations(tenantId);
    expect(converted.find((conversation) => conversation.id === inbound.conversationId)).toMatchObject({
      pipelineStage: "فاز",
      dealValue: 7200,
      attrLinkId: "growth-plan"
    });
  });
});
