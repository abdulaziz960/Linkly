import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-template-media-route.db");

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

// Pre-launch audit finding F-01: the public, unauthenticated media-serving
// route must only work via the template's random mediaToken. Its own id
// (tmpl-<tenantId>-<name>) is predictable and must never work as a
// substitute, even though it did before this fix.
describe("GET /api/whatsapp/template-media/[id]", () => {
  it("serves media by mediaToken but rejects the predictable template id", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    const dataUrl = "data:image/png;base64,aGVsbG8=";
    await prisma.template.create({
      data: {
        id: "tmpl-tenant-media-test-welcome",
        tenantId: "tenant-media-test",
        name: "welcome",
        message: "مرحباً",
        type: "خدمة",
        language: "ar",
        status: "معتمد",
        headerType: "IMAGE",
        headerMediaDataUrl: dataUrl,
        mediaToken: "a-real-random-token",
        lastUsed: "-"
      }
    });

    const { GET } = await import("../app/api/whatsapp/template-media/[id]/route");

    const byToken = await GET(new NextRequest("http://localhost/api/whatsapp/template-media/a-real-random-token"), {
      params: Promise.resolve({ id: "a-real-random-token" })
    });
    expect(byToken.status).toBe(200);

    const byPredictableId = await GET(new NextRequest("http://localhost/api/whatsapp/template-media/tmpl-tenant-media-test-welcome"), {
      params: Promise.resolve({ id: "tmpl-tenant-media-test-welcome" })
    });
    expect(byPredictableId.status).toBe(404);
  });
});
