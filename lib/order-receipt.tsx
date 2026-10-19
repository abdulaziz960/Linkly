import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { shortOrderNumber } from "./order-number";

/**
 * A one-page payment receipt (PDF) for a paid catalog order.
 *
 * The page is drawn with the same renderer the site's social image uses, which
 * already shapes Arabic correctly with the bundled Tajawal fonts, then embedded
 * as an image in a minimal PDF - no PDF library or browser is needed on the
 * server. Every line is a single-line block (the renderer's right-to-left
 * support is unreliable for wrapped paragraphs), so long values are trimmed.
 *
 * It is a payment receipt, not a tax invoice, and says so.
 */

export type ReceiptData = {
  merchantName: string;
  orderId: string;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
  paidAtIso: string;
  /** The lines of a cart order; absent for an order of one product. */
  items?: Array<{ name: string; quantity: number; unitPrice: number }>;
  /** The discount code used: `total` is already after it. */
  discount?: { code: string; amount: number };
  /** Delivery: `total` already includes its fee. */
  shipping?: { name: string; city: string; fee: number };
};

const PAGE_PX = { width: 1240, height: 1754 }; // A5 at ~212 dpi
const PAGE_PT = { width: 420, height: 595 }; // A5 in PDF points

/**
 * The renderer shapes each Arabic word correctly but lays the words of a line
 * out left-to-right, so a multi-word line reads backwards. Reversing the word
 * order (numbers and Latin tokens stay intact) restores the right-to-left order.
 */
function rtl(value: string) {
  return value.split(" ").filter(Boolean).reverse().join(" ");
}

function trim(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function money(amount: number, currency: string) {
  const rounded = Math.round(amount * 100) / 100;
  const value = rounded.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits: 2 });
  // "ر.س" (the dotted abbreviation) comes out reversed in the renderer: the word reads right.
  return `${value} ${currency === "SAR" ? "ريال" : currency}`;
}

function receiptDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date);
}

const MAX_RECEIPT_ITEM_ROWS = 7;

/** One row per product of a cart order ("name × quantity" and the line total); a long cart ends with "and N more". */
export function receiptItemRows(items: Array<{ name: string; quantity: number; unitPrice: number }>, currency: string): Array<[string, string]> {
  const rows: Array<[string, string]> = items.slice(0, MAX_RECEIPT_ITEM_ROWS).map((item) => [`${trim(item.name, 22)} × ${item.quantity}`, money(Math.round(item.unitPrice * item.quantity * 100) / 100, currency)]);
  if (items.length > MAX_RECEIPT_ITEM_ROWS) rows.push(["…", `و${items.length - MAX_RECEIPT_ITEM_ROWS} منتجات أخرى`]);
  return rows;
}

const COLORS = { brand: "#0f6b5c", brandSoft: "#eaf3f1", ink: "#10231f", muted: "#5b716c", line: "#e3ecea", good: "#14804a" };

export async function renderReceiptPng(data: ReceiptData): Promise<Buffer> {
  const [regular, black] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/tajawal/Tajawal-Medium.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/tajawal/Tajawal-Black.ttf"))
  ]);

  const lines = data.items && data.items.length > 0
    ? data.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice }))
    : [{ name: data.productName, quantity: data.quantity, unitPrice: data.unitPrice }];
  const shown = lines.slice(0, 7);
  const hidden = lines.length - shown.length;
  const productsTotal = Math.round(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) * 100) / 100;
  const shippingFee = data.shipping?.fee ?? 0;
  const discountAmount = data.discount?.amount ?? 0;

  // One row of the receipt: the amount on the left, what it is for on the right (the renderer lays a row out left to right).
  const row = (label: string, value: string, options: { color?: string; bold?: boolean; sub?: string; small?: boolean } = {}) => (
    <div key={label} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: "20px 0", borderBottom: `2px solid ${COLORS.line}` }}>
      <div style={{ display: "flex", fontSize: 38, fontWeight: options.bold ? 900 : 500, color: options.color ?? COLORS.ink }}>{rtl(value)}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <div style={{ display: "flex", fontSize: options.small ? 32 : 36, color: options.small ? COLORS.ink : COLORS.muted, fontWeight: options.small ? 900 : 500 }}>{rtl(label)}</div>
        {options.sub ? <div style={{ display: "flex", fontSize: 28, color: COLORS.muted, marginTop: 4 }}>{rtl(options.sub)}</div> : null}
      </div>
    </div>
  );

  const element = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", color: COLORS.ink, fontFamily: "Tajawal", direction: "rtl" }}>
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", background: COLORS.brand, padding: "70px 80px" }}>
        <div style={{ display: "flex", justifyContent: "center", flexShrink: 0, minWidth: 250, padding: "12px 34px", borderRadius: 999, background: "#ffffff", color: COLORS.brand, fontSize: 36, fontWeight: 900, whiteSpace: "nowrap" }}>{rtl("إيصال دفع")}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 900, color: "#ffffff" }}>{rtl(trim(data.merchantName, 24))}</div>
          <div style={{ display: "flex", fontSize: 32, color: "#cfe7e2", marginTop: 8 }}>{rtl(`رقم الطلب ${shortOrderNumber(data.orderId)}`)}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", padding: "40px 80px 0" }}>
        {row("العميل", trim(data.customerName || "—", 30))}
        {row("التاريخ", receiptDate(data.paidAtIso))}
        {data.shipping ? row("التوصيل إلى", trim(data.shipping.city, 20), { sub: trim(data.shipping.name, 24) }) : null}

        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 34, padding: "16px 24px", borderRadius: 16, background: COLORS.brandSoft }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 900, color: COLORS.brand }}>{rtl("المجموع")}</div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 900, color: COLORS.brand }}>{rtl("المنتج")}</div>
        </div>
        {shown.map((line) => row(trim(line.name, 38), money(Math.round(line.unitPrice * line.quantity * 100) / 100, data.currency), { bold: true, small: true, sub: `${line.quantity} × ${money(line.unitPrice, data.currency)}` }))}
        {hidden > 0 ? row(`و${hidden} منتجات أخرى`, "…") : null}

        <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
          {discountAmount > 0 || shippingFee > 0 || data.shipping ? row("المجموع قبل الخصم والتوصيل", money(productsTotal, data.currency)) : null}
          {data.discount ? row(`الخصم (${trim(data.discount.code, 14)})`, `-${money(discountAmount, data.currency)}`, { color: COLORS.good, bold: true }) : null}
          {data.shipping ? row("رسوم التوصيل", shippingFee > 0 ? money(shippingFee, data.currency) : "مجاني") : null}
        </div>

        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 34, padding: "34px 40px", borderRadius: 24, background: COLORS.brand }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 900, color: "#ffffff" }}>{rtl(money(data.total, data.currency))}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 42, fontWeight: 900, color: "#ffffff" }}>{rtl("المبلغ المدفوع")}</div>
            <div style={{ display: "flex", fontSize: 28, color: "#cfe7e2", marginTop: 4 }}>{rtl("تم استلام الدفع")}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", padding: "0 80px 70px", color: COLORS.muted, fontSize: 30 }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 900, color: COLORS.brand, marginBottom: 14 }}>{rtl("شكرًا لتسوقك معنا")}</div>
        <div style={{ display: "flex" }}>{rtl("هذا إيصال دفع إلكتروني وليس فاتورة ضريبية.")}</div>
        <div style={{ display: "flex", marginTop: 6 }}>{rtl("صدر عبر Linkly")}</div>
      </div>
    </div>
  );

  const response = new ImageResponse(element, {
    width: PAGE_PX.width,
    height: PAGE_PX.height,
    fonts: [
      { name: "Tajawal", data: regular, weight: 500, style: "normal" },
      { name: "Tajawal", data: black, weight: 900, style: "normal" }
    ]
  });
  return Buffer.from(await response.arrayBuffer());
}

/** Wraps one JPEG as a single-page PDF (A5). */
export function jpegToPdf(jpeg: Buffer, widthPx: number, heightPx: number): Buffer {
  const content = Buffer.from(`q ${PAGE_PT.width} 0 0 ${PAGE_PT.height} 0 0 cm /Im0 Do Q`, "latin1");
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (buffer: Buffer) => {
    parts.push(buffer);
    length += buffer.length;
  };
  const object = (id: number, body: Buffer | string) => {
    offsets[id] = length;
    push(Buffer.from(`${id} 0 obj\n`, "latin1"));
    push(typeof body === "string" ? Buffer.from(body, "latin1") : body);
    push(Buffer.from("\nendobj\n", "latin1"));
  };

  push(Buffer.from("%PDF-1.4\n", "latin1"));
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_PT.width} ${PAGE_PT.height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  object(4, Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "latin1"), content, Buffer.from("\nendstream", "latin1")]));
  object(
    5,
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, "latin1"),
      jpeg,
      Buffer.from("\nendstream", "latin1")
    ])
  );

  const xrefAt = length;
  const entries = [0, 1, 2, 3, 4, 5].map((id) => (id === 0 ? "0000000000 65535 f \n" : `${String(offsets[id]).padStart(10, "0")} 00000 n \n`));
  push(Buffer.from(`xref\n0 6\n${entries.join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}

export async function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  const png = await renderReceiptPng(data);
  const jpeg = await sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  return jpegToPdf(jpeg, PAGE_PX.width, PAGE_PX.height);
}
