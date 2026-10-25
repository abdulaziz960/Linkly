// The customer's own tax details for the invoices Linkly issues to them: their VAT registration number (15 digits, starting and
// ending with 3 in Saudi Arabia) and address. Optional - a customer without a VAT number still gets an invoice.

import { prisma } from "./prisma";

export type TaxProfile = { vatNumber: string; address: string };

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS tenant_tax_profile (
    tenant_id TEXT PRIMARY KEY,
    vat_number TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`).then(() => undefined).catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** Pure: Arabic and Latin digits, spaces dropped. */
export function normalizeVatNumber(value: unknown): string {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\s+/g, "");
}

/** A Saudi VAT number is 15 digits that start and end with 3. */
export function isValidVatNumber(value: string): boolean {
  return /^3\d{13}3$/.test(value);
}

export async function getTaxProfile(tenantId: string): Promise<TaxProfile> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ vat_number: string; address: string }>>`SELECT vat_number, address FROM tenant_tax_profile WHERE tenant_id = ${tenantId} LIMIT 1`;
  return { vatNumber: rows[0]?.vat_number ?? "", address: rows[0]?.address ?? "" };
}

export async function saveTaxProfile(tenantId: string, input: { vatNumber?: unknown; address?: unknown }): Promise<{ ok: true; profile: TaxProfile } | { ok: false; error: string }> {
  const vatNumber = normalizeVatNumber(input.vatNumber);
  if (vatNumber && !isValidVatNumber(vatNumber)) return { ok: false, error: "الرقم الضريبي يتكون من 15 رقمًا ويبدأ وينتهي بالرقم 3" };
  const address = String(input.address ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  await ensureTable();
  const now = new Date().toISOString();
  await prisma.$executeRaw`INSERT INTO tenant_tax_profile (tenant_id, vat_number, address, updated_at) VALUES (${tenantId}, ${vatNumber}, ${address}, ${now}) ON CONFLICT (tenant_id) DO UPDATE SET vat_number = ${vatNumber}, address = ${address}, updated_at = ${now}`;
  return { ok: true, profile: { vatNumber, address } };
}
