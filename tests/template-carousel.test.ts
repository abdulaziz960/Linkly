import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-template-carousel.db");
const png = "data:image/png;base64,iVBORw0KGgo=";
const card = (body: string, buttons: Array<Record<string, string>> = []) => ({ imageDataUrl: png, body, buttons });

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

describe("carousel template input", () => {
  it("needs 2 to 10 cards, each with a JPG/PNG image and a short text", async () => {
    const { cleanCarouselInput } = await import("../lib/template-carousel");
    expect(cleanCarouselInput([card("a")]).ok).toBe(false);
    expect(cleanCarouselInput([card("a"), card("b")]).ok).toBe(true);
    expect(cleanCarouselInput([card("a"), { ...card("b"), imageDataUrl: "data:image/svg+xml;base64,AAAA" }]).ok).toBe(false);
    expect(cleanCarouselInput([card("a"), card("x".repeat(161))]).ok).toBe(false);
    expect(cleanCarouselInput(Array.from({ length: 11 }, () => card("a"))).ok).toBe(false);
  });

  it("keeps the same buttons on every card and only accepts https links", async () => {
    const { cleanCarouselInput } = await import("../lib/template-carousel");
    const link = { type: "URL", text: "Buy", url: "https://example.com/p" };
    expect(cleanCarouselInput([card("a", [link]), card("b", [link])]).ok).toBe(true);
    expect(cleanCarouselInput([card("a", [link]), card("b", [{ type: "QUICK_REPLY", text: "Buy" }])]).ok).toBe(false);
    expect(cleanCarouselInput([card("a", [{ ...link, url: "http://example.com" }]), card("b", [link])]).ok).toBe(false);
    expect(cleanCarouselInput([card("a", [link, link, link]), card("b", [link, link, link])]).ok).toBe(false);
  });

  it("builds the Meta creation components: body plus a carousel of cards", async () => {
    const { buildTemplateComponents } = await import("../lib/meta-templates");
    const components = buildTemplateComponents({
      category: "MARKETING", language: "ar", headerType: "NONE", headerText: "", headerMediaHandle: "", message: "عروض اليوم", footer: "", buttonType: "NONE", buttonText: "", buttonPhone: "", buttonUrl: "",
      carousel: { handles: ["h1", "h2"], cards: [card("a", [{ type: "URL", text: "Buy", url: "https://example.com/p" }]) as never, card("b", [{ type: "URL", text: "Buy", url: "https://example.com/q" }]) as never] }
    });
    expect(components.map((component) => component.type)).toEqual(["BODY", "CAROUSEL"]);
    const cards = (components[1] as { cards: Array<{ components: Array<{ type: string; format?: string; example?: { header_handle: string[] } }> }> }).cards;
    expect(cards).toHaveLength(2);
    expect(cards[0].components.map((component) => component.type)).toEqual(["HEADER", "BODY", "BUTTONS"]);
    expect(cards[1].components[0].example?.header_handle).toEqual(["h2"]);
  });
});

describe("carousel cards storage and sending", () => {
  it("saves cards, serves each image by token and builds the send component", async () => {
    const { saveCarouselCards, getCarouselCards, getCarouselCardImage, buildCarouselSendComponent, getCarouselCounts, deleteCarouselCards } = await import("../lib/template-carousel");
    await saveCarouselCards("t1", "promo", [card("a"), card("b")] as never);
    const cards = await getCarouselCards("t1", "promo");
    expect(cards.map((item) => item.body)).toEqual(["a", "b"]);
    expect(await getCarouselCardImage(cards[0].token)).toBe(png);
    expect((await getCarouselCounts("t1")).get("promo")).toBe(2);
    const send = (await buildCarouselSendComponent("t1", "promo")) as { type: string; cards: Array<{ card_index: number; components: Array<{ parameters: Array<{ image: { link: string } }> }> }> };
    expect(send.type).toBe("carousel");
    expect(send.cards[1].card_index).toBe(1);
    expect(send.cards[1].components[0].parameters[0].image.link).toContain(`/api/whatsapp/template-card-media/${cards[1].token}`);
    expect(await buildCarouselSendComponent("other-tenant", "promo")).toBeNull();
    await deleteCarouselCards("t1", "promo");
    expect(await getCarouselCards("t1", "promo")).toEqual([]);
  });
});
