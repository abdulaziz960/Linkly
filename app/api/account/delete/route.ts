import { NextRequest, NextResponse } from "next/server";
import { authCookieName, getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { deleteTenant, logAdminAction } from "../../../../lib/subscriptions";

export const runtime = "nodejs";

/**
 * Self-serve counterpart of deleteTenant() - the function already existed
 * (and is fully tested) but was never reachable from anywhere except a
 * manual DB script, leaving the account/data-deletion promise in the
 * Privacy Policy and /data-deletion unfulfillable in practice. Requires the
 * account owner to retype the exact company name (checked server-side, not
 * just gated in the UI) before an irreversible, whole-tenant delete runs.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  if (user.role !== "مالك الحساب") return NextResponse.json({ error: "حذف الحساب متاح لمالك الحساب فقط" }, { status: 403 });

  const { confirmCompanyName } = await request.json().catch(() => ({})) as { confirmCompanyName?: string };
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
  if (!subscription) return NextResponse.json({ error: "الاشتراك غير موجود" }, { status: 404 });
  if (!confirmCompanyName || confirmCompanyName.trim() !== subscription.companyName) {
    return NextResponse.json({ error: "اسم الشركة المكتوب لا يطابق اسم الشركة المسجل" }, { status: 400 });
  }

  const { companyName } = await deleteTenant(user.tenantId);
  // Logged under "system", not the just-deleted tenant (deleteTenant already
  // wipes that tenant's own admin_logs rows), so this survives as a
  // platform-wide audit trail of self-service deletions.
  await logAdminAction(
    "system",
    "النظام",
    `تم حذف حساب "${companyName}" (${user.tenantId}) ذاتيًا بواسطة مالك الحساب ${user.name} (${user.email}).`,
    "تنبيه"
  );

  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
}
