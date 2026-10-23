import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { claimSallaPendingLink, getSallaPendingLink } from "../../../../lib/salla-install";

export const runtime = "nodejs";

/** A store installed from Salla whose owner email already has a Linkly account waits for that owner here. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "مالك الحساب") return NextResponse.json({ pending: null });
  return NextResponse.json({ pending: await getSallaPendingLink(user.email) });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  if (user.role !== "مالك الحساب") return NextResponse.json({ error: "ربط المتجر متاح لمالك الحساب فقط." }, { status: 403 });
  const claimed = await claimSallaPendingLink(user.tenantId, user.email);
  if (!claimed) return NextResponse.json({ error: "لا يوجد متجر سلة بانتظار الربط لبريدك." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
