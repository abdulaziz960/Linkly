import { PlanLimitError } from "./plan-access-server";
import { createHash } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { isPubliclyRoutableUrl } from "./url-safety";
import { cleanProductInput, parsePrice, upsertProductByExternalId, type CleanProductInput } from "./catalog";

const MAX_FEED_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_PRODUCTS_PER_SYNC = 5000;
const FETCH_TIMEOUT_MS = 20_000;

export class FeedError extends Error {}

/**
 * Downloads a merchant-supplied feed URL. The URL is attacker-controlled
 * input (any tenant owner can type any address), so: every hop is re-checked
 * for being publicly routable, redirects are followed by hand (max 3) so
 * none can bounce to an internal address, there's a hard timeout, and the
 * body is streamed with a byte cap instead of buffered whole.
 */
export async function fetchFeedText(rawUrl: string): Promise<string> {
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await isPubliclyRoutableUrl(url))) throw new FeedError("رابط الملف غير مسموح (يجب أن يكون عنوانًا عامًا على الإنترنت)");

    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json, application/xml, text/xml, text/csv, text/plain, */*", "User-Agent": "LinklyCatalogSync/1.0" }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new FeedError("تعذر قراءة الملف: إعادة توجيه غير صالحة");
      url = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new FeedError(`تعذر تحميل الملف (HTTP ${response.status})`);

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) throw new FeedError("حجم الملف أكبر من المسموح (8 ميجابايت)");

    const reader = response.body?.getReader();
    if (!reader) throw new FeedError("الملف فارغ");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FEED_BYTES) {
        await reader.cancel().catch(() => {});
        throw new FeedError("حجم الملف أكبر من المسموح (8 ميجابايت)");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
  }
  throw new FeedError("عدد مرات إعادة التوجيه كبير");
}

// ---- Parsing ----

type RawRecord = Record<string, unknown>;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

function xmlText(value: string): string {
  const cdata = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1] : decodeXmlEntities(value)).trim();
}

/** Minimal, dependency-free reader for RSS/Atom/Google-Merchant style feeds. */
export function parseXmlRecords(xml: string): RawRecord[] {
  const blocks = [...xml.matchAll(/<(item|entry|product)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks.map((block) => {
    const record: RawRecord = {};
    for (const tag of block.matchAll(/<([A-Za-z_][\w:.-]*)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
      const name = tag[1].toLowerCase().replace(/^g:/, "");
      const value = tag[2];
      if (value === undefined) continue;
      if (record[name] === undefined) record[name] = xmlText(value);
    }
    return record;
  });
}

function detectDelimiter(headerLine: string): string {
  const counts = [",", ";", "\t", "|"].map((delimiter) => ({ delimiter, count: headerLine.split(delimiter).length }));
  return counts.sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseCsvRecords(csv: string): RawRecord[] {
  const delimiter = detectDelimiter(csv.split(/\r?\n/, 1)[0] || "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (inQuotes) {
      if (char === '"' && csv[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') inQuotes = false;
      else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/^g:/, ""));
  return rows.slice(1).map((cells) => {
    const record: RawRecord = {};
    headers.forEach((header, columnIndex) => { if (header) record[header] = (cells[columnIndex] ?? "").trim(); });
    return record;
  });
}

export function parseJsonRecords(json: string): RawRecord[] {
  const parsed = JSON.parse(json) as unknown;
  const pick = (value: unknown): unknown[] | null => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const key of ["products", "items", "data", "results", "rows"]) {
        const nested = (value as Record<string, unknown>)[key];
        const found = pick(nested);
        if (found) return found;
      }
    }
    return null;
  };
  const list = pick(parsed);
  if (!list) throw new FeedError("لم يتم العثور على قائمة منتجات داخل ملف JSON");
  return list
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key.toLowerCase().replace(/^g:/, ""), value])));
}

export function parseFeed(content: string): RawRecord[] {
  const trimmed = content.trim();
  if (!trimmed) throw new FeedError("الملف فارغ");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseJsonRecords(trimmed);
  if (trimmed.startsWith("<")) return parseXmlRecords(trimmed);
  return parseCsvRecords(trimmed);
}

// ---- Mapping a feed row to our product shape ----

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? scalar(value[0]) : "";
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["amount", "value", "url", "src", "link", "name", "title"]) {
      if (object[key] !== undefined) return scalar(object[key]);
    }
  }
  return "";
}

function first(record: RawRecord, keys: string[]): string {
  for (const key of keys) {
    const value = scalar(record[key]);
    if (value) return value;
  }
  return "";
}

const OUT_OF_STOCK = /out[\s_-]?of[\s_-]?stock|outofstock|unavailable|sold[\s_-]?out|نفد|غير متوفر/i;

export function mapFeedRecord(record: RawRecord): CleanProductInput | { error: string } {
  const name = first(record, ["name", "title", "product_name", "productname"]);
  const sale = parsePrice(first(record, ["sale_price", "saleprice"]));
  const regular = first(record, ["price", "regular_price", "regularprice", "amount"]);
  const priceSource = sale !== null && sale > 0 ? String(sale) : regular;

  let stockRaw = first(record, ["quantity", "stock", "stock_quantity", "stockquantity", "inventory", "inventory_quantity"]);
  const availability = first(record, ["availability", "stock_status", "stockstatus"]);
  if (!stockRaw && availability) stockRaw = OUT_OF_STOCK.test(availability) ? "0" : "-1";
  const stockNumber = stockRaw === "" ? -1 : Math.floor(Number(stockRaw));

  const status = first(record, ["status", "active", "published", "visible"]).toLowerCase();
  const inactive = ["inactive", "draft", "hidden", "false", "0", "private", "archived"].includes(status);

  const image = first(record, ["image_link", "image", "image_url", "imageurl", "images", "picture", "thumbnail"]).replace(/^http:\/\//i, "https://");

  const cleaned = cleanProductInput({
    externalId: first(record, ["id", "product_id", "productid", "external_id", "externalid", "sku", "handle"]),
    name,
    description: first(record, ["description", "desc", "body", "body_html", "summary", "short_description"]).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    price: priceSource,
    imageUrl: image,
    productUrl: first(record, ["link", "url", "product_url", "producturl", "permalink"]),
    category: first(record, ["product_type", "category", "categories", "type"]),
    sku: first(record, ["sku", "mpn"]),
    stock: Number.isFinite(stockNumber) && stockNumber >= -1 ? stockNumber : -1,
    active: !inactive
  });
  return cleaned.ok ? cleaned.data : { error: cleaned.error };
}

function fallbackExternalId(product: CleanProductInput): string {
  return `h-${createHash("sha1").update(`${product.name}|${product.productUrl}`).digest("hex").slice(0, 24)}`;
}

export type FeedSyncResult = { created: number; updated: number; skipped: number; deactivated: number; total: number; blockedByPlan?: number };

export async function importFeedRecords(tenantId: string, records: RawRecord[], source: "feed" | "api" = "feed"): Promise<FeedSyncResult & { seen: Set<string> }> {
  const result = { created: 0, updated: 0, skipped: 0, deactivated: 0, blockedByPlan: 0, total: Math.min(records.length, MAX_PRODUCTS_PER_SYNC) };
  const seen = new Set<string>();

  for (const record of records.slice(0, MAX_PRODUCTS_PER_SYNC)) {
    const mapped = mapFeedRecord(record);
    if ("error" in mapped) { result.skipped += 1; continue; }
    const product = { ...mapped, externalId: mapped.externalId || fallbackExternalId(mapped) };
    try {
      const { created } = await upsertProductByExternalId(tenantId, source, product);
      seen.add(product.externalId);
      if (created) result.created += 1; else result.updated += 1;
    } catch (error) {
      // Past the plan's product cap: existing products keep updating, new ones are skipped.
      if (!(error instanceof PlanLimitError)) throw error;
      result.skipped += 1;
      result.blockedByPlan += 1;
    }
  }
  return { ...result, seen };
}

/**
 * One full sync of a tenant's feed URL. Products that were previously
 * imported from the feed but are no longer in it are hidden (not deleted),
 * so old orders still point at a real product row - but only when this run
 * actually read at least one valid product, so a broken/empty feed can never
 * wipe the catalog.
 */
export async function syncProductFeed(tenantId: string): Promise<FeedSyncResult> {
  await ensureSchema();
  const settings = await prisma.catalogSetting.findUnique({ where: { tenantId } });
  const feedUrl = settings?.feedUrl?.trim();
  if (!feedUrl) throw new FeedError("لم يتم تحديد رابط ملف المنتجات");

  const now = () => new Date().toISOString();
  try {
    const records = parseFeed(await fetchFeedText(feedUrl));
    const imported = await importFeedRecords(tenantId, records, "feed");

    let deactivated = 0;
    if (imported.seen.size > 0) {
      const stale = await prisma.product.updateMany({
        where: { tenantId, source: "feed", active: 1, externalId: { notIn: [...imported.seen] } },
        data: { active: 0, updatedAt: now() }
      });
      deactivated = stale.count;
    }

    const { seen: _seen, ...summary } = imported;
    void _seen;
    const result = { ...summary, deactivated };
    await prisma.catalogSetting.update({
      where: { tenantId },
      data: {
        feedLastSyncedAt: now(),
        feedLastStatus: "ok",
        feedLastMessage: `تمت المزامنة: ${result.created} جديد، ${result.updated} محدّث، ${result.skipped} متجاهل، ${deactivated} مخفي${result.blockedByPlan ? ` — لم تُضَف ${result.blockedByPlan} منتجًا لأن باقتك لا تتيح المزيد (أو الكتالوج غير متاح فيها). رقِّ الباقة أو تواصل معنا.` : ""}`
      }
    });
    return result;
  } catch (error) {
    const message = error instanceof FeedError ? error.message : error instanceof SyntaxError ? "ملف JSON غير صالح" : "تعذر مزامنة الملف";
    if (!(error instanceof FeedError) && !(error instanceof SyntaxError)) console.error(`Product feed sync failed for ${tenantId}`, error);
    await prisma.catalogSetting.update({
      where: { tenantId },
      data: { feedLastSyncedAt: now(), feedLastStatus: "error", feedLastMessage: message }
    }).catch(() => {});
    throw error instanceof FeedError ? error : new FeedError(message);
  }
}

/** Cron entry point: re-syncs every tenant whose feed is due, a small batch per tick. */
export async function syncDueProductFeeds(): Promise<{ synced: number; failed: number }> {
  await ensureSchema();
  const candidates = await prisma.catalogSetting.findMany({
    where: { feedUrl: { not: "" } },
    orderBy: { feedLastSyncedAt: "asc" },
    take: 50
  });
  const nowMs = Date.now();
  const due = candidates.filter((setting) => {
    if (!setting.feedLastSyncedAt) return true;
    const last = new Date(setting.feedLastSyncedAt).getTime();
    return Number.isNaN(last) || nowMs - last >= Math.max(15, setting.feedIntervalMinutes) * 60_000;
  }).slice(0, 10);

  let synced = 0;
  let failed = 0;
  for (const setting of due) {
    try {
      await syncProductFeed(setting.tenantId);
      synced += 1;
    } catch {
      failed += 1;
    }
  }
  return { synced, failed };
}
