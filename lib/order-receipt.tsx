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
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${value} ${currency === "SAR" ? "ر.س" : currency}`;
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

export async function renderReceiptPng(data: ReceiptData): Promise<Buffer> {
  const [regular, black] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/tajawal/Tajawal-Medium.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/tajawal/Tajawal-Black.ttf"))
  ]);

  const rows: Array<[string, string]> = [
    ["رقم الطلب", shortOrderNumber(data.orderId)],
    ["العميل", trim(data.customerName || "—", 34)],
    ...(data.items && data.items.length > 0
      ? receiptItemRows(data.items, data.currency)
      : ([
          ["المنتج", trim(data.productName, 34)],
          ...(data.quantity > 1 ? ([["الكمية", String(data.quantity)], ["سعر الوحدة", money(data.unitPrice, data.currency)]] as Array<[string, string]>) : [])
        ] as Array<[string, string]>)),
    ...(data.discount ? ([["الخصم", `-${money(data.discount.amount, data.currency)} (${trim(data.discount.code, 14)})`]] as Array<[string, string]>) : []),
    ["التاريخ", receiptDate(data.paidAtIso)],
    ["حالة الدفع", "مدفوع"]
  ];

  const element = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", color: "#10231f", fontFamily: "Tajawal", direction: "rtl", padding: 90 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingBottom: 40, borderBottom: "4px solid #0f6b5c" }}>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 900 }}>{rtl(trim(data.merchantName, 28))}</div>
        <div style={{ display: "flex", fontSize: 44, marginTop: 14, color: "#0f6b5c", fontWeight: 900 }}>{rtl("إيصال دفع")}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", direction: "rtl", padding: "28px 0", borderBottom: "2px solid #e3ecea" }}>
            {/* The renderer lays a row out left-to-right: details first (left), the item's name last (right). */}
            <div style={{ display: "flex", fontSize: 42, fontWeight: 900 }}>{rtl(value)}</div>
            <div style={{ display: "flex", fontSize: 40, color: "#5b716c" }}>{rtl(label)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", direction: "rtl", marginTop: 56, padding: "38px 40px", borderRadius: 28, background: "#eaf3f1" }}>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 900, color: "#0f6b5c" }}>{rtl(money(data.total, data.currency))}</div>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 900 }}>{rtl("المبلغ المدفوع")}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginTop: "auto", color: "#5b716c", fontSize: 32 }}>
        <div style={{ display: "flex" }}>{rtl("هذا إيصال دفع إلكتروني وليس فاتورة ضريبية.")}</div>
        <div style={{ display: "flex", marginTop: 8 }}>{rtl("صدر عبر Linkly")}</div>
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
