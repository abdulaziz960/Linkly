import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-template-header-image.db");
const tenantId = "tenant-template-image";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u1", name: "Owner", email: "o@t.test", role: "مالك الحساب", tenantId })) }));
vi.mock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));
vi.setConfig({ testTimeout: 120_000 });

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-encryption-key");
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

async function setup() {
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
  const { prisma } = await import("../lib/prisma");
  const { encryptSecret } = await import("../lib/secret-storage");
  await prisma.integrationSetting.upsert({
    where: { id: `wa-${tenantId}` }, update: {},
    create: { id: `wa-${tenantId}`, tenantId, provider: "whatsapp_cloud", status: "connected", businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "pnid-img", wabaId: "waba-img", appId: "", configId: "", verifyToken: "", accessToken: encryptSecret("tok"), webhookUrl: "", updatedAt: new Date().toISOString() }
  });
  return prisma;
}

describe("a template with an image header", () => {
  it("keeps the image, serves it to Meta by link, and sends it on every use", async () => {
    const prisma = await setup();
    const sent: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      const address = String(url);
      if (address.includes("/uploads")) return new Response(JSON.stringify({ id: "upload:1" }), { status: 200 });
      if (address.includes("upload:1")) return new Response(JSON.stringify({ h: "4::handle" }), { status: 200 });
      if (address.includes("message_templates")) return new Response(JSON.stringify({ id: "meta-tpl-1", status: "PENDING" }), { status: 200 });
      if (address.includes("/messages")) { sent.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ messages: [{ id: "wamid.T1" }] }), { status: 200 }); }
      return new Response("{}", { status: 200 });
    }));

    const { POST } = await import("../app/api/templates/route");
    const created = await POST(new NextRequest("https://linklysa.io/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "image_offer", message: "عرض خاص", category: "MARKETING", language: "ar", headerType: "IMAGE", headerMediaDataUrl: png }) }));
    expect(created.status, await created.clone().text()).toBe(200);

    const row = await prisma.template.findFirstOrThrow({ where: { tenantId, name: "image_offer" } });
    expect(row.headerMediaDataUrl).toBe(png);
    expect(row.mediaToken).not.toBe("");

    // Meta approves it (sync keeps the saved image).
    await prisma.template.update({ where: { id: row.id }, data: { status: "معتمد" } });

    // Meta fetches the link.
    const { GET } = await import("../app/api/whatsapp/template-media/[id]/route");
    const media = await GET(new NextRequest(`https://linklysa.io/api/whatsapp/template-media/${row.mediaToken}`), { params: Promise.resolve({ id: row.mediaToken }) });
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("image/png");

    // Every automated send carries the image as the header.
    const { sendWhatsAppTemplate } = await import("../lib/campaign-engine");
    const result = await sendWhatsAppTemplate(tenantId, "966500000009", "image_offer", "ar", "سارة");
    expect(result.ok).toBe(true);
    const components = (sent.at(-1)?.template as { components: Array<{ type: string; parameters: Array<{ type: string; image?: { link: string } }> }> }).components;
    expect(components[0]).toMatchObject({ type: "header", parameters: [{ type: "image", image: { link: `https://linklysa.io/api/whatsapp/template-media/${row.mediaToken}` } }] });
  });
});

describe("saving a template's header file without a new Meta review", () => {
  it("attaches the file to an approved template that has no saved copy, and rejects wrong or oversized files", async () => {
    const prisma = await setup();
    // A template that came from Meta with an image header and no saved copy (created in WhatsApp Manager, or synced).
    await prisma.template.create({ data: { id: `tmpl-${tenantId}-from_meta`, tenantId, name: "from_meta", message: "مرحبا", type: "تسويق", category: "MARKETING", language: "ar", status: "معتمد", headerType: "IMAGE", headerText: "", headerMedia: "", footer: "", buttonType: "NONE", buttonText: "", buttonPhone: "", buttonUrl: "", metaId: "meta-9", syncedAt: "-", lastUsed: "-" } });
    const { getTemplates } = await import("../lib/database");
    expect((await getTemplates(tenantId)).find((template) => template.name === "from_meta")).toMatchObject({ hasHeaderMediaSaved: false, headerMediaUrl: "" });

    const metaCalls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => { metaCalls.push(String(url)); return new Response("{}", { status: 200 }); }));
    const { POST } = await import("../app/api/templates/[name]/media/route");
    const call = (body: unknown) => POST(new NextRequest("https://linklysa.io/api/templates/from_meta/media", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ name: "from_meta" }) });

    expect((await call({ headerMediaDataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" })).status).toBe(400);
    expect((await call({ headerMediaDataUrl: "data:application/pdf;base64,JVBERi0=" })).status).toBe(400); // the header is an image, not a PDF
    const tooBig = `data:image/png;base64,${"A".repeat(7 * 1024 * 1024)}`; // ~5.25 MB
    const oversized = await call({ headerMediaDataUrl: tooBig });
    expect(oversized.status).toBe(400);
    expect(((await oversized.json()) as { error: string }).error).toContain("أكبر من الحد المسموح");

    const ok = await call({ headerMediaDataUrl: png });
    expect(ok.status).toBe(200);
    const saved = await prisma.template.findFirstOrThrow({ where: { tenantId, name: "from_meta" } });
    expect(saved.headerMediaDataUrl).toBe(png);
    expect(saved.mediaToken).not.toBe("");
    expect(saved.status).toBe("معتمد"); // still approved: nothing was resubmitted
    expect(metaCalls).toEqual([]);
    expect((await getTemplates(tenantId)).find((template) => template.name === "from_meta")).toMatchObject({ hasHeaderMediaSaved: true, headerMediaUrl: `/api/whatsapp/template-media/${saved.mediaToken}` });

    // And it now sends with the image.
    const sent: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => { if (String(url).includes("/messages")) sent.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ messages: [{ id: "wamid.T2" }] }), { status: 200 }); }));
    const { sendWhatsAppTemplate } = await import("../lib/campaign-engine");
    expect((await sendWhatsAppTemplate(tenantId, "966500000010", "from_meta", "ar", "ليلى")).ok).toBe(true);
    expect(JSON.stringify(sent.at(-1))).toContain(`template-media/${saved.mediaToken}`);
  });
});
