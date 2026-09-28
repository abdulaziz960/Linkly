import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

/**
 * Only turns auto-renew OFF. There is no "turn it on" here - the only way
 * to enable it is a real completed payment whose owner checked the
 * save-card box (app/api/billing/confirm-payment), which is the whole
 * point: nothing ever gets a saved card without a real charge attaching it.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  if (user.role !== "مالك الحساب") return NextResponse.json({ error: "إدارة الاشتراك متاحة لمالك الحساب" }, { status: 403 });

  const { action } = await request.json().catch(() => ({ action: "" })) as { action?: string };
  if (action !== "disable") return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });

  await ensureSchema();
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
  if (!subscription) return NextResponse.json({ error: "الاشتراك غير موجود" }, { status: 404 });

  const updated = await prisma.subscription.update({
    where: { tenantId: user.tenantId },
    data: { autoRenewEnabled: 0, savedCardToken: "", savedCardLast4: "", savedCardBrand: "", autoRenewFailCount: 0, updatedAt: new Date().toISOString() }
  });

  return NextResponse.json({ subscription: updated });
}
