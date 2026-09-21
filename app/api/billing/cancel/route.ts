import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

/**
 * There is no auto-charge in this app - a subscription always lapses on
 * its own at renewalAt if the owner never returns to pay again. So
 * "cancelling" doesn't change access or billing at all; it only records
 * the owner's intent (cancelledAt) so /billing can say "cancelled, access
 * until <renewalAt>" instead of implying a renewal that was never coming,
 * and so the renewal-reminder cron stops nagging someone who already said
 * they're done. "resume" clears it before the period actually lapses.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  if (user.role !== "مالك الحساب") return NextResponse.json({ error: "إدارة الاشتراك متاحة لمالك الحساب" }, { status: 403 });

  const { action } = await request.json().catch(() => ({ action: "" })) as { action?: string };
  if (action !== "cancel" && action !== "resume") {
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  }

  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
  if (!subscription) return NextResponse.json({ error: "الاشتراك غير موجود" }, { status: 404 });
  if (subscription.status !== "نشط") {
    return NextResponse.json({ error: "الإلغاء متاح فقط للاشتراكات المدفوعة النشطة" }, { status: 400 });
  }

  const updated = await prisma.subscription.update({
    where: { tenantId: user.tenantId },
    data: { cancelledAt: action === "cancel" ? new Date().toISOString() : "", updatedAt: new Date().toISOString() }
  });

  return NextResponse.json({ subscription: updated });
}
