import { randomUUID } from "crypto";
import { prisma } from "./prisma";

/**
 * WhatsApp media-card carousel templates: a message body plus 2-10 cards, each with an image, a short text and up to
 * two buttons (all cards share the same button layout). The card images live in a small raw-SQL side table (no Prisma
 * model needed): Meta gets an upload handle at review time, and sends point at our public card-media URL.
 */

export type CarouselButton = { type: "QUICK_REPLY" | "URL"; text: string; url?: string };
export type CarouselCardInput = { imageDataUrl: string; body: string; buttons: CarouselButton[] };
export type CarouselCard = { index: number; body: string; buttons: CarouselButton[]; token: string };

export const CAROUSEL_MIN_CARDS = 2;
export const CAROUSEL_MAX_CARDS = 10;
export const CAROUSEL_CARD_BODY_MAX = 160;
export const CAROUSEL_BUTTON_TEXT_MAX = 25;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma
    .$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS template_carousel_cards (
      tenant_id TEXT NOT NULL,
      template_name TEXT NOT NULL,
      card_index INTEGER NOT NULL,
      token TEXT NOT NULL,
      image_data_url TEXT NOT NULL,
      body TEXT NOT NULL,
      buttons_json TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (tenant_id, template_name, card_index)
    )`)
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

export function cleanCarouselInput(raw: unknown): { ok: true; cards: CarouselCardInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "أضف بطاقات القالب (من 2 إلى 10)." };
  if (raw.length < CAROUSEL_MIN_CARDS || raw.length > CAROUSEL_MAX_CARDS) return { ok: false, error: `عدد البطاقات من ${CAROUSEL_MIN_CARDS} إلى ${CAROUSEL_MAX_CARDS}.` };
  const cards: CarouselCardInput[] = [];
  for (const [position, item] of raw.entries()) {
    const card = (item ?? {}) as { imageDataUrl?: unknown; body?: unknown; buttons?: unknown };
    const label = `البطاقة ${position + 1}`;
    const imageDataUrl = typeof card.imageDataUrl === "string" ? card.imageDataUrl : "";
    if (!IMAGE_DATA_URL.test(imageDataUrl)) return { ok: false, error: `${label}: ارفع صورة JPG أو PNG.` };
    if (Math.floor((imageDataUrl.length * 3) / 4) > MAX_IMAGE_BYTES) return { ok: false, error: `${label}: الصورة أكبر من 4 ميجابايت.` };
    const body = String(card.body ?? "").trim();
    if (!body) return { ok: false, error: `${label}: اكتب نص البطاقة.` };
    if (body.length > CAROUSEL_CARD_BODY_MAX) return { ok: false, error: `${label}: نص البطاقة أطول من ${CAROUSEL_CARD_BODY_MAX} حرفًا.` };
    const buttonsRaw = Array.isArray(card.buttons) ? card.buttons : [];
    if (buttonsRaw.length > 2) return { ok: false, error: `${label}: حد أقصى زرّان.` };
    const buttons: CarouselButton[] = [];
    for (const [buttonIndex, entry] of buttonsRaw.entries()) {
      const button = (entry ?? {}) as { type?: unknown; text?: unknown; url?: unknown };
      const type = button.type === "URL" ? "URL" : "QUICK_REPLY";
      const text = String(button.text ?? "").trim();
      if (!text) return { ok: false, error: `${label}: اكتب نص الزر ${buttonIndex + 1}.` };
      if (text.length > CAROUSEL_BUTTON_TEXT_MAX) return { ok: false, error: `${label}: نص الزر أطول من ${CAROUSEL_BUTTON_TEXT_MAX} حرفًا.` };
      if (type === "URL") {
        const url = String(button.url ?? "").trim();
        if (!/^https:\/\/\S+$/i.test(url) || url.length > 2000) return { ok: false, error: `${label}: رابط الزر يجب أن يبدأ بـ https://.` };
        buttons.push({ type, text, url });
      } else buttons.push({ type, text });
    }
    cards.push({ imageDataUrl, body, buttons });
  }
  // Meta needs every card to carry the same buttons, in the same order.
  const layout = (card: CarouselCardInput) => card.buttons.map((button) => button.type).join(",");
  if (cards.some((card) => layout(card) !== layout(cards[0]))) return { ok: false, error: "كل البطاقات يجب أن تحمل نفس الأزرار بنفس الترتيب." };
  return { ok: true, cards };
}

/** The CAROUSEL component sent to Meta at template creation (handles come from uploadMetaMedia, one per card). */
export function buildCarouselComponent(handles: string[], cards: CarouselCardInput[]) {
  return {
    type: "CAROUSEL",
    cards: cards.map((card, index) => ({
      components: [
        { type: "HEADER", format: "IMAGE", example: { header_handle: [handles[index]] } },
        { type: "BODY", text: card.body },
        ...(card.buttons.length
          ? [{ type: "BUTTONS", buttons: card.buttons.map((button) => (button.type === "URL" ? { type: "URL", text: button.text, url: button.url } : { type: "QUICK_REPLY", text: button.text })) }]
          : [])
      ]
    }))
  };
}

export async function saveCarouselCards(tenantId: string, templateName: string, cards: CarouselCardInput[]) {
  await ensureTable();
  await prisma.$executeRaw`DELETE FROM template_carousel_cards WHERE tenant_id = ${tenantId} AND template_name = ${templateName}`;
  for (const [index, card] of cards.entries()) {
    await prisma.$executeRaw`INSERT INTO template_carousel_cards (tenant_id, template_name, card_index, token, image_data_url, body, buttons_json) VALUES (${tenantId}, ${templateName}, ${index}, ${randomUUID()}, ${card.imageDataUrl}, ${card.body}, ${JSON.stringify(card.buttons)})`;
  }
}

export async function deleteCarouselCards(tenantId: string, templateName: string) {
  await ensureTable();
  await prisma.$executeRaw`DELETE FROM template_carousel_cards WHERE tenant_id = ${tenantId} AND template_name = ${templateName}`;
}

export async function getCarouselCards(tenantId: string, templateName: string): Promise<CarouselCard[]> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ card_index: number | bigint; token: string; body: string; buttons_json: string }>>`SELECT card_index, token, body, buttons_json FROM template_carousel_cards WHERE tenant_id = ${tenantId} AND template_name = ${templateName} ORDER BY card_index`;
  return rows.map((row) => ({ index: Number(row.card_index), token: row.token, body: row.body, buttons: JSON.parse(row.buttons_json || "[]") as CarouselButton[] }));
}

/** Template name -> number of cards, for the templates list. */
export async function getCarouselCounts(tenantId: string): Promise<Map<string, number>> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ template_name: string; total: number | bigint }>>`SELECT template_name, COUNT(*) AS total FROM template_carousel_cards WHERE tenant_id = ${tenantId} GROUP BY template_name`;
  return new Map(rows.map((row) => [row.template_name, Number(row.total)]));
}

/** The image of one card, by its public token (served to WhatsApp when a carousel is sent). */
export async function getCarouselCardImage(token: string): Promise<string | null> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ image_data_url: string }>>`SELECT image_data_url FROM template_carousel_cards WHERE token = ${token} LIMIT 1`;
  return rows[0]?.image_data_url ?? null;
}

/** The CAROUSEL component of a template send: each card's image as a link to our public card-media URL. */
export async function buildCarouselSendComponent(tenantId: string, templateName: string): Promise<Record<string, unknown> | null> {
  const cards = await getCarouselCards(tenantId, templateName);
  if (!cards.length) return null;
  const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://linklysa.io").replace(/\/$/, "");
  return {
    type: "carousel",
    cards: cards.map((card) => ({
      card_index: card.index,
      components: [{ type: "header", parameters: [{ type: "image", image: { link: `${baseUrl}/api/whatsapp/template-card-media/${card.token}` } }] }]
    }))
  };
}
