import { writeFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { renderReceiptPdf } from "../lib/order-receipt";

describe("order receipt PDF", () => {
  it("produces a valid one-page PDF with the receipt drawn as an image", async () => {
    const pdf = await renderReceiptPdf({
      merchantName: "مؤسسة الأمل للتجارة",
      orderId: "ord-1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      customerName: "سارة العتيبي",
      productName: "ساعة ذكية",
      quantity: 2,
      unitPrice: 349,
      total: 698,
      currency: "SAR",
      paidAtIso: "2026-10-14T09:00:00.000Z"
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const text = pdf.toString("latin1");
    expect(text).toContain("/DCTDecode");
    expect(text).toContain("/Count 1");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf.length).toBeGreaterThan(20_000);
    if (process.env.KEEP_RECEIPT) writeFileSync(join(process.cwd(), "receipt-sample.pdf"), pdf);
  }, 30_000);
});
