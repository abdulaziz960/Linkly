import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-ad-source.db");

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

describe("ad source of a conversation", () => {
  it("reads a Meta click-to-WhatsApp referral", async () => {
    const { extractAdSource } = await import("../lib/ad-source");
    const source = extractAdSource({ referral: { source_url: "https://fb.me/abc", source_id: "1203", source_type: "ad", headline: "خصم 20٪", ctwa_clid: "AfXYZ123" } });
    expect(source).toMatchObject({ platform: "meta", adId: "1203", headline: "خصم 20٪", clickId: "AfXYZ123", matchedBy: "referral" });
  });

  it("finds a TikTok click id in the referral URL or in the message text", async () => {
    const { extractAdSource } = await import("../lib/ad-source");
    expect(extractAdSource({ referral: { source_url: "https://www.tiktok.com/ad?ttclid=E.C.P.AAAA1111" } })).toMatchObject({ platform: "tiktok", clickId: "E.C.P.AAAA1111", matchedBy: "referral.source_url" });
    expect(extractAdSource({ text: { body: "مرحبا ttclid_ref https://x.sa/?ttclid=ABCDEF123456" } })).toMatchObject({ platform: "tiktok", clickId: "ABCDEF123456", matchedBy: "text" });
  });

  it("returns nothing for a plain message and keeps unknown referrals raw", async () => {
    const { extractAdSource } = await import("../lib/ad-source");
    expect(extractAdSource({ text: { body: "السلام عليكم" } })).toBeNull();
    const unknown = extractAdSource({ referral: { foo: "bar" } });
    expect(unknown?.platform).toBe("unknown");
    expect(unknown?.raw).toContain("foo");
  });

  it("stores the first source once, fills in a missing click id later, and is tenant-scoped", async () => {
    const { captureAdSource, getAdSource } = await import("../lib/ad-source");
    await captureAdSource({ tenantId: "ten-1", conversationId: "c-1", message: { referral: { source_url: "https://tiktok.com/x", source_id: "AD9" } } });
    expect(await getAdSource("ten-1", "c-1")).toMatchObject({ platform: "tiktok", adId: "AD9", clickId: "" });

    await captureAdSource({ tenantId: "ten-1", conversationId: "c-1", message: { referral: { source_url: "https://tiktok.com/x?ttclid=CLICK123456" } } });
    expect(await getAdSource("ten-1", "c-1")).toMatchObject({ adId: "AD9", clickId: "CLICK123456" }); // first ad id kept

    await captureAdSource({ tenantId: "ten-1", conversationId: "c-2", message: { text: { body: "no ad" } } });
    expect(await getAdSource("ten-1", "c-2")).toBeNull();
    expect(await getAdSource("ten-other", "c-1")).toBeNull();
  });

  it("attaches the TikTok click id to the lead-status event", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    await prisma.customer.create({ data: { id: "cust-tt", name: "عميل", phone: "966500009999", initial: "ع", tenantId: "ten-tt" } });
    await prisma.conversation.create({ data: { id: "conv-tt", customerId: "cust-tt", channel: "whatsapp", lastMessage: "x", status: "assigned", assignee: "موظف", tenantId: "ten-tt" } });
    const { captureAdSource } = await import("../lib/ad-source");
    await captureAdSource({ tenantId: "ten-tt", conversationId: "conv-tt", message: { referral: { source_url: "https://tiktok.com/x?ttclid=CLICKABC123" } } });

    const { saveTikTokAdsSettings, setLeadStatus } = await import("../lib/tiktok-events");
    await saveTikTokAdsSettings("ten-tt", { eventSetId: "CTM12345", accessToken: "tok_" + "z".repeat(20), enabled: true });
    const bodies: Array<{ data: Array<{ user: { ttclid?: string; phone: string } }> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ code: 0 }));
    }));
    await setLeadStatus({ tenantId: "ten-tt", conversationId: "conv-tt", status: "فاز", actor: "x" });
    expect(bodies[0].data[0].user.ttclid).toBe("CLICKABC123");
    expect(bodies[0].data[0].user.phone).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("ad media", () => {
  it("keeps only an https picture and marks videos", async () => {
    const { extractAdMedia, extractAdSource } = await import("../lib/ad-source");
    expect(extractAdMedia({ media_type: "image", image_url: "https://cdn.example/a.jpg" })).toEqual({ thumbnailUrl: "https://cdn.example/a.jpg", mediaType: "image" });
    expect(extractAdMedia({ media_type: "video", video_url: "https://cdn.example/v.mp4", thumbnail_url: "https://cdn.example/t.jpg" })).toEqual({ thumbnailUrl: "https://cdn.example/t.jpg", mediaType: "video" });
    expect(extractAdMedia({ image_url: "http://insecure.example/a.jpg" })).toEqual({ thumbnailUrl: "", mediaType: "" });
    expect(extractAdMedia({ image_url: "javascript:alert(1)" })).toEqual({ thumbnailUrl: "", mediaType: "" });
    expect(extractAdMedia(null)).toEqual({ thumbnailUrl: "", mediaType: "" });
    const source = extractAdSource({ type: "text", text: { body: "hi" }, referral: { source_type: "ad", source_id: "1", ctwa_clid: "c1", media_type: "image", image_url: "https://cdn.example/p.png" } });
    expect(source).toMatchObject({ platform: "meta", thumbnailUrl: "https://cdn.example/p.png", mediaType: "image" });
  });
});

describe("TikTok cover lookup", () => {
  it("reads the cover from the oEmbed payload and looks it up once", async () => {
    const { thumbnailFromTikTokOEmbed, ensureTikTokThumbnail, getAdSource, captureAdSource } = await import("../lib/ad-source");
    expect(thumbnailFromTikTokOEmbed({ thumbnail_url: "https://p16.tiktokcdn.com/cover.jpeg" })).toBe("https://p16.tiktokcdn.com/cover.jpeg");
    expect(thumbnailFromTikTokOEmbed({ thumbnail_url: "http://insecure/c.jpg" })).toBe("");
    expect(thumbnailFromTikTokOEmbed(null)).toBe("");

    await captureAdSource({ tenantId: "ten-cover", conversationId: "conv-cover", message: { type: "text", text: { body: "hi" }, referral: { source_url: "https://www.tiktok.com/@brand/video/7380000000000000?ttclid=E.C.P.abcdef", headline: "عرض" } } });
    const stored = await getAdSource("ten-cover", "conv-cover");
    expect(stored).toMatchObject({ platform: "tiktok", thumbnailUrl: "" });

    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify({ thumbnail_url: "https://p16.tiktokcdn.com/cover.jpeg" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const withCover = await ensureTikTokThumbnail("ten-cover", "conv-cover", stored!);
    expect(withCover).toMatchObject({ thumbnailUrl: "https://p16.tiktokcdn.com/cover.jpeg", mediaType: "video" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("tiktok.com/oembed");
    // Saved: the next read has the picture and no further request is made.
    expect((await getAdSource("ten-cover", "conv-cover"))?.thumbnailUrl).toBe("https://p16.tiktokcdn.com/cover.jpeg");
    await ensureTikTokThumbnail("ten-cover", "conv-cover", (await getAdSource("ten-cover", "conv-cover"))!);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Not a public video link: never asked.
    const other = { ...stored!, sourceUrl: "https://example.com/x", thumbnailUrl: "" };
    await ensureTikTokThumbnail("ten-cover", "conv-cover", other);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
