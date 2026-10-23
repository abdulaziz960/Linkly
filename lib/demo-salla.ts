// The fake Salla store of a demo workspace. sallaRequest (lib/salla.ts) hands the request here instead of calling Salla, so the
// real parsing code runs on payloads shaped like Salla's, and the reviewer's changes (status, shipment, address, new order) stay
// inside the demo workspace's own rows.

import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";

type Json = Record<string, unknown>;
type Reply = { ok: boolean; status: number; payload: Json };

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

const STATUSES = [
  { slug: "under_review", name: "قيد المراجعة" },
  { slug: "in_progress", name: "قيد التنفيذ" },
  { slug: "completed", name: "مكتمل" },
  { slug: "delivering", name: "قيد التوصيل" },
  { slug: "delivered", name: "تم التوصيل" },
  { slug: "shipped", name: "تم الشحن" },
  { slug: "canceled", name: "ملغي" }
];

const STATUS_NAME = new Map(STATUSES.map((status) => [status.slug, status.name]));

const COMPANIES = [
  { id: "9001", name: "سمسا", activation_type: "api" },
  { id: "9002", name: "أرامكس", activation_type: "api" }
];
const BRANCHES = [{ id: "7001", name: "الفرع الرئيسي - الرياض" }, { id: "7002", name: "فرع جدة" }];
const PRODUCTS = [
  { id: "5001", name: "قميص قطن", sku: "SH-01", price: { amount: 149, currency: "SAR" } },
  { id: "5002", name: "حقيبة جلد", sku: "BG-02", price: { amount: 320, currency: "SAR" } },
  { id: "5003", name: "ساعة كلاسيك", sku: "WT-03", price: { amount: 450, currency: "SAR" } }
];
const COUNTRIES = [{ id: "1", name: "السعودية", name_en: "Saudi Arabia", code: "SA" }];
const CITIES = [{ id: "11", name: "الرياض", name_en: "Riyadh" }, { id: "12", name: "جدة", name_en: "Jeddah" }, { id: "13", name: "الدمام", name_en: "Dammam" }];
const DISTRICTS = [{ id: "111", name: "العليا", name_en: "Olaya" }, { id: "112", name: "الملقا", name_en: "Malqa" }];

type Row = { id: string; reference: string; status_slug: string; customer_name: string; customer_phone: string; total: number; items_json: string; address_json: string; company: string; tracking_number: string };

const SAMPLE_ADDRESS = { name: "", street: "طريق الملك فهد", city: "الرياض", country_code: "SA", block: "العليا", street_number: "12", short_address: "RRRD2929", building_number: "2929", additional_number: "8888", postal_code: "12611", geo_coordinates: { lat: "24.7136", lng: "46.6753" } };

/** A few believable orders for a new demo workspace. */
export async function seedDemoSallaOrders(tenantId: string, customers: Array<{ name: string; phone: string }>) {
  await ensureTables();
  const now = Date.now();
  const rows = [
    { slug: "under_review", total: 349, items: [{ name: "قميص قطن", quantity: 2, price: 149 }, { name: "حقيبة جلد", quantity: 1, price: 51 }] },
    { slug: "in_progress", total: 450, items: [{ name: "ساعة كلاسيك", quantity: 1, price: 450 }] },
    { slug: "shipped", total: 298, items: [{ name: "قميص قطن", quantity: 2, price: 149 }], company: "سمسا", tracking: "SMSA-88213" },
    { slug: "completed", total: 320, items: [{ name: "حقيبة جلد", quantity: 1, price: 320 }] }
  ];
  for (const [index, row] of rows.entries()) {
    const customer = customers[index % customers.length];
    const reference = String(230041 - index);
    await prisma.$executeRaw`INSERT INTO demo_salla_orders (tenant_id, id, reference, status_slug, customer_name, customer_phone, total, items_json, address_json, company, tracking_number, created_at) VALUES (${tenantId}, ${`demo-${reference}`}, ${reference}, ${row.slug}, ${customer.name}, ${customer.phone}, ${row.total}, ${JSON.stringify(row.items)}, ${JSON.stringify({ ...SAMPLE_ADDRESS, name: customer.name })}, ${row.company ?? ""}, ${row.tracking ?? ""}, ${new Date(now - index * 3_600_000).toISOString()})`;
  }
}

function orderPayload(row: Row, detail = false): Json {
  const items = JSON.parse(row.items_json) as Array<{ name: string; quantity: number; price: number }>;
  const [first = "", ...rest] = row.customer_name.split(" ");
  const phone = row.customer_phone.replace(/^966/, "");
  const base: Json = {
    id: row.id,
    reference_id: row.reference,
    status: { slug: row.status_slug, name: STATUS_NAME.get(row.status_slug) ?? row.status_slug },
    customer: { first_name: first, last_name: rest.join(" "), mobile: phone, mobile_code: "+966", email: "customer@example.com" },
    total: { amount: row.total, currency: "SAR" },
    payment_method: "mada",
    ...(row.tracking_number || row.company ? { shipments: [{ tracking_number: row.tracking_number, courier_name: row.company, tracking_link: row.tracking_number ? `https://track.example.com/${row.tracking_number}` : "" }] } : {})
  };
  if (!detail) return base;
  const address = JSON.parse(row.address_json) as Json;
  return {
    ...base,
    receiver: { name: row.customer_name, email: "customer@example.com", phone, country_code: "+966" },
    shipping: { address },
    items: items.map((item, index) => ({ id: `i${index}`, name: item.name, sku: `SKU-${index + 1}`, quantity: item.quantity, weight: 1, amounts: { price_without_tax: { amount: item.price, currency: "SAR" } } }))
  };
}

async function rowsOf(tenantId: string): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`SELECT id, reference, status_slug, customer_name, customer_phone, total, items_json, address_json, company, tracking_number FROM demo_salla_orders WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
}

const ok = (data: unknown): Reply => ({ ok: true, status: 200, payload: { data } });
const notFound: Reply = { ok: false, status: 404, payload: { error: { message: "not found" } } };

/** Answers a Salla Admin API call for a demo workspace. */
export async function demoSallaRequest(tenantId: string, method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<Reply> {
  await ensureTables();
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const payload = (body && typeof body === "object" ? body : {}) as Json;

  if (method === "GET") {
    if (pathname === "/orders/statuses") return ok(STATUSES);
    if (pathname === "/shipping/companies") return ok(COMPANIES);
    if (pathname === "/branches") return ok(BRANCHES);
    if (pathname === "/products") {
      const keyword = (params.get("keyword") ?? "").toLowerCase();
      return ok(PRODUCTS.filter((product) => !keyword || product.name.toLowerCase().includes(keyword)));
    }
    if (pathname === "/countries") return ok(COUNTRIES);
    if (/^\/countries\/\d+\/cities$/.test(pathname)) return ok(CITIES);
    if (/^\/cities\/\d+\/districts$/.test(pathname)) return ok(DISTRICTS);
    if (pathname === "/orders/items") return ok([]);
    if (pathname === "/orders") {
      const reference = params.get("reference_id");
      const rows = (await rowsOf(tenantId)).filter((row) => !reference || row.reference === reference);
      return ok(rows.map((row) => orderPayload(row)));
    }
    const single = /^\/orders\/([^/]+)$/.exec(pathname);
    if (single) {
      const row = (await rowsOf(tenantId)).find((entry) => entry.id === decodeURIComponent(single[1]));
      return row ? ok(orderPayload(row, true)) : notFound;
    }
    return notFound;
  }

  if (method === "POST") {
    const status = /^\/orders\/([^/]+)\/status$/.exec(pathname);
    if (status) {
      const slug = String(payload.slug ?? "");
      if (!STATUS_NAME.has(slug)) return { ok: false, status: 422, payload: { error: { message: "حالة غير معروفة" } } };
      const changed = await prisma.$executeRaw`UPDATE demo_salla_orders SET status_slug = ${slug} WHERE tenant_id = ${tenantId} AND id = ${decodeURIComponent(status[1])}`;
      return changed ? ok({}) : notFound;
    }
    if (pathname === "/shipments") {
      const orderId = String(payload.order_id ?? "");
      const company = COMPANIES.find((entry) => entry.id === String(payload.courier_id ?? ""))?.name ?? COMPANIES[0].name;
      const tracking = `DEMO-${randomUUID().slice(0, 6).toUpperCase()}`;
      const changed = await prisma.$executeRaw`UPDATE demo_salla_orders SET status_slug = 'shipped', company = ${company}, tracking_number = ${tracking} WHERE tenant_id = ${tenantId} AND id = ${orderId}`;
      return changed ? ok({ id: `ship-${tracking}`, tracking_number: tracking, tracking_link: `https://track.example.com/${tracking}`, status: "created" }) : notFound;
    }
    if (pathname === "/orders") {
      const reference = String(230100 + Math.floor(Math.random() * 800));
      const id = `demo-${reference}`;
      const customer = (payload.customer && typeof payload.customer === "object" ? payload.customer : {}) as Json;
      const name = String(customer.first_name ?? "عميل ديمو");
      const phone = `${String(customer.country_code ?? "966").replace(/\D/g, "")}${String(customer.mobile ?? "").replace(/\D/g, "")}`;
      const lines = Array.isArray(payload.products) ? payload.products as Array<Json> : [];
      const items = lines.map((line) => {
        const product = PRODUCTS.find((entry) => entry.id === String(line.id));
        return { name: product?.name ?? "منتج", quantity: Math.max(1, Number(line.quantity) || 1), price: product?.price.amount ?? 0 };
      });
      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      await prisma.$executeRaw`INSERT INTO demo_salla_orders (tenant_id, id, reference, status_slug, customer_name, customer_phone, total, items_json, address_json, created_at) VALUES (${tenantId}, ${id}, ${reference}, 'under_review', ${name}, ${phone}, ${total}, ${JSON.stringify(items)}, ${JSON.stringify({ ...SAMPLE_ADDRESS, name })}, ${new Date().toISOString()})`;
      return ok({ id, reference_id: reference, urls: { customer: `https://demo-store.example.com/order/${reference}` } });
    }
    return notFound;
  }

  // PUT /orders/{id}: the recipient / address edit.
  const edit = /^\/orders\/([^/]+)$/.exec(pathname);
  if (edit) {
    const id = decodeURIComponent(edit[1]);
    const row = (await rowsOf(tenantId)).find((entry) => entry.id === id);
    if (!row) return notFound;
    const shipTo = (payload.ship_to && typeof payload.ship_to === "object" ? payload.ship_to : {}) as Json;
    const merged = { ...(JSON.parse(row.address_json) as Json), ...shipTo };
    await prisma.$executeRaw`UPDATE demo_salla_orders SET address_json = ${JSON.stringify(merged)} WHERE tenant_id = ${tenantId} AND id = ${id}`;
    return ok({});
  }
  return notFound;
}
