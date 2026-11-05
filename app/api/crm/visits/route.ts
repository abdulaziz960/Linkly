import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { availableDays, bookVisit, deleteVisit, getVisitSettings, listVisits, saveVisitSettings, updateVisitStatus } from "../../../../lib/crm-visits";
import { getProject } from "../../../../lib/crm-projects";
import { leadWhatsappNumber } from "../../../../lib/phone-format";
import { prisma } from "../../../../lib/prisma";
import { isTrustedOrigin } from "../../../../lib/origin-guard";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

async function findConversationByPhone(tenantId: string, rawPhone: string): Promise<string> {
  const phones = [...new Set([rawPhone.trim(), leadWhatsappNumber(rawPhone)].filter(Boolean))];
  const conversation = await prisma.conversation.findFirst({ where: { tenantId, customer: { phone: { in: phones } } }, orderBy: { lastActivityAt: "desc" }, select: { id: true } });
  return conversation?.id ?? "";
}

/** The visit schedule: visits in a date range, the daily limit, and how full the coming days are. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "pipeline"))) return jsonError("لا تملك صلاحية الوصول", 403);
  const params = new URL(request.url).searchParams;
  const [visits, settings, days] = await Promise.all([
    listVisits(user.tenantId, { from: params.get("from") ?? undefined, to: params.get("to") ?? undefined }),
    getVisitSettings(user.tenantId),
    availableDays(user.tenantId, { days: 14 })
  ]);
  return jsonOk({ visits, settings, days });
}

async function allowed(request: NextRequest) {
  if (!isTrustedOrigin(request)) return { error: jsonError("الطلب مرفوض (مصدر غير موثوق)", 403) };
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("يلزم تسجيل الدخول", 401) };
  if (!(await userHasViewPermission(user, "pipeline"))) return { error: jsonError("لا تملك صلاحية الوصول", 403) };
  return { user };
}

/** Books a visit by hand (an employee). */
export async function POST(request: NextRequest) {
  const auth = await allowed(request);
  if (auth.error) return auth.error;
  const user = auth.user!;
  const body = (await request.json().catch(() => null)) as { date?: string; time?: string; customerName?: string; customerPhone?: string; projectId?: string; notes?: string } | null;
  const project = body?.projectId ? await getProject(user.tenantId, body.projectId) : null;
  if (body?.projectId && !project) return jsonError("المشروع غير موجود", 404);
  // Link the visit to the customer's conversation (found by phone) so it shows on the lead's timeline.
  const conversationId = body?.customerPhone ? await findConversationByPhone(user.tenantId, body.customerPhone) : "";
  const result = await bookVisit({
    tenantId: user.tenantId,
    conversationId,
    date: String(body?.date ?? ""),
    time: String(body?.time ?? ""),
    customerName: body?.customerName,
    customerPhone: body?.customerPhone,
    projectId: project?.id,
    projectName: project?.name,
    projectLimit: project?.dailyVisitLimit,
    bookedBy: user.name || "موظف",
    employee: user.name || "",
    notes: body?.notes
  });
  if (!result.ok) return jsonError(result.message, result.reason === "day_full" || result.reason === "duplicate" ? 409 : 400);
  return jsonOk({ visit: result.visit });
}

export async function PATCH(request: NextRequest) {
  const auth = await allowed(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { id?: string; status?: string } | null;
  const result = await updateVisitStatus(auth.user!.tenantId, String(body?.id ?? ""), body?.status, auth.user!.name);
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({});
}

export async function DELETE(request: NextRequest) {
  const auth = await allowed(request);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!(await deleteVisit(auth.user!.tenantId, String(body?.id ?? ""), auth.user!.name))) return jsonError("الزيارة غير موجودة", 404);
  return jsonOk({});
}

/** The daily visit limit (owner only). */
export async function PUT(request: NextRequest) {
  const auth = await allowed(request);
  if (auth.error) return auth.error;
  if (auth.user!.role !== "مالك الحساب") return jsonError("حد الزيارات متاح لمالك الحساب فقط", 403);
  const body = (await request.json().catch(() => null)) as { dailyLimit?: unknown } | null;
  const result = await saveVisitSettings(auth.user!.tenantId, body?.dailyLimit);
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({ settings: { dailyLimit: result.dailyLimit } });
}
