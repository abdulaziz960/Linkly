import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-branches.db");
const tenantId = "tenant-branches";
const otherTenant = "tenant-branches-other";

const texts: string[] = [];
const pins: Array<Record<string, unknown>> = [];
const requests: Array<Record<string, unknown>> = [];
vi.mock("../lib/whatsapp-send", () => ({
  sendWhatsAppLocation: vi.fn(async (input: Record<string, unknown>) => { pins.push(input); return { ok: true }; }),
  sendWhatsAppLocationRequest: vi.fn(async (input: Record<string, unknown>) => { requests.push(input); return { ok: true }; })
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

const ctx = () => ({ channel: "whatsapp" as const, tenantId, conversationId: "c1", recipientId: "966500000000", sendText: async (t: string) => { texts.push(t); } });

describe("coordinates from map links", () => {
  it("reads lat/lng from common Google Maps URL shapes", async () => {
    const { extractCoordinates } = await import("../lib/branches");
    expect(extractCoordinates("https://www.google.com/maps/place/X/@24.7136,46.6753,15z/data=!3m1")).toEqual({ latitude: 24.7136, longitude: 46.6753 });
    expect(extractCoordinates("https://www.google.com/maps?q=21.4858,39.1925")).toEqual({ latitude: 21.4858, longitude: 39.1925 });
    expect(extractCoordinates("https://maps.google.com/x/data=!3d26.4207!4d50.0888")).toEqual({ latitude: 26.4207, longitude: 50.0888 });
    expect(extractCoordinates("24.7136, 46.6753")).toEqual({ latitude: 24.7136, longitude: 46.6753 });
    expect(extractCoordinates("https://example.com")).toBeNull();
  });

  it("only follows Google hosts for short links", async () => {
    const { coordinatesFromMapsLink } = await import("../lib/maps-link");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await coordinatesFromMapsLink("https://evil.example.com/redirect")).toBeNull();
    expect(await coordinatesFromMapsLink("http://127.0.0.1/maps")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://www.google.com/maps/place/Branch/@24.5,46.5,17z" } }));
    expect(await coordinatesFromMapsLink("https://maps.app.goo.gl/abc123")).toEqual({ latitude: 24.5, longitude: 46.5 });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }));
    expect(await coordinatesFromMapsLink("https://maps.app.goo.gl/def456")).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("branches and the nearest-branch bot step", () => {
  it("validates input", async () => {
    const { cleanBranchInput } = await import("../lib/branches");
    expect(cleanBranchInput({ name: "", latitude: 1, longitude: 1 }).ok).toBe(false);
    expect(cleanBranchInput({ name: "x" }).ok).toBe(false);
    expect(cleanBranchInput({ name: "x", latitude: 120, longitude: 1 }).ok).toBe(false);
    expect(cleanBranchInput({ name: "x", mapUrl: "https://www.google.com/maps/@24.7,46.6,15z" }).ok).toBe(true);
  });

  it("picks the nearest active branch of the right tenant and ignores hidden ones", async () => {
    const { ensureSchema } = await import("../lib/database");
    const { createBranch, cleanBranchInput } = await import("../lib/branches");
    const { sendNearestBranch, startBranchStep, handleBranchReply } = await import("../lib/branch-bot");
    await ensureSchema();

    const add = async (tenant: string, name: string, lat: number, lng: number, active = true) => {
      const cleaned = cleanBranchInput({ name, latitude: lat, longitude: lng, address: `${name} street`, active });
      if (!cleaned.ok) throw new Error(cleaned.error);
      await createBranch(tenant, cleaned.data);
    };
    await add(tenantId, "الرياض", 24.7136, 46.6753);
    await add(tenantId, "جدة", 21.4858, 39.1925);
    await add(tenantId, "الدمام (مخفي)", 26.4207, 50.0888, false);
    await add(otherTenant, "فرع غريب", 26.4207, 50.0888);

    // A customer near Dammam: the hidden Dammam branch and the other tenant's branch must not win.
    texts.length = 0;
    pins.length = 0;
    expect(await sendNearestBranch(ctx(), { latitude: 26.43, longitude: 50.1 })).toBe(true);
    expect(texts[0]).toContain("الرياض");
    expect(texts[0]).not.toContain("غريب");
    expect(pins).toHaveLength(1);

    // A customer in Jeddah gets Jeddah with a distance and map link.
    texts.length = 0;
    await sendNearestBranch(ctx(), { latitude: 21.49, longitude: 39.19 });
    expect(texts[0]).toContain("جدة");
    expect(texts[0]).toContain("google.com/maps");
    expect(texts[0]).toMatch(/المسافة التقريبية/);

    // The step asks with the one-tap prompt and waits; a reply without a location lists all branches.
    requests.length = 0;
    expect(await startBranchStep(ctx(), "")).toBe("waiting");
    expect(requests).toHaveLength(1);
    texts.length = 0;
    await handleBranchReply(ctx(), undefined);
    expect(texts[0]).toContain("الرياض");
    expect(texts[0]).toContain("جدة");
    expect(texts[0]).not.toContain("مخفي");

    // No branches at all -> the step is skipped.
    expect(await startBranchStep({ ...ctx(), tenantId: "tenant-empty" }, "")).toBe("none");
  });
});
