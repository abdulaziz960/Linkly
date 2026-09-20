import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-media-mime-allowlist.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const svgPayload = `data:image/svg+xml;base64,${Buffer.from("<svg onload=\"alert(1)\"/>").toString("base64")}`;
const htmlPayload = `data:text/html;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`;
const pngPayload = `data:image/png;base64,${Buffer.from("not a real png but that's fine here").toString("base64")}`;

describe("uploadMetaMedia rejects disallowed MIME types before ever calling Meta", () => {
  it("refuses an SVG payload without making any network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { uploadMetaMedia } = await import("../lib/meta-media-upload");

    const result = await uploadMetaMedia("token", svgPayload);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an HTML payload without making any network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { uploadMetaMedia } = await import("../lib/meta-media-upload");

    const result = await uploadMetaMedia("token", htmlPayload);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proceeds to call Meta for an allowed image type", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/uploads?")) return new Response(JSON.stringify({ id: "upload-session-1" }), { status: 200 });
      return new Response(JSON.stringify({ h: "media-handle-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { uploadMetaMedia } = await import("../lib/meta-media-upload");

    const result = await uploadMetaMedia("token", pngPayload);
    expect(result).toEqual({ ok: true, handle: "media-handle-1" });
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("template/campaign media routes never serve a disallowed content-type", () => {
  it("refuses to serve a template row whose stored media is SVG (defense in depth for pre-existing rows)", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { prisma } = await import("../lib/prisma");
    await ensureSchema();
    await prisma.template.create({
      data: {
        id: "tmpl-media-allowlist-svg",
        tenantId: "tenant-media-allowlist",
        name: "svg_test",
        message: "hi",
        type: "خدمة",
        category: "MARKETING",
        language: "ar",
        status: "APPROVED",
        headerType: "IMAGE",
        headerMediaDataUrl: svgPayload,
        syncedAt: "-",
        lastUsed: "-"
      }
    });

    const { GET } = await import("../app/api/whatsapp/template-media/[id]/route");
    const response = await GET(new NextRequest("http://localhost/api/whatsapp/template-media/tmpl-media-allowlist-svg"), {
      params: Promise.resolve({ id: "tmpl-media-allowlist-svg" })
    });
    expect(response.status).toBe(404);
  });

  it("serves an allowed image type with X-Content-Type-Options: nosniff", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.template.create({
      data: {
        id: "tmpl-media-allowlist-png",
        tenantId: "tenant-media-allowlist",
        name: "png_test",
        message: "hi",
        type: "خدمة",
        category: "MARKETING",
        language: "ar",
        status: "APPROVED",
        headerType: "IMAGE",
        headerMediaDataUrl: pngPayload,
        syncedAt: "-",
        lastUsed: "-"
      }
    });

    const { GET } = await import("../app/api/whatsapp/template-media/[id]/route");
    const response = await GET(new NextRequest("http://localhost/api/whatsapp/template-media/tmpl-media-allowlist-png"), {
      params: Promise.resolve({ id: "tmpl-media-allowlist-png" })
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("refuses to serve a campaign row whose stored media is HTML", async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.campaign.create({
      data: {
        id: "camp-media-allowlist-html",
        tenantId: "tenant-media-allowlist",
        name: "html_test",
        status: "قيد الإرسال",
        progress: "0/0",
        headerMediaDataUrl: htmlPayload,
        updatedAt: new Date().toISOString()
      }
    });

    const { GET } = await import("../app/api/whatsapp/campaign-media/[id]/route");
    const response = await GET(new NextRequest("http://localhost/api/whatsapp/campaign-media/camp-media-allowlist-html"), {
      params: Promise.resolve({ id: "camp-media-allowlist-html" })
    });
    expect(response.status).toBe(404);
  });
});

describe("branding logo upload no longer accepts SVG", () => {
  it("rejects an svg+xml logo data URL", async () => {
    vi.doMock("../lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({ id: "user-branding-svg", name: "Owner", role: "مالك الحساب", tenantId: "tenant-media-allowlist" }))
    }));
    vi.doMock("../lib/permissions-server", () => ({ userHasViewPermission: vi.fn(async () => true) }));

    const { PATCH } = await import("../app/api/settings/branding/route");
    const response = await PATCH(new NextRequest("http://localhost/api/settings/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "شركتي", logoDataUrl: svgPayload, color: "#123456" })
    }));
    expect(response.status).toBe(400);
    vi.doUnmock("../lib/auth");
    vi.doUnmock("../lib/permissions-server");
  });
});
