import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getIntegrationSettings } from "@/lib/database";
import { syncGmailInbox } from "@/lib/google-gmail";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const settings = await getIntegrationSettings("email", user.tenantId);
  if (!settings.googleRefreshToken || !settings.phoneNumber) {
    return NextResponse.json({ error: "اربط حساب Gmail أولاً" }, { status: 400 });
  }

  try {
    const result = await syncGmailInbox({
      tenantId: user.tenantId,
      refreshToken: settings.googleRefreshToken,
      accountEmail: settings.phoneNumber
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Gmail sync failed", error);
    return NextResponse.json({ error: "تعذرت مزامنة البريد حالياً" }, { status: 502 });
  }
}
