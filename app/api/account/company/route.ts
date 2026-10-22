import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { normalizeCompanyName } from "../../../../lib/company-name";
import { logAdminAction } from "../../../../lib/subscriptions";
import { isTrustedOrigin } from "../../../../lib/origin-guard";

export const runtime = "nodejs";

/** The account owner renames their company (lib/company-name.ts). */
export async function PATCH(request: NextRequest) {
  if (!isTrustedOrigin(request)) return NextResponse.json({ error: "الطلب مرفوض (مصدر غير موثوق)" }, { status: 403 });
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  if (user.role !== "مالك الحساب") return NextResponse.json({ error: "تعديل اسم الشركة متاح لمالك الحساب فقط" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { companyName?: unknown };
  const result = normalizeCompanyName(body.companyName);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId }, select: { companyName: true } });
  if (!subscription) return NextResponse.json({ error: "الاشتراك غير موجود" }, { status: 404 });
  if (subscription.companyName !== result.name) {
    await prisma.subscription.update({ where: { tenantId: user.tenantId }, data: { companyName: result.name, updatedAt: new Date().toISOString() } });
    await logAdminAction(user.tenantId, result.name, `غيّر مالك الحساب (${user.name}) اسم الشركة من "${subscription.companyName}" إلى "${result.name}".`, "معلومة", "العميل");
  }
  return NextResponse.json({ ok: true, companyName: result.name });
}
