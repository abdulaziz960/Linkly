import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

/**
 * Self-serve email 2FA toggle (dashboard profile → security panel). No
 * re-verification step to turn it on/off - matches the simplicity of the
 * existing bot-settings toggle (app/api/bot/settings/route.ts).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });

  const account = await prisma.userAccount.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true } });
  return NextResponse.json({ enabled: account?.twoFactorEnabled === 1 });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });

  const rateLimit = await consumeRateLimit("account-two-factor", requestIdentifier(request, user.id), 8, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "محاولات كثيرة. حاول مرة أخرى بعد قليل" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "قيمة غير صالحة" }, { status: 400 });

  await prisma.userAccount.update({ where: { id: user.id }, data: { twoFactorEnabled: body.enabled ? 1 : 0 } });

  return NextResponse.json({ ok: true, enabled: body.enabled });
}
