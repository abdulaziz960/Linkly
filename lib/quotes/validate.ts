import { isValidEmail } from "../validation";
import { BILLING_CYCLES, DEFAULT_PAYMENT_TERMS, DEFAULT_VALIDITY_DAYS, DEFAULT_VAT_RATE, sarToHalalas, type QuoteLineInput } from "./model";
import type { QuoteInput } from "./store";

const MAX_LOGO_BYTES = 400_000;
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** The quote the admin panel sends, checked and cleaned. Anything wrong comes back as an Arabic message. */
export function parseQuoteInput(body: unknown, options: { forSending?: boolean } = {}): { ok: true; input: QuoteInput } | { ok: false; error: string } {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const customerName = text(raw.customerName, 120);
  if (customerName.length < 2) return { ok: false, error: "اسم العميل مطلوب" };
  const email = text(raw.email, 160).toLowerCase();
  if (email && !isValidEmail(email)) return { ok: false, error: "البريد الإلكتروني غير صحيح" };
  if (options.forSending && !email) return { ok: false, error: "أدخل بريد العميل قبل الإرسال" };

  const logoDataUrl = typeof raw.logoDataUrl === "string" ? raw.logoDataUrl.trim() : "";
  if (logoDataUrl && (!LOGO_PATTERN.test(logoDataUrl) || logoDataUrl.length > MAX_LOGO_BYTES * 1.4)) return { ok: false, error: "شعار العميل غير صالح (PNG أو JPG أو WebP أو SVG حتى 400 كيلوبايت)" };

  const billingCycle = (BILLING_CYCLES as readonly string[]).includes(String(raw.billingCycle)) ? (raw.billingCycle as "شهري" | "سنوي") : "شهري";
  const validityDays = Math.min(60, Math.max(1, Math.round(Number(raw.validityDays) || DEFAULT_VALIDITY_DAYS)));

  if (!Array.isArray(raw.lines) || !raw.lines.length) return { ok: false, error: "أضف خدمة واحدة على الأقل" };
  if (raw.lines.length > 20) return { ok: false, error: "الحد الأقصى 20 بندًا" };
  const lines: QuoteLineInput[] = [];
  for (const entry of raw.lines) {
    const line = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const name = text(line.name, 200);
    if (!name) return { ok: false, error: "اسم البند مطلوب" };
    const quantity = Math.round(Number(line.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1_000_000) return { ok: false, error: `كمية غير صحيحة في «${name}»` };
    const unitPriceHalalas = typeof line.unitPriceHalalas === "number" ? Math.round(line.unitPriceHalalas) : sarToHalalas(Number(line.unitPriceSar));
    if (!Number.isFinite(unitPriceHalalas) || unitPriceHalalas < 0 || unitPriceHalalas > 100_000_000_00) return { ok: false, error: `سعر غير صحيح في «${name}»` };
    const vatRate = Number(line.vatRate ?? DEFAULT_VAT_RATE);
    if (![0, DEFAULT_VAT_RATE].includes(vatRate)) return { ok: false, error: "نسبة الضريبة المسموحة 0% أو 15%" };
    const fieldsRaw = (line.fields && typeof line.fields === "object" ? line.fields : {}) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fieldsRaw).slice(0, 20)) if (/^\w{1,40}$/.test(key)) fields[key] = text(value, 120);
    lines.push({ serviceId: text(line.serviceId, 80), name, description: text(line.description, 500), quantity, unitPriceHalalas, vatRate, fields });
  }

  const terms = Array.isArray(raw.terms) ? raw.terms.map((term) => text(term, 400)).filter(Boolean).slice(0, 20) : [];
  return {
    ok: true,
    input: {
      customerName, contactName: text(raw.contactName, 120), email, phone: text(raw.phone, 40), vatNumber: text(raw.vatNumber, 30), address: text(raw.address, 300), logoDataUrl,
      billingCycle, validityDays, eyebrow: text(raw.eyebrow, 100), headline: text(raw.headline, 140), subtitle: text(raw.subtitle, 300), terms,
      paymentTerms: text(raw.paymentTerms, 120) || DEFAULT_PAYMENT_TERMS, salesperson: text(raw.salesperson, 80), planName: text(raw.planName, 80), lines
    }
  };
}
