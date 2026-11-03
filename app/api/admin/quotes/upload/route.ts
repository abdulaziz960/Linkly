import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { prisma } from "../../../../../lib/prisma";
import { attachQuoteFile, createQuote } from "../../../../../lib/quotes/store";
import { parseQuoteInput } from "../../../../../lib/quotes/validate";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Keeps a ready quotation (a PDF made elsewhere) with its amounts, for a client who is new or already has a workspace. It then goes through the same approval and payment steps as any quote. */
export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("طلب غير صالح", 400);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return jsonError("اختر ملف العرض (PDF)", 400);
  if (file.size > MAX_FILE_BYTES) return jsonError("حجم الملف كبير (الحد الأقصى 4 ميجابايت)", 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  // What is kept must really be a PDF: the first bytes say so, whatever the name or the type the browser sent.
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return jsonError("الملف ليس PDF صالحًا", 400);

  const subtotalSar = Number(field(form, "subtotalSar").replace(/[,،\s]/g, ""));
  if (!Number.isFinite(subtotalSar) || subtotalSar <= 0 || subtotalSar > 10_000_000) return jsonError("اكتب مبلغ العرض دون الضريبة", 400);
  const messages = Math.round(Number(field(form, "messages").replace(/[,،\s]/g, "")) || 0);
  if (messages < 0 || messages > 100_000_000) return jsonError("عدد الرسائل غير صحيح", 400);
  const reference = field(form, "reference").slice(0, 60);
  const existingTenantId = field(form, "existingTenantId");
  if (existingTenantId && !(await prisma.subscription.findUnique({ where: { tenantId: existingTenantId }, select: { tenantId: true } }))) return jsonError("العميل المرتبط غير موجود", 400);
  if (!existingTenantId && !field(form, "email")) return jsonError("أدخل بريد العميل (يصله رابط التفعيل بعد الاعتماد)", 400);

  const parsed = parseQuoteInput({
    customerName: field(form, "customerName"), contactName: field(form, "contactName"), email: field(form, "email"), vatNumber: field(form, "vatNumber"),
    billingCycle: field(form, "billingCycle"), issuedOn: field(form, "issuedOn"), paymentTerms: "", existingTenantId,
    lines: [{
      serviceId: "", name: reference ? `عرض سعر ${reference}` : "عرض سعر مرفوع", description: "عرض جاهز (PDF)", quantity: 1, unitPriceSar: subtotalSar,
      vatRate: field(form, "vatRate") === "0" ? 0 : 15, fields: messages > 0 ? { messages: String(messages) } : {}
    }]
  });
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const quote = await createQuote({ ...parsed.input, salesperson: admin.name }, admin.name);
  const name = (file.name.split(/[\\/]/).pop() || "quotation.pdf").slice(0, 120);
  await attachQuoteFile(quote.id, { name, mime: "application/pdf", size: bytes.length, base64: bytes.toString("base64") }, reference);
  await recordAdminAction(admin, "upload-quote", { type: "quote", id: quote.id }, JSON.stringify({ number: quote.number, reference, customer: quote.customerName, total: quote.totalHalalas }));
  return jsonOk({ id: quote.id });
}
