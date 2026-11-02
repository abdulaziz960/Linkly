import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../lib/admin-audit";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { sarToHalalas } from "../../../../lib/quotes/model";
import { listQuoteServices, saveQuoteService } from "../../../../lib/quotes/store";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  return jsonOk(await listQuoteServices(true));
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Adds a service (no id) or edits one (with its id): its name, suggested price, line texts, notes for the terms and whether it can be picked. */
export async function PUT(request: NextRequest) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const admin = await requirePlatformAdmin("billing");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = clean(body?.name, 120);
  if (name.length < 2) return jsonError("اسم الخدمة مطلوب", 400);
  const price = Number(body?.defaultPriceSar ?? 0);
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) return jsonError("السعر غير صحيح", 400);
  const terms = Array.isArray(body?.terms) ? body.terms.map((term) => clean(term, 400)).filter(Boolean).slice(0, 10) : [];
  const id = typeof body?.id === "string" && body.id ? body.id : null;
  try {
    const saved = await saveQuoteService(id, {
      name, defaultPriceHalalas: sarToHalalas(price), descriptionTemplate: clean(body?.descriptionTemplate, 500), lineNameTemplate: clean(body?.lineNameTemplate, 200) || name,
      terms, active: body?.active !== false
    });
    await recordAdminAction(admin, "update-quote-service", { type: "quote-service", id: saved }, name);
    return jsonOk(await listQuoteServices(true));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر حفظ الخدمة", 400);
  }
}
