import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-branding-route.db");
const tenantId = "tenant-branding-route-test";

vi.mock("../lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-branding-route", name: "Owner", role: "مالك الحساب", tenantId }))
}));

vi.mock("../lib/permissions-server", () => ({
  userHasViewPermission: vi.fn(async () => true)
}));

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

describe("GET/PATCH /api/settings/branding", () => {
  it("PATCH saves and GET returns the saved branding", async () => {
    const { GET, PATCH } = await import("../app/api/settings/branding/route");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    const patchResponse = await PATCH(new NextRequest("https://example.test/api/settings/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "علامتي", logoDataUrl: "", color: "#123456" })
    }));
    expect(patchResponse.status).toBe(200);

    const getResponse = await GET();
    const body = await getResponse.json();
    expect(body.data.name).toBe("علامتي");
    expect(body.data.color).toBe("#123456");
  });

  it("rejects an invalid color value", async () => {
    const { PATCH } = await import("../app/api/settings/branding/route");

    const response = await PATCH(new NextRequest("https://example.test/api/settings/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", logoDataUrl: "", color: "not-a-color" })
    }));
    expect(response.status).toBe(400);
  });

  it("rejects an oversized logo payload", async () => {
    const { PATCH } = await import("../app/api/settings/branding/route");
    const oversized = `data:image/png;base64,${"A".repeat(700_000)}`;

    const response = await PATCH(new NextRequest("https://example.test/api/settings/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", logoDataUrl: oversized, color: "" })
    }));
    expect(response.status).toBe(400);
  });
});

describe("unauthenticated access", () => {
  it("returns 401 when no user is signed in", async () => {
    vi.doMock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
    vi.resetModules();

    const { GET } = await import("../app/api/settings/branding/route");
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
