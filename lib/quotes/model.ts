// Quotations (عروض الأسعار): the shared rules - statuses, totals and what a service suggests. No I/O here.
// Money is kept in halalas (1 SAR = 100) so totals never drift.

export const QUOTE_STATUSES = ["draft", "sent", "approved", "cancelled", "needs_changes"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "مسودة",
  sent: "مُرسل",
  approved: "معتمد",
  cancelled: "ملغي",
  needs_changes: "يحتاج تعديل"
};

export const DEFAULT_VAT_RATE = 15;
export const DEFAULT_VALIDITY_DAYS = 7;
export const DEFAULT_PAYMENT_TERMS = "سداد فوري";
export const BILLING_CYCLES = ["شهري", "سنوي"] as const;
export type QuoteBillingCycle = (typeof BILLING_CYCLES)[number];

export type QuoteLineInput = {
  serviceId: string;
  name: string;
  /** The grey line under the service name. */
  description: string;
  quantity: number;
  unitPriceHalalas: number;
  vatRate: number;
  /** What the service asked for (message count, fees...), kept so the line can be edited again. */
  fields: Record<string, string>;
};

export type QuoteTotals = { subtotalHalalas: number; vatHalalas: number; totalHalalas: number };

/** Totals from the lines: each line's VAT is rounded to the halala, then added up. */
export function quoteTotals(lines: Array<Pick<QuoteLineInput, "quantity" | "unitPriceHalalas" | "vatRate">>): QuoteTotals {
  let subtotalHalalas = 0;
  let vatHalalas = 0;
  for (const line of lines) {
    const net = Math.max(0, Math.round(line.quantity)) * Math.max(0, Math.round(line.unitPriceHalalas));
    subtotalHalalas += net;
    vatHalalas += Math.round((net * Math.max(0, line.vatRate)) / 100);
  }
  return { subtotalHalalas, vatHalalas, totalHalalas: subtotalHalalas + vatHalalas };
}

export function halalasToSar(halalas: number): number {
  return Math.round(halalas) / 100;
}

export function sarToHalalas(sar: number): number {
  return Math.round(sar * 100);
}

/** "22,500" or "22,500.50": whole riyals without decimals. */
export function formatSar(halalas: number): string {
  const value = halalasToSar(halalas);
  return value.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 });
}

// ---- status machine ----

const ADMIN_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["cancelled"],
  needs_changes: ["draft", "cancelled"],
  approved: [],
  cancelled: []
};

/** What a person in the admin panel may do with a quote that is in `from`. (Sending again after changes goes through draft.) */
export function adminCanMove(from: QuoteStatus, to: QuoteStatus): boolean {
  return ADMIN_TRANSITIONS[from].includes(to);
}

export type ClientAnswer = "approve" | "request_changes" | "decline";
const CLIENT_RESULT: Record<ClientAnswer, QuoteStatus> = { approve: "approved", request_changes: "needs_changes", decline: "cancelled" };

/** The client can only answer a quote that was sent to them and has not expired. */
export function clientCanAnswer(status: QuoteStatus, validUntil: string, now = new Date()): boolean {
  return status === "sent" && !isExpired(validUntil, now);
}

export function statusAfterClientAnswer(answer: ClientAnswer): QuoteStatus {
  return CLIENT_RESULT[answer];
}

/** A quote is valid through the end of its last day (Riyadh time). */
export function isExpired(validUntil: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return false;
  return now.getTime() > new Date(`${validUntil}T23:59:59.999+03:00`).getTime();
}

/** yyyy-mm-dd, `days` after a day, in Riyadh time. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00+03:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Date(date.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function todayInRiyadh(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function formatQuoteNumber(sequence: number): string {
  return `Q-${String(sequence).padStart(5, "0")}`;
}

// ---- services ----

export type ServiceField = { key: string; label: string; type: "number" | "text"; defaultValue?: string; unit?: string };

export type QuoteServiceDef = {
  id: string;
  name: string;
  /** What the service suggests as the unit price; the person can change it. */
  defaultPriceHalalas: number;
  /** Text under the service name; {{key}} is replaced by the service's fields. */
  descriptionTemplate: string;
  /** The name of the line; {{key}} is replaced by the service's fields. */
  lineNameTemplate: string;
  fields: ServiceField[];
  /** Notes this service adds to the terms. */
  terms: string[];
  /** A fixed formula the service uses to suggest its price from its fields. */
  priceFormula: "" | "messages_times_fees";
  active: boolean;
  position: number;
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => values[key] ?? "").trim();
}

function number(value: string | undefined): number {
  const parsed = Number(String(value ?? "").replace(/[,،\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** The unit price a service suggests for what was filled in, in halalas. */
export function suggestedPriceHalalas(service: QuoteServiceDef, fields: Record<string, string>): number {
  if (service.priceFormula === "messages_times_fees") {
    return Math.round(number(fields.messages) * (number(fields.meta_fee) + number(fields.linkly_fee)) * 100);
  }
  return service.defaultPriceHalalas;
}

/** A line from a service and what was filled in: its name, description and suggested price. */
export function lineFromService(service: QuoteServiceDef, fields: Record<string, string>): QuoteLineInput {
  const values: Record<string, string> = { ...fields };
  if (values.messages) values.messages = number(values.messages).toLocaleString("en-US");
  return {
    serviceId: service.id,
    name: fill(service.lineNameTemplate || service.name, values) || service.name,
    description: fill(service.descriptionTemplate, values),
    quantity: 1,
    unitPriceHalalas: suggestedPriceHalalas(service, fields),
    vatRate: DEFAULT_VAT_RATE,
    fields
  };
}

export function defaultFieldValues(service: QuoteServiceDef): Record<string, string> {
  return Object.fromEntries(service.fields.map((field) => [field.key, field.defaultValue ?? ""]));
}

/** The services a fresh installation starts with (taken from the first quotation sent to a client). */
export const DEFAULT_QUOTE_SERVICES: Array<Omit<QuoteServiceDef, "id" | "position" | "active">> = [
  {
    name: "رسائل واتساب ترويجية",
    defaultPriceHalalas: 0,
    lineNameTemplate: "رسائل واتساب ترويجية إلى {{messages}} رقم",
    descriptionTemplate: "رسوم ميتا: {{meta_fee}} ريال للرسالة · خدمة لنكلي: {{linkly_fee}} ريال للرسالة",
    fields: [
      { key: "messages", label: "عدد الرسائل", type: "number", defaultValue: "75000" },
      { key: "meta_fee", label: "رسوم ميتا للرسالة (ريال)", type: "number", defaultValue: "0.216" },
      { key: "linkly_fee", label: "خدمة لنكلي للرسالة (ريال)", type: "number", defaultValue: "0.084" }
    ],
    priceFormula: "messages_times_fees",
    terms: [
      "السعر مخصص لرسالة ترويجية واحدة لكل رقم سعودي، وبحد مستهدف {{messages}} رسالة.",
      "يزود العميل لنكلي بالأرقام ومحتوى الرسالة، ويؤكد موافقة المستلمين على استقبال الرسائل الترويجية.",
      "تتم تسوية تكلفة الإرسال وفق عدد الرسائل التي تؤكد ميتا وصولها فعليًا، وأي كمية إضافية تتطلب موافقة العميل."
    ]
  },
  {
    name: "إعداد وتجهيز الرقم",
    defaultPriceHalalas: 240000,
    lineNameTemplate: "إعداد وتجهيز الرقم",
    descriptionTemplate: "تهيئة الرقم وربطه بمنصة لنكلي",
    fields: [],
    priceFormula: "",
    terms: []
  },
  {
    name: "التوثيق التجاري ورفع حد الإرسال",
    defaultPriceHalalas: 60000,
    lineNameTemplate: "التوثيق التجاري ورفع حد الإرسال",
    descriptionTemplate: "تجهيز الطلبات ومتابعتها مع ميتا",
    fields: [],
    priceFormula: "",
    terms: ["تشمل الرسوم تجهيز طلبات القالب والتوثيق ورفع حد الإرسال، ويعود قرار الموافقة وتحديد الحد إلى ميتا."]
  }
];

/** The notes that always close the terms. */
export const CLOSING_TERMS = ["هذا عرض سعر، وتصدر الفاتورة الضريبية عند اعتماد الطلب وفق بيانات المنشأة."];

/** Terms made of the services' own notes (with their fields filled in) and the closing note, without repeats. */
export function termsForLines(services: QuoteServiceDef[], lines: QuoteLineInput[]): string[] {
  const terms: string[] = [];
  for (const line of lines) {
    const service = services.find((item) => item.id === line.serviceId);
    if (!service) continue;
    const values = { ...line.fields, messages: number(line.fields.messages).toLocaleString("en-US") };
    for (const term of service.terms) {
      const text = fill(term, values);
      if (text && !terms.includes(text)) terms.push(text);
    }
  }
  for (const term of CLOSING_TERMS) if (!terms.includes(term)) terms.push(term);
  return terms;
}
