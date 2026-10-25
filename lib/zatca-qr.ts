// The QR code of a tax invoice in the form ZATCA specifies for simplified invoices: five fields (seller name, seller VAT number,
// invoice time, total with VAT, VAT amount), each written as tag - length - value bytes, the whole run Base64 encoded.

import QRCode from "qrcode";

export type ZatcaQrFields = { sellerName: string; vatNumber: string; timestamp: string | Date; total: number; vat: number };

function tlv(tag: number, value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > 255) throw new Error("QR field too long");
  return Buffer.concat([Buffer.from([tag, bytes.length]), bytes]);
}

/** ISO 8601 UTC without milliseconds, e.g. 2026-10-25T15:30:00Z. */
export function zatcaTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().replace(/\.\d{3}Z$/, "Z") : date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function zatcaQrPayload(fields: ZatcaQrFields): string {
  return Buffer.concat([
    tlv(1, fields.sellerName),
    tlv(2, fields.vatNumber),
    tlv(3, zatcaTimestamp(fields.timestamp)),
    tlv(4, fields.total.toFixed(2)),
    tlv(5, fields.vat.toFixed(2))
  ]).toString("base64");
}

/** The QR as an SVG string (rendered on the server, no image file needed). */
export async function zatcaQrSvg(fields: ZatcaQrFields): Promise<string> {
  return QRCode.toString(zatcaQrPayload(fields), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
